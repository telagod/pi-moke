/**
 * 墨客快压 — 入境定形 + 折页。无 LLM。
 *
 * 入境：大 tool 结果进会话前定稿（密图或摘录），此后不改。
 * 折页：/compact 与官方阈值走密图卡，开新世纪。
 * 已送前缀不动。不回头 shake / prune。
 */
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { markMokeCompact } from "./compact-guard.ts";
import * as snapfont from "./snapfont.ts";

export const HARD_PERCENT = 85;
export const MIN_SNAP_TOKENS = 3000;
export const SNAP_HEAD_LINES = 16;
export const SNAP_TAIL_LINES = 8;
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

export type AnyMsg = {
	role: string;
	toolName?: string;
	toolCallId?: string;
	content?: unknown;
	[k: string]: unknown;
};

export type Report = {
	snapped: number;
	excerpted: number;
	tokensSaved: number;
};

export function emptyReport(): Report {
	return { snapped: 0, excerpted: 0, tokensSaved: 0 };
}

export function formatReport(r: Report): string {
	return `墨客快压: snap ${r.snapped} excerpt ${r.excerpted} (−${r.tokensSaved} tok)`;
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

export type InventoryItem = {
	tool: string;
	tokens: number;
	age: number;
	shaped: boolean;
};

export function inventory(messages: AnyMsg[], top = 8): InventoryItem[] {
	const items: InventoryItem[] = [];
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role !== "toolResult") continue;
		const t = textOf(m);
		const tokens = estTokensUtf8(t) + 16;
		if (tokens < 80) continue;
		items.push({
			tool: String(m.toolName ?? "?"),
			tokens,
			age: messages.length - 1 - i,
			shaped: isPlaceholder(t),
		});
	}
	items.sort((a, b) => b.tokens - a.tokens);
	return items.slice(0, top);
}

export function formatInventory(items: InventoryItem[]): string {
	if (items.length === 0) return "无大块";
	return items
		.map((it) => `  ${it.tool} ${it.tokens}tok age=${it.age}${it.shaped ? " shaped" : " raw"}`)
		.join("\n");
}

export function formatStatus(messages: AnyMsg[], window: number, vision: boolean): string {
	const used = estimateMessages(messages);
	const pct = window > 0 ? Math.floor((used * 100) / window) : 0;
	const next = window > 0 && used > (window * HARD_PERCENT) / 100 ? "compact" : "idle";
	const items = inventory(messages);
	const rawTok = items.filter((it) => !it.shaped).reduce((n, it) => n + it.tokens, 0);
	const head = `快压 ${used}/${window} (${pct}%) next=${next} vision=${vision ? "yes" : "no"} raw≈${rawTok}`;
	return `${head}\n${formatInventory(items)}`;
}

export function isPlaceholder(s: string): boolean {
	return PREFIXES.some((p) => s.startsWith(p));
}

export function estTokensUtf8(text: string): number {
	let ascii = 0;
	let two = 0;
	let wide = 0;
	for (const ch of text) {
		const n = ch.length === 1 ? (ch.charCodeAt(0) < 0x80 ? 1 : ch.charCodeAt(0) < 0x800 ? 2 : 3) : 4;
		if (n === 1) ascii += 1;
		else if (n === 2) two += 1;
		else wide += 1;
	}
	return Math.floor(ascii / 4) + Math.floor((two * 2) / 3) + wide;
}

export function textOf(m: AnyMsg): string {
	return contentToText(m.content);
}

export function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
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

export type TaskNode = "user" | "goal" | "turn" | "ingress" | "hard";

const GOAL_MARK = /pi-goal-(?:continuation|prompt):/;

export function countUserTurns(messages: AnyMsg[]): number {
	return messages.reduce((n, m) => n + (m.role === "user" ? 1 : 0), 0);
}

export function lastUserIsGoal(messages: AnyMsg[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") return GOAL_MARK.test(textOf(messages[i]));
	}
	return false;
}

