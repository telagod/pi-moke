/**
 * 墨客快压 — 入境定形 + 机械折页。无 LLM。
 *
 * 写法对齐 dsh-ledger-compact：内核切模块，插件只接线。
 * 入境：大 tool 结果进会话前定稿（密图或摘录），此后不改。
 * 折页：/compact 与官方阈值走 ledger 卡（FILES/INTENTS/TOOLS…），不调模型。
 */
import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { markMokeCompact } from "./compact-guard.ts";
import { HARD_PERCENT, MIN_SNAP_TOKENS, PROACTIVE_PERCENT, SNAP_HEAD_LINES, SNAP_TAIL_LINES, SNAP_KIND } from "./compact/config.ts";
import { contentToText, estimateMessages, isPlaceholder, snapExcerpt, textOf } from "./compact/excerpt.ts";
import {
	attachSnapFrames,
	buildCompactPayload,
	buildFold,
	inspectMessages,
	serializeMessages,
} from "./compact/fold.ts";
import { applyIngress, shapeIngress, shapedContent } from "./compact/ingress.ts";
import { encodePngGray } from "./compact/png.ts";
import {
	canCompactNow,
	compactHint,
	countUserTurns,
	formatStatus,
	inventory,
	lastUserIsGoal,
	messagesFromBranch,
	taskNode,
	usageFooter,
} from "./compact/status.ts";
import { estTokensUtf8 } from "./compact/tokens.ts";
import { emptyReport, formatReport } from "./compact/types.ts";
import { modelHasVision, resolveVisionRoute } from "./compact/vision.ts";
import type { AnyMsg, Report, SnapDetails } from "./compact/types.ts";
import type { TaskNode } from "./compact/status.ts";

export {
	applyIngress,
	attachSnapFrames,
	buildCompactPayload,
	buildFold,
	canCompactNow,
	compactHint,
	contentToText,
	countUserTurns,
	emptyReport,
	encodePngGray,
	estimateMessages,
	estTokensUtf8,
	formatReport,
	formatStatus,
	HARD_PERCENT,
	inspectMessages,
	inventory,
	isPlaceholder,
	lastUserIsGoal,
	messagesFromBranch,
	MIN_SNAP_TOKENS,
	modelHasVision,
	PROACTIVE_PERCENT,
	resolveVisionRoute,
	serializeMessages,
	shapeIngress,
	SNAP_HEAD_LINES,
	SNAP_TAIL_LINES,
	snapExcerpt,
	taskNode,
	textOf,
	usageFooter,
};
export type { AnyMsg, Report, SnapDetails, TaskNode };

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

type ModelHint = { id?: string; input?: unknown; inputModalities?: unknown };

function visionOf(ctx: { model?: ModelHint }): boolean {
	return resolveVisionRoute({
		model: ctx.model?.id ?? "",
		inputModalities: ctx.model?.inputModalities ?? ctx.model?.input,
	}).ingressVision;
}

export default function mokeFastCompress(pi: ExtensionAPI): void {
	let last: Report | undefined;
	let foldQueued = false;
	let stampedTurn = 0;
	let pendingTurn = false;

	const windowOf = (ctx: { getContextUsage: () => { contextWindow?: number } | undefined }): number =>
		ctx.getContextUsage()?.contextWindow ?? 128 * 1024;

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

	const requestFold = (
		ctx: {
			compact: (opts?: { onComplete?: () => void; onError?: () => void }) => void;
			isIdle?: () => boolean;
			hasUI?: boolean;
			ui?: { notify: (m: string, k: string) => void };
			getContextUsage: () => { percent?: number | null } | undefined;
		},
		force = false,
	) => {
		const u = usageOf(ctx);
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
			const msgs = prep.messagesToSummarize as AnyMsg[];
			const payload = buildCompactPayload({
				messages: msgs,
				text: serializeMessages(msgs),
				tokensBefore: prep.tokensBefore,
				fileOps: prep.fileOps,
				previousSummary: prep.previousSummary,
				customInstructions: event.customInstructions,
				model: ctx.model?.id,
				vision: visionOf(ctx),
			});
			const n = payload.details.frames.length;
			if (ctx.hasUI) ctx.ui.notify(n ? `snapcompact ${n} frame(s), no LLM` : "snapcompact fold, no LLM", "info");
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
	if (Type) {
		pi.registerTool({
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
	}

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
