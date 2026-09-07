/** Fold card for /compact. Mechanical, no LLM. Old placeholders are dropped, not nested. */

import { SNAP_KIND } from "./config.ts";
import { isPlaceholder, snapExcerpt, textOf } from "./excerpt.ts";
import { encodePngGray } from "./png.ts";
import { clampUtf8, estTokensUtf8 } from "./tokens.ts";
import type { AnyMsg, SnapDetails, SnapFrame } from "./types.ts";
import * as snapfont from "../snapfont.ts";

const FOLD_FILE_MAX = 24;
const FOLD_INTENT_MAX = 3;
const FOLD_INTENT_CHARS = 200;
const FOLD_HEAD_LINES = 16;
const FOLD_TAIL_LINES = 8;
const FOLD_MSG_CLAMP = 400;
const FOLD_CMD_MAX = 16;
const FOLD_ERR_MAX = 8;

const READ_TOOLS = new Set(["read", "read_image", "grep", "glob", "find"]);
const EDIT_TOOLS = new Set(["write", "edit"]);

export type FileOps = {
	read?: Iterable<string>;
	written?: Iterable<string>;
	edited?: Iterable<string>;
};

export type FoldSnapshot = {
	intents: string[];
	reads: string[];
	edits: string[];
	commands: string[];
	errors: string[];
	excerptLines: string[];
	tools: { name: string; n: number }[];
};

