/**
 * 墨客快压 — prune → shake → snap。无 LLM。
 * 挂 context 钩子：只改发出去的副本，磁盘会话仍是全文。
 * 比 omp：同 path 再 read 立刻 supersede；廉价尾不够才深裁；snap 8x13+CJK 按家塑形。
 */
import { deflateSync } from "node:zlib";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { markMokeCompact } from "./compact-guard.ts";
import * as snapfont from "./snapfont.ts";

export const PROTECT_TOKENS = 16 * 1024;
export const MIN_SAVINGS = 4 * 1024;
export const CACHE_WARM_SUFFIX = 8 * 1024;
export const SHAKE_AUTO_PERCENT = 70;
export const SNAP_AUTO_PERCENT = 80;
export const MIN_PRUNE_TOKENS = 50;
export const MIN_SNAP_TOKENS = 3000;
export const FENCE_MIN_TOKENS = 400;
export const SNAP_HEAD_LINES = 16;
export const SNAP_TAIL_LINES = 8;
const PLACEHOLDER = 16;
const SNAP_SAVINGS = 0.85;
const SNAP_EXCERPT_MAX = 2400;

const PREFIXES = [
	"[Output truncated",
	"[Superseded",
	"[Shake elided",
	"[Snapcompact",
	"[Uneventful",
	"[image omitted",
	"[Artifact stored",
] as const;

export type ForceMode = "auto" | "shake" | "snap" | "drop-images";

export type AnyMsg = {
	role: string;
	toolName?: string;
	toolCallId?: string;
	content?: unknown;
	[k: string]: unknown;
};

export type Report = {
	superseded: number;
	pruned: number;
	shaken: number;
	snapped: number;
	imagesDropped: number;
	tokensSaved: number;
};

export function emptyReport(): Report {
	return { superseded: 0, pruned: 0, shaken: 0, snapped: 0, imagesDropped: 0, tokensSaved: 0 };
}

export function addReport(a: Report, b: Report): Report {
	return {
		superseded: a.superseded + b.superseded,
		pruned: a.pruned + b.pruned,
		shaken: a.shaken + b.shaken,
		snapped: a.snapped + b.snapped,
		imagesDropped: a.imagesDropped + b.imagesDropped,
		tokensSaved: a.tokensSaved + b.tokensSaved,
	};
}

export function formatReport(r: Report): string {
	return `墨客快压: supersede ${r.superseded} prune ${r.pruned} shake ${r.shaken} snap ${r.snapped} (−${r.tokensSaved} tok)`;
}

const VISION_MARKERS = [
	"vision",
	"-vl",
	"gpt-4o",
	"gpt-4.1",
	"gpt-5",
	"claude",
	"gemini",
	"grok",
	"pixtral",
	"glm-4v",
	"qwen-vl",
	"qwen2-vl",
	"qwen2.5-vl",
];

export function modelHasVision(model: string): boolean {
	const id = model.toLowerCase();
	return VISION_MARKERS.some((m) => id.includes(m));
}

function clampUtf8(s: string, maxBytes: number): string {
	const buf = Buffer.from(s, "utf8");
	if (buf.length <= maxBytes) return s;
	let end = maxBytes;
	while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
	return buf.subarray(0, end).toString("utf8");
}

export function snapExcerpt(text: string): string {
	const lines = text.split("\n");
	let body: string;
	if (lines.length <= SNAP_HEAD_LINES + SNAP_TAIL_LINES) body = text;
	else {
		const head = lines.slice(0, SNAP_HEAD_LINES).join("\n");
		const tail = lines.slice(-SNAP_TAIL_LINES).join("\n");
		const skipped = lines.length - SNAP_HEAD_LINES - SNAP_TAIL_LINES;
		body = `${head}\n… (${skipped} lines elided; see image) …\n${tail}`;
	}
	return clampUtf8(body, SNAP_EXCERPT_MAX);
}

