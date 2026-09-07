/** Ingress excerpt: head/tail slice with a re-read contract. Never mutates later. */

import { PREFIXES, SNAP_EXCERPT_MAX, SNAP_HEAD_LINES, SNAP_TAIL_LINES } from "./config.ts";
import { clampUtf8, estTokensUtf8 } from "./tokens.ts";
import type { AnyMsg } from "./types.ts";

export function isPlaceholder(s: string): boolean {
	const value = String(s ?? "").trimStart();
	return PREFIXES.some((p) => value.startsWith(p));
}

export function skipIngressTool(name: string | undefined): boolean {
	const tool = String(name ?? "");
	return tool === "skill" || tool === "context";
}

export function snapExcerpt(text: string, options: { headLines?: number; tailLines?: number; maxBytes?: number } = {}): string {
	const head = options.headLines ?? SNAP_HEAD_LINES;
	const tail = options.tailLines ?? SNAP_TAIL_LINES;
	const maxBytes = options.maxBytes ?? SNAP_EXCERPT_MAX;
	const value = String(text ?? "");
	const lines = value.split("\n");
	let body: string;
	if (lines.length <= head + tail) body = value;
	else {
		const skipped = lines.length - head - tail;
		body =
			`${lines.slice(0, head).join("\n")}\n` +
			`… (${skipped} lines elided; see image if attached. To inspect or edit exact bytes, re-read with offset/limit) …\n` +
			lines.slice(-tail).join("\n");
	}
	return clampUtf8(body, maxBytes);
}

export function excerptNotice(originalTokens: number, excerpt: string, extra = ""): string {
	const head = extra
		? `[Snapcompact: ${originalTokens} tokens → ${extra}]`
		: `[Snapcompact: ${originalTokens} tokens → excerpt]`;
	return `${head}\n${excerpt}`;
}

export function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const b = block as { type?: string; text?: string; content?: unknown };
		if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
		else if (b.type === "tool-result" && Array.isArray(b.content)) parts.push(contentToText(b.content));
	}
	return parts.filter(Boolean).join("\n");
}

export function textOf(m: AnyMsg): string {
	if (m.role === "compactionSummary") return String(m.summary ?? contentToText(m.content));
	return contentToText(m.content);
}

export function estimateMessages(messages: AnyMsg[]): number {
	let n = 0;
	for (const m of messages) n += estTokensUtf8(textOf(m)) + 16;
	return n;
}

export function setText(m: AnyMsg, s: string): void {
	if (typeof m.content === "string") {
		m.content = s;
		return;
	}
	m.content = [{ type: "text", text: s }];
}