function trim(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
	if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
	if (typeof raw !== "string" || !raw.trim()) return {};
	try {
		const value = JSON.parse(raw);
		return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function pushUnique(list: string[], value: unknown, max?: number): void {
	const item = trim(value);
	if (!item) return;
	if (list.includes(item)) return;
	if (max !== undefined && list.length >= max) return;
	list.push(item);
}

function argPath(args: Record<string, unknown>): string {
	for (const key of ["file_path", "path", "workdir", "pattern"]) {
		const v = args[key];
		if (typeof v === "string" && v.trim()) return v.trim();
	}
	return "";
}

function jsonPath(text: string): string {
	const match = String(text).match(/"(?:file_path|path)"\s*:\s*"([^"]+)"/);
	return match ? match[1] : "";
}

function isOldFold(text: string): boolean {
	const value = String(text ?? "");
	return (
		isPlaceholder(value) ||
		value.startsWith("(Conversation compacted") ||
		value.includes("<compacted-summary>")
	);
}

function exitCodeOf(text: string): number | undefined {
	const match = String(text).match(/\[exit code:\s*(-?\d+)\]/i);
	return match ? Number.parseInt(match[1], 10) : undefined;
}

function toolCallsOf(message: AnyMsg): { id: string; name: string; args: Record<string, unknown> }[] {
	const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
	const raw = message.toolCalls;
	if (Array.isArray(raw)) {
		for (const block of raw) {
			if (!block || typeof block !== "object") continue;
			const b = block as { name?: string; id?: string; arguments?: unknown; input?: unknown };
			if (typeof b.name !== "string") continue;
			out.push({
				id: String(b.id ?? ""),
				name: b.name,
				args: parseJsonObject(b.arguments ?? b.input),
			});
		}
	}
	const content = Array.isArray(message.content) ? message.content : [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const b = block as { type?: string; name?: string; id?: string; arguments?: unknown };
		if (b.type === "tool-call" && typeof b.name === "string") {
			out.push({ id: String(b.id ?? ""), name: b.name, args: parseJsonObject(b.arguments) });
		}
	}
	return out;
}

export function inspectMessages(messages: AnyMsg[]): FoldSnapshot {
	const intents: string[] = [];
	const reads: string[] = [];
	const edits: string[] = [];
	const commands: string[] = [];
	const errors: string[] = [];
	const excerptLines: string[] = [];
	const toolCounts = new Map<string, number>();
	const pending = new Map<string, { name: string; args: Record<string, unknown> }>();

	function bumpTool(name: string): void {
		const key = trim(name) || "tool";
		toolCounts.set(key, (toolCounts.get(key) || 0) + 1);
	}

	for (const message of Array.isArray(messages) ? messages : []) {
		if (!message || typeof message !== "object") continue;
		if (message.role === "toolResult") {
			const id = String(message.toolCallId ?? "");
			const pendingCall = pending.get(id) || { name: String(message.toolName ?? "tool"), args: {} };
			pending.delete(id);
			const resultText = textOf(message);
			if (isOldFold(resultText)) continue;
			const path = argPath(pendingCall.args) || jsonPath(resultText);
			const command = trim(pendingCall.args.command);
			const exit = exitCodeOf(resultText);
			const failed = message.isError === true || (exit !== undefined && exit !== 0);
			bumpTool(pendingCall.name);
			if (READ_TOOLS.has(pendingCall.name)) pushUnique(reads, path, FOLD_FILE_MAX);
			if (EDIT_TOOLS.has(pendingCall.name)) pushUnique(edits, path, FOLD_FILE_MAX);
			if (command) pushUnique(commands, exit === undefined ? command : `${command} -> ${exit}`, FOLD_CMD_MAX);
			if (failed) {
				errors.push(`${pendingCall.name}: ${clampUtf8(command || path || pendingCall.name, 160)}`);
				if (errors.length > FOLD_ERR_MAX) errors.shift();
			}
			excerptLines.push(`[tool] ${clampUtf8([pendingCall.name, path || command].filter(Boolean).join(" "), FOLD_MSG_CLAMP)}`);
			continue;
		}
		for (const call of toolCallsOf(message)) {
			pending.set(call.id, { name: call.name, args: call.args });
		}
		const text = textOf(message).trim();
		if (!text || isOldFold(text)) continue;
		if (message.role === "user") {
			intents.push(text);
			excerptLines.push(`[user] ${clampUtf8(text.replace(/\s+/g, " "), FOLD_MSG_CLAMP)}`);
		} else if (message.role === "assistant") {
			excerptLines.push(`[assistant] ${clampUtf8(text.replace(/\s+/g, " "), FOLD_MSG_CLAMP)}`);
		}
	}

	const tools = [...toolCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([name, n]) => ({ name, n }));
	return { intents, reads, edits, commands, errors, excerptLines, tools };
}

function mergeFileOps(snapshot: FoldSnapshot, fileOps?: FileOps): void {
	if (!fileOps) return;
	for (const path of fileOps.read ?? []) pushUnique(snapshot.reads, path, FOLD_FILE_MAX);
	for (const path of fileOps.written ?? []) pushUnique(snapshot.edits, path, FOLD_FILE_MAX);
	for (const path of fileOps.edited ?? []) pushUnique(snapshot.edits, path, FOLD_FILE_MAX);
}

function headTail(lines: string[], head: number, tail: number): string[] {
	if (lines.length <= head + tail) return lines.slice();
	return [...lines.slice(0, head), "...", ...lines.slice(lines.length - tail)];
}

function bullet(items: string[]): string {
	return items.map((item) => `- ${item}`).join("\n");
}

export function renderFold(
	snapshot: FoldSnapshot,
	options: {
		discardedTokens?: number;
		previousSummary?: string;
		customInstructions?: string;
		fallbackExcerpt?: string;
	} = {},
): string {
	const discardedTok = options.discardedTokens ?? 0;
	const files: string[] = [];
	for (const path of snapshot.edits) pushUnique(files, `[edit] ${path}`, FOLD_FILE_MAX);
	for (const path of snapshot.reads) pushUnique(files, `[read] ${path}`, FOLD_FILE_MAX);
	const intents = snapshot.intents
		.slice(-FOLD_INTENT_MAX)
		.map((text) => clampUtf8(String(text).replace(/\s+/g, " "), FOLD_INTENT_CHARS));
	const excerpt = snapshot.excerptLines.length
		? headTail(snapshot.excerptLines, FOLD_HEAD_LINES, FOLD_TAIL_LINES)
		: options.fallbackExcerpt
			? options.fallbackExcerpt.split("\n")
			: [];
	const sections: string[] = [];
	sections.push(
		`[Snapcompact] Fold ~${discardedTok} tok. Exact file bytes are not stored — re-read with offset/limit if a detail matters.`,
	);
	if (options.customInstructions) sections.push(`Focus: ${options.customInstructions}`);
	if (options.previousSummary) sections.push(`PREVIOUS\n${clampUtf8(options.previousSummary, 1200)}`);
	if (files.length) sections.push(`FILES\n${bullet(files)}`);
	if (intents.length) sections.push(`INTENTS\n${bullet(intents)}`);
	if (snapshot.tools.length) {
		sections.push(`TOOLS\n${bullet(snapshot.tools.slice(0, 16).map((item) => `${item.name} ${item.n}`))}`);
	}
	if (snapshot.commands.length) {
		sections.push(`COMMANDS\n${bullet(snapshot.commands.slice(-FOLD_CMD_MAX).map((item) => clampUtf8(item, 220)))}`);
	}
	if (snapshot.errors.length) sections.push(`ERRORS\n${bullet(snapshot.errors.slice(-FOLD_ERR_MAX))}`);
	if (excerpt.length) sections.push(`EXCERPT\n${excerpt.join("\n")}`);
	return sections.join("\n");
}

export function buildFold(messages: AnyMsg[], options: { discardedTokens?: number; fileOps?: FileOps } = {}): string {
	const snapshot = inspectMessages(messages);
	mergeFileOps(snapshot, options.fileOps);
	const discardedTokens =
		options.discardedTokens ??
		(Array.isArray(messages) ? messages.reduce((n, m) => n + estTokensUtf8(textOf(m)), 0) : 0);
	return renderFold(snapshot, { discardedTokens });
}

export function serializeMessages(messages: AnyMsg[]): string {
	const parts: string[] = [];
	for (const m of messages) {
		const role = String(m.role ?? "?");
		let body = role === "compactionSummary" ? String(m.summary ?? "") : textOf(m);
		if (body.length > 8000) body = `${body.slice(0, 8000)}\n…`;
		parts.push(`[${role}] ${body}`);
	}
	return parts.join("\n\n");
}

function rasterFrames(text: string, model?: string): SnapFrame[] {
	if (!text) return [];
	const shape = snapfont.resolveShape(model);
	const excerptTok = Math.min(estTokensUtf8(snapExcerpt(text)) + 48, 800);
	const tok = estTokensUtf8(text);
	const rows = snapfont.maxRows(tok, excerptTok, shape);
	const framed = snapfont.raster(text, shape, rows);
	if (!framed) return [];
	const png = encodePngGray(framed.pixels, framed.w, framed.h);
	return [{ data: png.toString("base64"), w: framed.w, h: framed.h }];
}

export function buildCompactPayload(opts: {
	text?: string;
	messages?: AnyMsg[];
	tokensBefore: number;
	fileOps?: FileOps;
	previousSummary?: string;
	customInstructions?: string;
	model?: string;
	vision?: boolean;
}): { summary: string; details: SnapDetails } {
	const messages = opts.messages ?? [];
	const snapshot = inspectMessages(messages);
	mergeFileOps(snapshot, opts.fileOps);
	const fallbackExcerpt = opts.text ? snapExcerpt(opts.text) : "";
	const summary = renderFold(snapshot, {
		discardedTokens: opts.tokensBefore,
		previousSummary: opts.previousSummary,
		customInstructions: opts.customInstructions,
		fallbackExcerpt,
	});
	const frames = opts.vision === false ? [] : rasterFrames(opts.text || serializeMessages(messages) || summary, opts.model);
	return { summary, details: { kind: SNAP_KIND, frames } };
}

export function attachSnapFrames(messages: AnyMsg[], details: SnapDetails): void {
	if (!details?.frames?.length) return;
	if (messages.some((m) => textOf(m).includes("[Snapcompact frames"))) return;
	const idx = messages.findIndex((m) => m.role === "compactionSummary");
	const images = details.frames.map((f) => ({ type: "image" as const, data: f.data, mimeType: "image/png" }));
	const injected: AnyMsg = {
		role: "user",
		content: [{ type: "text", text: "[Snapcompact frames — read the dense pixel text as the discarded history.]" }, ...images],
	};
	if (idx >= 0) messages.splice(idx + 1, 0, injected);
	else messages.unshift(injected);
}