export function formatStatus(messages: AnyMsg[], window: number, vision: boolean): string {
	const used = estimateMessages(messages);
	const pct = window > 0 ? Math.floor((used * 100) / window) : 0;
	let next = "idle";
	if (window > 0 && used > (window * 85) / 100) next = "rescue-shake";
	else if (window > 0 && used > (window * SNAP_AUTO_PERCENT) / 100) next = vision ? "snap" : "shake";
	else if (window > 0 && used > (window * SHAKE_AUTO_PERCENT) / 100) next = "shake";
	else next = "prune";
	let nSup = 0,
		nTrunc = 0,
		nShake = 0,
		nSnap = 0,
		nImg = 0;
	for (const m of messages) {
		const t = textOf(m);
		if (t.startsWith("[Superseded")) nSup += 1;
		else if (t.startsWith("[Output truncated")) nTrunc += 1;
		else if (t.startsWith("[Shake elided")) nShake += 1;
		else if (t.startsWith("[Snapcompact")) nSnap += 1;
		if (Array.isArray(m.content) && (m.content as Array<{ type?: string }>).some((b) => b?.type === "image")) nImg += 1;
	}
	return `快压 ${used}/${window} (${pct}%) next=${next} vision=${vision ? "yes" : "no"} superseded=${nSup} prune=${nTrunc} shake=${nShake} snap=${nSnap} images=${nImg}`;
}

export function isPlaceholder(s: string): boolean {
	return PREFIXES.some((p) => s.startsWith(p));
}

export function estTokensUtf8(text: string): number {
	let ascii = 0;
	let two = 0;
	let wide = 0;
	for (const ch of text) {
		const n = ch.length === 1 ? ch.charCodeAt(0) < 0x80 ? 1 : ch.charCodeAt(0) < 0x800 ? 2 : 3 : 4;
		if (n === 1) ascii += 1;
		else if (n === 2) two += 1;
		else wide += 1;
	}
	return Math.floor(ascii / 4) + Math.floor((two * 2) / 3) + wide;
}

export function textOf(m: AnyMsg): string {
	const c = m.content;
	if (typeof c === "string") return c;
	if (!Array.isArray(c)) return "";
	return c
		.filter((b: { type?: string; text?: string }) => b?.type === "text" && typeof b.text === "string")
		.map((b: { text: string }) => b.text)
		.join("\n");
}

export function setText(m: AnyMsg, s: string): void {
	if (typeof m.content === "string") {
		m.content = s;
		return;
	}
	m.content = [{ type: "text", text: s }];
}

function findTool(messages: AnyMsg[], callId: string): { name: string; args: Record<string, unknown> } | undefined {
	for (const m of messages) {
		if (m.role === "toolResult" && m.toolCallId === callId && typeof m.toolName === "string") {
			// fall through to assistant lookup for args
		}
		if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const b of m.content as Array<{ type?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>) {
			if (b?.type === "toolCall" && b.id === callId) {
				return { name: String(b.name ?? ""), args: b.arguments ?? {} };
			}
		}
	}
	return undefined;
}

function readPath(ref: { name: string; args: Record<string, unknown> }): string | undefined {
	if (ref.name !== "read") return undefined;
	const p = ref.args.path;
	return typeof p === "string" && p.length > 0 ? p : undefined;
}

function isSkill(ref: { name: string }): boolean {
	return ref.name === "skill";
}

function suffixTokens(messages: AnyMsg[]): number[] {
	const out = new Array<number>(messages.length);
	let acc = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		out[i] = acc;
		acc += estTokensUtf8(textOf(messages[i])) + 16;
	}
	return out;
}

