/** Window / task-node status. Stamps only at task boundaries. */

import { HARD_PERCENT, PROACTIVE_PERCENT } from "./config.ts";
import { estimateMessages, isPlaceholder, textOf } from "./excerpt.ts";
import { estTokensUtf8, percentOf } from "./tokens.ts";
import type { AnyMsg } from "./types.ts";

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
	const pct = percentOf(used, window);
	const next = window > 0 && used > (window * HARD_PERCENT) / 100 ? "compact" : "idle";
	const items = inventory(messages);
	const rawTok = items.filter((it) => !it.shaped).reduce((n, it) => n + it.tokens, 0);
	const head = `快压 ${used}/${window} (${pct}%) next=${next} vision=${vision ? "yes" : "no"} raw≈${rawTok}`;
	return `${head}\n${formatInventory(items)}`;
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

export function messagesFromBranch(branch: Array<{ type?: string; message?: AnyMsg }>): AnyMsg[] {
	const out: AnyMsg[] = [];
	for (const e of branch) {
		if (e?.type === "message" && e.message) out.push(e.message);
	}
	return out;
}