export function taskNode(opts: {
	percent?: number | null;
	ingressChanged: boolean;
	newTurn: boolean;
	newUserTurn?: boolean;
	goalActive?: boolean;
}): TaskNode | null {
	if (opts.percent != null && opts.percent >= HARD_PERCENT) return "hard";
	if (opts.ingressChanged) return "ingress";
	if (!opts.newTurn && !opts.newUserTurn) return null;
	if (opts.goalActive) return "goal";
	if (opts.newUserTurn) return "user";
	return "turn";
}

export const PROACTIVE_PERCENT = 40;

export function compactHint(node: TaskNode | null | undefined, percent: number | null | undefined): boolean {
	if (!node || percent == null) return false;
	if (node === "hard") return true;
	if ((node === "goal" || node === "turn") && percent >= PROACTIVE_PERCENT) return true;
	return false;
}

export function canCompactNow(ctx: { isIdle?: () => boolean }): boolean {
	return ctx.isIdle?.() === true;
}

export function usageFooter(
	percent: number | null | undefined,
	tokens?: number | null,
	window?: number,
	node?: TaskNode | null,
): string {
	if (!node || percent == null) return "";
	const pct = Math.floor(percent);
	const span = tokens != null && window ? ` ${tokens}/${window}` : "";
	const hint = compactHint(node, percent) ? ' → context({op:"compact"})' : "";
	return `\n\n[ctx ${pct}%${span} node=${node}${hint}]`;
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

export type IngressOpts = {
	vision?: boolean;
	model?: string;
	toolName?: string;
};

export type IngressShaped = {
	changed: boolean;
	snapped: boolean;
	excerpted: boolean;
	text: string;
	image?: { data: string; mimeType: string };
	tokensSaved: number;
};

function skipTool(name: string | undefined): boolean {
	return name === "skill" || name === "context";
}

export function shapeIngress(text: string, opts: IngressOpts = {}): IngressShaped {
	const keep = { changed: false, snapped: false, excerpted: false, text, tokensSaved: 0 };
	if (!text || isPlaceholder(text) || skipTool(opts.toolName)) return keep;
	const tok = estTokensUtf8(text);
	if (tok < MIN_SNAP_TOKENS) return keep;
	const excerpt = snapExcerpt(text);
	const excerptNotice = `[Snapcompact: ${tok} tokens → excerpt]\n${excerpt}`;
	if (opts.vision === false) {
		return {
			changed: true,
			snapped: false,
			excerpted: true,
			text: excerptNotice,
			tokensSaved: Math.max(0, tok - estTokensUtf8(excerptNotice)),
		};
	}
	const framed = renderGray(text, opts.model);
	if (!framed) {
		return {
			changed: true,
			snapped: false,
			excerpted: true,
			text: excerptNotice,
			tokensSaved: Math.max(0, tok - estTokensUtf8(excerptNotice)),
		};
	}
	const imgTok = estImageTokens(framed.w, framed.h, opts.model);
	const notice = `[Snapcompact: ${tok} tokens → ${framed.w}x${framed.h} PNG ~${imgTok} tokens]\n${excerpt}`;
	const after = estTokensUtf8(notice) + imgTok;
	if (after > tok * SNAP_SAVINGS) {
		const exAfter = estTokensUtf8(excerptNotice);
		if (exAfter < tok) {
			return { changed: true, snapped: false, excerpted: true, text: excerptNotice, tokensSaved: tok - exAfter };
		}
		return keep;
	}
	const png = encodePngGray(framed.pixels, framed.w, framed.h);
	return {
		changed: true,
		snapped: true,
		excerpted: true,
		text: notice,
		image: { data: png.toString("base64"), mimeType: "image/png" },
		tokensSaved: Math.max(0, tok - after),
	};
}

export function applyIngress(m: AnyMsg, opts: IngressOpts = {}): Report {
	const r = emptyReport();
	if (m.role !== "toolResult") return r;
	const shaped = shapeIngress(textOf(m), { ...opts, toolName: m.toolName });
	if (!shaped.changed) return r;
	if (shaped.image) {
		m.content = [
			{ type: "text", text: shaped.text },
			{ type: "image", data: shaped.image.data, mimeType: shaped.image.mimeType },
		];
		r.snapped = 1;
	} else {
		setText(m, shaped.text);
		r.excerpted = 1;
	}
	r.tokensSaved = shaped.tokensSaved;
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

export function loadTypebox(): { Object: (p: unknown) => unknown; Unsafe: (p: unknown) => unknown } | undefined {
	const pick = (mod: { Type?: { Object: (p: unknown) => unknown; Unsafe: (p: unknown) => unknown }; Object?: (p: unknown) => unknown; Unsafe?: (p: unknown) => unknown }) =>
		mod.Type ?? (mod.Object && mod.Unsafe ? { Object: mod.Object, Unsafe: mod.Unsafe } : undefined);
	const from = (filename: string) => {
		const req = createRequire(filename);
		for (const spec of ["typebox", "@sinclair/typebox"] as const) {
			try {
				const got = pick(req(spec));
				if (got) return got;
			} catch {}
		}
		try {
			const piPkg = req.resolve("@earendil-works/pi-coding-agent/package.json");
			return pick(createRequire(piPkg)("typebox"));
		} catch {}
		return undefined;
	};
	return from(import.meta.url) ?? (process.argv[1] ? from(process.argv[1]) : undefined);
}

export function messagesFromBranch(branch: Array<{ type?: string; message?: AnyMsg }>): AnyMsg[] {
	const out: AnyMsg[] = [];
	for (const e of branch) {
		if (e?.type === "message" && e.message) out.push(e.message);
	}
	return out;
}

function shapedContent(shaped: IngressShaped, footer: string): Array<{ type: string; text?: string; data?: string; mimeType?: string }> {
	const text = footer ? shaped.text + footer : shaped.text;
	if (shaped.image) {
		return [
			{ type: "text", text },
			{ type: "image", data: shaped.image.data, mimeType: shaped.image.mimeType },
		];
	}
	return [{ type: "text", text }];
}

export default function mokeFastCompress(pi: ExtensionAPI): void {
	let last: Report | undefined;
	let foldQueued = false;
	let stampedTurn = 0;
	let pendingTurn = false;

	const windowOf = (ctx: { getContextUsage: () => { contextWindow?: number } | undefined }): number =>
		ctx.getContextUsage()?.contextWindow ?? 128 * 1024;

	const visionOf = (ctx: { model?: { id?: string } }): boolean => modelHasVision(ctx.model?.id ?? "");

	const usageOf = (ctx: { getContextUsage: () => { tokens?: number | null; percent?: number | null; contextWindow?: number } | undefined }) =>
		ctx.getContextUsage();

	pi.on("turn_start", () => {
		pendingTurn = true;
	});

	pi.on("tool_result", (event, ctx) => {
		const raw = contentToText(event.content);
		const shaped = shapeIngress(raw, {
			vision: visionOf(ctx),
			model: ctx.model?.id,
			toolName: event.toolName,
		});
		const u = usageOf(ctx);
		const msgs = messagesFromBranch(ctx.sessionManager?.getBranch?.() ?? []);
		const turn = countUserTurns(msgs);
		const node = taskNode({
			percent: u?.percent,
			ingressChanged: shaped.changed,
			newTurn: pendingTurn || turn > stampedTurn,
			newUserTurn: turn > stampedTurn,
			goalActive: lastUserIsGoal(msgs),
		});
		if (node) {
			pendingTurn = false;
			stampedTurn = turn;
		}
		const foot = usageFooter(u?.percent, u?.tokens, u?.contextWindow, node);
		if (!shaped.changed && !foot) return;
		if (shaped.changed) {
			last = {
				snapped: shaped.snapped ? 1 : 0,
				excerpted: shaped.excerpted && !shaped.snapped ? 1 : shaped.excerpted ? 1 : 0,
				tokensSaved: shaped.tokensSaved,
			};
			if (ctx.hasUI && last.tokensSaved > 0) ctx.ui.notify(formatReport(last), "info");
		}
		if (!shaped.changed && foot) {
			if (typeof event.content === "string") return { content: event.content + foot };
			if (Array.isArray(event.content)) {
				const copy = event.content.map((b: { type?: string; text?: string }) =>
					b?.type === "text" && typeof b.text === "string" ? { ...b, text: b.text + foot } : b,
				);
				return { content: copy };
			}
			return { content: [{ type: "text", text: raw + foot }] };
		}
		return { content: shapedContent(shaped, foot) };
	});

	const requestFold = (ctx: { compact: (opts?: { onComplete?: () => void; onError?: () => void }) => void; isIdle?: () => boolean; hasUI?: boolean; ui?: { notify: (m: string, k: string) => void } }, force = false) => {
		const u = usageOf(ctx as { getContextUsage: () => { percent?: number | null } | undefined });
		if (!force && (u?.percent == null || u.percent < HARD_PERCENT) && !foldQueued) return "idle";
		if (!canCompactNow(ctx)) {
			foldQueued = true;
			return "queued";
		}
		foldQueued = false;
		ctx.compact({
			onComplete: () => {
				foldQueued = false;
			},
			onError: () => {
				foldQueued = true;
			},
		});
		return "started";
	};

	pi.on("context", (event, ctx) => {
		const lastCompact = [...(ctx.sessionManager?.getBranch?.() ?? [])].reverse().find((e) => e.type === "compaction");
		const details = lastCompact && typeof lastCompact === "object" ? (lastCompact as { details?: SnapDetails }).details : undefined;
		if (details?.kind === SNAP_KIND) attachSnapFrames(event.messages as AnyMsg[], details);
		const u = usageOf(ctx);
		if (u?.percent != null && u.percent >= HARD_PERCENT) foldQueued = true;
		return { messages: event.messages };
	});

	pi.on("agent_settled", (_event, ctx) => {
		requestFold(ctx);
	});

	pi.on(
		"session_before_compact",
		markMokeCompact(async (event, ctx) => {
			foldQueued = false;
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

	const Type = loadTypebox();
	if (Type) pi.registerTool({
		name: "context",
		label: "Context",
		description: "看窗与大块清单，或预约折页。busy 时只预约，idle 才真正 compact，避免打断 goal。goal/yolo 每回合看 raw，用不到就 compact。",
		promptSnippet: "status 看窗与大块；compact 预约机械折页（不中断本回合）",
		promptGuidelines: [
			"goal/yolo 或换题、大读前用 context({op:\"status\"}) 看 raw 大块；接下来用不到就 context({op:\"compact\"})。",
			"compact 在忙时只预约，回合结束后才折页，不会打断 goal。",
			"不要等窗口七成，也不要空喊上下文满了。",
		],
		parameters: Type.Object({
			op: Type.Unsafe({ type: "string", enum: ["status", "compact"], description: "status 看窗；compact 折页" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const op = String((params as { op?: string }).op ?? "status");
			const msgs = messagesFromBranch(ctx.sessionManager.getBranch());
			const window = windowOf(ctx);
			const status = formatStatus(msgs, window, visionOf(ctx));
			if (op === "compact") {
				const state = requestFold(ctx, true);
				const note = state === "started" ? "已折页" : "已预约折页，本回合结束后执行，不中断 goal";
				return { content: [{ type: "text", text: `${note}。${status}` }] };
			}
			return { content: [{ type: "text", text: status }] };
		},
	});

	pi.registerCommand("fast-compress", {
		description: "墨客快压状态：窗口、是否该折页、是否有视觉",
		handler: async (_args, ctx) => {
			const msgs = messagesFromBranch(ctx.sessionManager.getBranch());
			const status = formatStatus(msgs, windowOf(ctx), visionOf(ctx));
			const prev = last ? formatReport(last) : "尚无入境裁剪";
			if (ctx.hasUI) ctx.ui.notify(`${status} · ${prev}`, "info");
		},
	});
}