export function applyPrune(messages: AnyMsg[]): Report {
	const r = emptyReport();
	if (messages.length === 0) return r;
	const suffix = suffixTokens(messages);
	const seen = new Set<string>();

	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role !== "toolResult") continue;
		const body = textOf(m);
		if (isPlaceholder(body) || !m.toolCallId) continue;
		const ref = findTool(messages, String(m.toolCallId));
		if (!ref || isSkill(ref)) continue;
		const path = readPath(ref);
		if (!path) continue;
		if (seen.has(path)) {
			const tok = estTokensUtf8(body);
			setText(m, `[Superseded by a newer read of ${path}]`);
			r.superseded += 1;
			r.tokensSaved += Math.max(0, tok - PLACEHOLDER);
		} else {
			seen.add(path);
		}
	}

	let protectedTok = 0;
	let firstProtected = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role !== "toolResult") continue;
		if (protectedTok >= PROTECT_TOKENS) break;
		protectedTok += estTokensUtf8(textOf(messages[i]));
		firstProtected = i;
	}

	type Victim = { i: number; gain: number };
	const cheap: Victim[] = [];
	const deep: Victim[] = [];
	let cheapSave = 0;
	let deepSave = 0;
	for (let j = 0; j < firstProtected; j++) {
		const m = messages[j];
		if (m.role !== "toolResult") continue;
		const body = textOf(m);
		if (isPlaceholder(body) || !m.toolCallId) continue;
		const ref = findTool(messages, String(m.toolCallId));
		if (!ref || isSkill(ref) || readPath(ref)) continue;
		const tok = estTokensUtf8(body);
		if (tok < MIN_PRUNE_TOKENS) continue;
		const gain = Math.max(0, tok - PLACEHOLDER);
		deep.push({ i: j, gain });
		deepSave += gain;
		if (suffix[j] <= CACHE_WARM_SUFFIX) {
			cheap.push({ i: j, gain });
			cheapSave += gain;
		}
	}
	const victims = cheapSave >= MIN_SAVINGS ? cheap : deepSave >= MIN_SAVINGS ? deep : [];
	for (const v of victims) {
		const tok = estTokensUtf8(textOf(messages[v.i]));
		setText(messages[v.i], `[Output truncated - ${tok} tokens]`);
		r.pruned += 1;
		r.tokensSaved += Math.max(0, tok - PLACEHOLDER);
	}
	return r;
}

export function dropImages(messages: AnyMsg[]): number {
	let n = 0;
	for (const m of messages) {
		if (!Array.isArray(m.content)) continue;
		const before = (m.content as Array<{ type?: string }>).length;
		m.content = (m.content as Array<{ type?: string }>).filter((b) => b?.type !== "image");
		n += before - (m.content as unknown[]).length;
	}
	return n;
}

function isTagChar(c: string): boolean {
	return /[A-Za-z0-9_.:-]/.test(c);
}

function findCloseTag(text: string, from: number, tag: string): number | undefined {
	for (let i = from; i + 3 + tag.length <= text.length; i++) {
		if (text[i] !== "<" || text[i + 1] !== "/") continue;
		if (!text.startsWith(tag, i + 2)) continue;
		const after = i + 2 + tag.length;
		if (after < text.length && isTagChar(text[after])) continue;
		const gt = text.indexOf(">", after);
		if (gt < 0) return undefined;
		return gt + 1;
	}
	return undefined;
}

function collectXml(text: string, ranges: Array<{ start: number; end: number; kind: string }>): void {
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "<") {
			i += 1;
			continue;
		}
		const nxt = text[i + 1];
		if (!nxt || nxt === "/" || nxt === "!" || nxt === "?" || nxt === " ") {
			i += 1;
			continue;
		}
		let tagEnd = i + 1;
		while (tagEnd < text.length && isTagChar(text[tagEnd])) tagEnd += 1;
		if (tagEnd === i + 1) {
			i += 1;
			continue;
		}
		const tag = text.slice(i + 1, tagEnd);
		let gt = tagEnd;
		while (gt < text.length && text[gt] !== ">") gt += 1;
		if (gt >= text.length) break;
		if (gt > tagEnd && text[gt - 1] === "/") {
			i = gt + 1;
			continue;
		}
		const close = findCloseTag(text, gt + 1, tag);
		if (close === undefined) {
			i += 1;
			continue;
		}
		const tok = estTokensUtf8(text.slice(i, close));
		if (tok >= FENCE_MIN_TOKENS) ranges.push({ start: i, end: close, kind: "xml" });
		i = close;
	}
}

function elideFences(text: string): string | undefined {
	const ranges: Array<{ start: number; end: number; kind: string }> = [];
	let inFence = false;
	let fenceStart = 0;
	let lineStart = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i !== text.length && text[i] !== "\n") continue;
		const line = text.slice(lineStart, i);
		const trimmed = line.trim();
		const isFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");
		if (isFence) {
			if (!inFence) {
				inFence = true;
				fenceStart = lineStart;
			} else {
				inFence = false;
				const tok = estTokensUtf8(text.slice(fenceStart, i));
				if (tok >= FENCE_MIN_TOKENS) ranges.push({ start: fenceStart, end: i, kind: "fence" });
			}
		}
		lineStart = i + 1;
	}
	collectXml(text, ranges);
	ranges.sort((a, b) => a.start - b.start);
	const kept: typeof ranges = [];
	let lastEnd = -1;
	for (const rg of ranges) {
		if (rg.start < lastEnd) continue;
		kept.push(rg);
		lastEnd = rg.end;
	}
	if (kept.length === 0) return undefined;
	let out = "";
	let cursor = 0;
	for (const rg of kept) {
		out += text.slice(cursor, rg.start);
		const tok = estTokensUtf8(text.slice(rg.start, rg.end));
		out += rg.kind === "xml" ? `[Shake elided xml - ${tok} tokens]` : `[Shake elided fence - ${tok} tokens]`;
		cursor = rg.end;
	}
	out += text.slice(cursor);
	return out;
}

export function applyShake(messages: AnyMsg[], opts: { protectTokens: number; minSavings: number }): Report {
	const r = emptyReport();
	if (messages.length === 0) return r;

	let accAfter = 0;
	let limit = 0;
	if (opts.protectTokens === 0) {
		limit = messages.length;
	} else {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (accAfter >= opts.protectTokens) {
				limit = i + 1;
				break;
			}
			accAfter += estTokensUtf8(textOf(messages[i])) + 16;
		}
	}

	const victims: number[] = [];
	let savings = 0;
	for (let j = 0; j < limit; j++) {
		const m = messages[j];
		if (m.role === "toolResult") {
			const body = textOf(m);
			if (isPlaceholder(body) || !m.toolCallId) continue;
			const ref = findTool(messages, String(m.toolCallId));
			if (!ref || isSkill(ref)) continue;
			const tok = estTokensUtf8(body);
			if (tok < MIN_PRUNE_TOKENS) continue;
			savings += Math.max(0, tok - PLACEHOLDER);
			victims.push(j);
			continue;
		}
		if (m.role === "user" || m.role === "assistant") {
			const body = textOf(m);
			const stripped = elideFences(body);
			if (!stripped) continue;
			const before = estTokensUtf8(body);
			const after = estTokensUtf8(stripped);
			if (after + FENCE_MIN_TOKENS < before) {
				setText(m, stripped);
				r.shaken += 1;
				r.tokensSaved += before - after;
			}
		}
	}
	if (savings < opts.minSavings && r.shaken === 0) return r;
	if (savings >= opts.minSavings) {
		for (const j of victims) {
			const tok = estTokensUtf8(textOf(messages[j]));
			setText(messages[j], `[Shake elided - ${tok} tokens]`);
			r.shaken += 1;
			r.tokensSaved += Math.max(0, tok - PLACEHOLDER);
		}
	}
	return r;
}

function asciiRatio(s: string): number {
	if (s.length === 0) return 1;
	let n = 0;
	for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x80) n += 1;
	return n / s.length;
}

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
	return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const te = new TextEncoder();
	const tag = te.encode(type);
	const body = new Uint8Array(tag.length + data.length);
	body.set(tag, 0);
	body.set(data, tag.length);
	const out = new Uint8Array(8 + data.length + 4);
	out.set(u32be(data.length), 0);
	out.set(body, 4);
	out.set(u32be(crc32(body)), 8 + data.length);
	return out;
}

export function encodePngGray(pixels: Uint8Array, w: number, h: number): Buffer {
	const raw = Buffer.alloc((w + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[(w + 1) * y] = 0;
		raw.set(pixels.subarray(y * w, y * w + w), (w + 1) * y + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 0;
	const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
	const parts = [
		Buffer.from(sig),
		Buffer.from(pngChunk("IHDR", ihdr)),
		Buffer.from(pngChunk("IDAT", deflateSync(raw))),
		Buffer.from(pngChunk("IEND", new Uint8Array())),
	];
	return Buffer.concat(parts);
}

const BOX = [0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f];
/** 可打印 ASCII 5×7，下标 = code-32。 */
const FONT5X7: number[][] = [
	[0, 0, 0, 0, 0, 0, 0],
	[0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x00],
	[0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00],
	[0x0a, 0x1f, 0x0a, 0x0a, 0x1f, 0x0a, 0x00],
	[0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
	[0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
	[0x08, 0x14, 0x14, 0x08, 0x15, 0x12, 0x0d],
	[0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
	[0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
	[0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
	[0x00, 0x0a, 0x04, 0x1f, 0x04, 0x0a, 0x00],
	[0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
	[0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
	[0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
	[0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00],
	[0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
	[0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
	[0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
	[0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
	[0x1f, 0x01, 0x02, 0x06, 0x01, 0x11, 0x0e],
	[0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
	[0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
	[0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
	[0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
	[0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
	[0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
	[0x00, 0x04, 0x00, 0x00, 0x04, 0x00, 0x00],
	[0x00, 0x04, 0x00, 0x00, 0x04, 0x04, 0x08],
	[0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
	[0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
	[0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
	[0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
	[0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
	[0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
	[0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
	[0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
	[0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
	[0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
	[0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
	[0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
	[0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
	[0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
	[0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
	[0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
	[0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
	[0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
	[0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
	[0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
	[0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
	[0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
	[0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
	[0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
	[0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
	[0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
	[0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
	[0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
	[0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
	[0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
	[0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
	[0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
	[0x10, 0x10, 0x08, 0x04, 0x02, 0x01, 0x01],
	[0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
	[0x04, 0x0a, 0x11, 0x00, 0x00, 0x00, 0x00],
	[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
	[0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
	[0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
	[0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
	[0x00, 0x00, 0x0e, 0x11, 0x10, 0x11, 0x0e],
	[0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
	[0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
	[0x06, 0x08, 0x08, 0x1c, 0x08, 0x08, 0x08],
	[0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x0e],
	[0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
	[0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
	[0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
	[0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
	[0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
	[0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
	[0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
	[0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
	[0x00, 0x00, 0x1e, 0x11, 0x1e, 0x10, 0x10],
	[0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x01],
	[0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
	[0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
	[0x08, 0x08, 0x1c, 0x08, 0x08, 0x08, 0x06],
	[0x00, 0x00, 0x11, 0x11, 0x11, 0x11, 0x0f],
	[0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
	[0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
	[0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
	[0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
	[0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
	[0x02, 0x04, 0x04, 0x08, 0x04, 0x04, 0x02],
	[0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
	[0x08, 0x04, 0x04, 0x02, 0x04, 0x04, 0x08],
	[0x00, 0x00, 0x08, 0x15, 0x02, 0x00, 0x00],
];



function renderGray(text: string, model?: string): { pixels: Uint8Array; w: number; h: number } | undefined {
	const shape = snapfont.resolveShape(model);
	const excerptTok = Math.min(estTokensUtf8(snapExcerpt(text)) + 48, 800);
	const tok = estTokensUtf8(text);
	const rows = snapfont.maxRows(tok, excerptTok, shape);
	return snapfont.raster(text, shape, rows);
}

function estImageTokens(w: number, h: number, model?: string): number {
	return snapfont.estImageTokens(w, h, snapfont.familyOf(model));
}

function snapEligible(messages: AnyMsg[], j: number): boolean {
	const m = messages[j];
	if (m.role !== "toolResult") return false;
	const body = textOf(m);
	if (isPlaceholder(body) || !m.toolCallId) return false;
	const ref = findTool(messages, String(m.toolCallId));
	if (!ref || isSkill(ref)) return false;
	const tok = estTokensUtf8(body);
	if (tok < MIN_SNAP_TOKENS) return false;
	return true;
}

export function applySnap(messages: AnyMsg[], opts?: { vision?: boolean; model?: string }): Report {
	const r = emptyReport();
	if (opts?.vision === false) return r;
	const suffix = suffixTokens(messages);
	const cheap: number[] = [];
	const deep: number[] = [];
	for (let j = 0; j < messages.length; j++) {
		if (!snapEligible(messages, j)) continue;
		deep.push(j);
		if (suffix[j] <= CACHE_WARM_SUFFIX) cheap.push(j);
	}
	const victims = cheap.length > 0 ? cheap : deep;
	for (const j of victims) {
		const m = messages[j];
		const body = textOf(m);
		const tok = estTokensUtf8(body);
		const framed = renderGray(body, opts?.model);
		if (!framed) continue;
		const imgTok = estImageTokens(framed.w, framed.h, opts?.model);
		const excerpt = snapExcerpt(body);
		const notice = `[Snapcompact: ${tok} tokens → ${framed.w}x${framed.h} PNG ~${imgTok} tokens]\n${excerpt}`;
		const after = estTokensUtf8(notice) + imgTok;
		if (after > tok * SNAP_SAVINGS) continue;
		const png = encodePngGray(framed.pixels, framed.w, framed.h);
		m.content = [
			{ type: "text", text: notice },
			{ type: "image", data: png.toString("base64"), mimeType: "image/png" },
		];
		r.snapped += 1;
		r.tokensSaved += Math.max(0, tok - after);
	}
	return r;
}

export function estimateMessages(messages: AnyMsg[]): number {
	let n = 0;
	for (const m of messages) n += estTokensUtf8(textOf(m)) + 16;
	return n;
}

const SNAP_KIND = "moke-snap";

export type SnapFrame = { data: string; w: number; h: number };
export type SnapDetails = { kind: typeof SNAP_KIND; frames: SnapFrame[] };

export function serializeMessages(messages: AnyMsg[]): string {
	const parts: string[] = [];
	for (const m of messages) {
		const role = String(m.role ?? "?");
		let body = role === "compactionSummary" ? String((m as { summary?: string }).summary ?? "") : textOf(m);
		if (body.length > 8000) body = `${body.slice(0, 8000)}\n…`;
		parts.push(`[${role}] ${body}`);
	}
	return parts.join("\n\n");
}

function formatFileOps(fileOps?: { read?: Iterable<string>; written?: Iterable<string>; edited?: Iterable<string> }): string {
	if (!fileOps) return "";
	const lines: string[] = [];
	const read = [...(fileOps.read ?? [])].slice(0, 40);
	const written = [...(fileOps.written ?? [])].slice(0, 20);
	const edited = [...(fileOps.edited ?? [])].slice(0, 20);
	if (read.length) lines.push(`read: ${read.join(", ")}`);
	if (written.length) lines.push(`written: ${written.join(", ")}`);
	if (edited.length) lines.push(`edited: ${edited.join(", ")}`);
	return lines.length ? `FILES\n${lines.join("\n")}\n` : "";
}

export function buildCompactPayload(opts: {
	text: string;
	tokensBefore: number;
	fileOps?: { read?: Iterable<string>; written?: Iterable<string>; edited?: Iterable<string> };
	previousSummary?: string;
	customInstructions?: string;
	model?: string;
	vision?: boolean;
}): { summary: string; details: SnapDetails } {
	const frames: SnapFrame[] = [];
	if (opts.vision !== false && opts.text.length > 0) {
		const framed = renderGray(opts.text, opts.model);
		if (framed) {
			const png = encodePngGray(framed.pixels, framed.w, framed.h);
			frames.push({ data: png.toString("base64"), w: framed.w, h: framed.h });
		}
	}
	const head = frames.length
		? `[Snapcompact] Discarded history (~${opts.tokensBefore} tok) is in the attached PNG. Read the pixel font as the prior conversation.`
		: `[Snapcompact] Mechanical compact (~${opts.tokensBefore} tok). No vision; excerpt only.`;
	const hint = opts.customInstructions ? `Focus: ${opts.customInstructions}\n` : "";
	const prev = opts.previousSummary ? `PREVIOUS\n${clampUtf8(opts.previousSummary, 1200)}\n` : "";
	const files = formatFileOps(opts.fileOps);
	const excerpt = snapExcerpt(opts.text);
	const summary = `${head}\n${hint}${prev}${files}EXCERPT\n${excerpt}`;
	return { summary, details: { kind: SNAP_KIND, frames } };
}

export function attachSnapFrames(messages: AnyMsg[], details: SnapDetails): void {
	if (!details?.frames?.length) return;
	const already = messages.some((m) => textOf(m).includes("[Snapcompact frames"));
	if (already) return;
	const idx = messages.findIndex((m) => m.role === "compactionSummary");
	const images = details.frames.map((f) => ({ type: "image" as const, data: f.data, mimeType: "image/png" }));
	const injected: AnyMsg = {
		role: "user",
		content: [{ type: "text", text: "[Snapcompact frames — read the dense pixel text as the discarded history.]" }, ...images],
	};
	if (idx >= 0) messages.splice(idx + 1, 0, injected);
	else messages.unshift(injected);
}

export function runPipeline(messages: AnyMsg[], window: number, mode: ForceMode, vision = true, model?: string): Report {
	let r = emptyReport();
	if (mode === "drop-images") {
		r.imagesDropped = dropImages(messages);
		return r;
	}
	r = addReport(r, applyPrune(messages));
	const shakeNow = mode === "shake" || (window > 0 && estimateMessages(messages) > (window * SHAKE_AUTO_PERCENT) / 100);
	if (shakeNow) {
		r = addReport(
			r,
			applyShake(messages, {
				protectTokens: mode === "shake" ? 0 : PROTECT_TOKENS,
				minSavings: mode === "shake" ? 0 : MIN_SAVINGS,
			}),
		);
	}
	const snapNow = mode === "snap" || (window > 0 && estimateMessages(messages) > (window * SNAP_AUTO_PERCENT) / 100);
	if (snapNow) r = addReport(r, applySnap(messages, { vision, model }));
	if (window > 0 && estimateMessages(messages) > (window * 85) / 100) {
		r = addReport(r, applyShake(messages, { protectTokens: 0, minSavings: 0 }));
	}
	return r;
}

export function messagesFromBranch(branch: Array<{ type?: string; message?: AnyMsg }>): AnyMsg[] {
	const out: AnyMsg[] = [];
	for (const e of branch) {
		if (e?.type === "message" && e.message) out.push(e.message);
	}
	return out;
}

export default function mokeFastCompress(pi: ExtensionAPI): void {
	let force: ForceMode = "auto";
	let last: { report: Report; window: number; used: number; mode: ForceMode } | undefined;

	const windowOf = (ctx: { getContextUsage: () => { contextWindow?: number } | undefined }): number =>
		ctx.getContextUsage()?.contextWindow ?? 128 * 1024;

	const visionOf = (ctx: { model?: { id?: string } }): boolean => modelHasVision(ctx.model?.id ?? "");

	const preview = (ctx: {
		sessionManager: { getBranch: () => Array<{ type?: string; message?: AnyMsg }> };
		getContextUsage: () => { contextWindow?: number } | undefined;
		model?: { id?: string };
	}, mode: ForceMode): { report: Report; used: number; window: number } => {
		const msgs = structuredClone(messagesFromBranch(ctx.sessionManager.getBranch()));
		const window = windowOf(ctx);
		const used = estimateMessages(msgs);
		return { report: runPipeline(msgs, window, mode, visionOf(ctx), ctx.model?.id), used, window };
	};

	pi.on("context", (event, ctx) => {
		const window = windowOf(ctx);
		const mode = force;
		force = "auto";
		const used = estimateMessages(event.messages as AnyMsg[]);
		const r = runPipeline(event.messages as AnyMsg[], window, mode, visionOf(ctx), ctx.model?.id);
		const lastCompact = [...(ctx.sessionManager?.getBranch?.() ?? [])].reverse().find((e) => e.type === "compaction");
		const details = lastCompact && typeof lastCompact === "object" ? (lastCompact as { details?: SnapDetails }).details : undefined;
		if (details?.kind === SNAP_KIND) attachSnapFrames(event.messages as AnyMsg[], details);
		last = { report: r, window, used, mode };
		if (ctx.hasUI && (mode !== "auto" || r.tokensSaved >= MIN_SAVINGS)) {
			ctx.ui.notify(formatReport(r), "info");
		}
		return { messages: event.messages };
	});

	pi.registerCommand("shake", {
		description: "墨客快压：撕掉旧 tool 结果与大 fence（不调模型）。/shake images 只丢图",
		getArgumentCompletions: (prefix) => {
			const opts = ["images"];
			return opts.filter((o) => o.startsWith(prefix)).map((o) => ({ value: o, label: o }));
		},
		handler: async (args, ctx) => {
			force = args.trim() === "images" ? "drop-images" : "shake";
			const { report, used, window } = preview(ctx, force);
			last = { report, window, used, mode: force };
			if (ctx.hasUI) {
				ctx.ui.notify(`${formatReport(report)} · 下轮生效 · 现窗 ${used}/${window}`, "info");
			}
		},
	});

	pi.on(
		"session_before_compact",
		markMokeCompact(async (event, ctx) => {
		const prep = event.preparation;
		if (!prep?.messagesToSummarize?.length) return;
		const text = serializeMessages(prep.messagesToSummarize as AnyMsg[]);
		const payload = buildCompactPayload({
			text,
			tokensBefore: prep.tokensBefore,
			fileOps: prep.fileOps,
			previousSummary: prep.previousSummary,
			customInstructions: event.customInstructions,
			model: ctx.model?.id,
			vision: visionOf(ctx),
		});
		const n = payload.details.frames.length;
		if (ctx.hasUI) ctx.ui.notify(n ? `snapcompact ${n} frame(s), no LLM` : "snapcompact excerpt only, no LLM", "info");
		return {
			compaction: {
				summary: payload.summary,
				firstKeptEntryId: prep.firstKeptEntryId,
				tokensBefore: prep.tokensBefore,
				details: payload.details,
			},
		};
		}),
	);

	pi.registerCommand("snap", {
		description: "墨客快压：大段 tool 输出就地打密图（不调模型）",
		handler: async (_args, ctx) => {
			force = "snap";
			const { report, used, window } = preview(ctx, "snap");
			last = { report, window, used, mode: "snap" };
			if (ctx.hasUI) ctx.ui.notify(`${formatReport(report)} · 下轮生效 · 现窗 ${used}/${window}`, "info");
		},
	});

	pi.registerCommand("fast-compress", {
		description: "墨客快压状态：窗口、下一层、是否有视觉、上次裁剪",
		handler: async (_args, ctx) => {
			const msgs = messagesFromBranch(ctx.sessionManager.getBranch());
			const status = formatStatus(msgs, windowOf(ctx), visionOf(ctx));
			const prev = last ? formatReport(last.report) : "尚无裁剪";
			if (ctx.hasUI) ctx.ui.notify(`${status} · 待执行 ${force} · ${prev}`, "info");
		},
	});
}
