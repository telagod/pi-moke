import assert from "node:assert/strict";
import { test } from "node:test";
import { markMokeCompact, neutralizeForeignCompactHandlers } from "./compact-guard.ts";
import {
	applyIngress,
	attachSnapFrames,
	buildCompactPayload,
	canCompactNow,
	compactHint,
	encodePngGray,
	estimateMessages,
	estTokensUtf8,
	formatStatus,
	inventory,
	isPlaceholder,
	loadTypebox,
	MIN_SNAP_TOKENS,
	modelHasVision,
	shapeIngress,
	snapExcerpt,
	serializeMessages,
	lastUserIsGoal,
	taskNode,
	textOf,
	usageFooter,
	type AnyMsg,
} from "./fast-compress.ts";

function toolResult(id: string, name: string, body: string): AnyMsg {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: name,
		content: [{ type: "text", text: body }],
	};
}

test("estTokensUtf8 does not underreport CJK", () => {
	const zh = "这是一段纯中文文本用来验证上下文预算估算";
	assert.ok(estTokensUtf8(zh) >= [...zh].length);
	assert.equal(estTokensUtf8("abcd"), 1);
});

test("shapeIngress leaves small tool output alone", () => {
	const shaped = shapeIngress("hello world", { vision: true });
	assert.equal(shaped.changed, false);
	assert.equal(shaped.text, "hello world");
});

test("shapeIngress skips skill and already-shaped text", () => {
	const big = "fn main() void { return; }\n".repeat(600);
	assert.equal(shapeIngress(big, { toolName: "skill" }).changed, false);
	assert.equal(shapeIngress("[Snapcompact: already]", { vision: true }).changed, false);
});

test("shapeIngress snaps large ASCII when vision is on", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	assert.ok(estTokensUtf8(ascii) >= MIN_SNAP_TOKENS);
	const shaped = shapeIngress(ascii, { vision: true, model: "gpt-4o" });
	assert.equal(shaped.changed, true);
	assert.equal(shaped.snapped, true);
	assert.ok(shaped.text.startsWith("[Snapcompact"));
	assert.ok(shaped.image && shaped.image.data.length > 80);
	assert.ok(shaped.text.includes("fn main()"));
});

test("shapeIngress excerpts when there is no vision", () => {
	const ascii = "fn snap_excerpt_marker() void { return; }\n".repeat(600);
	const shaped = shapeIngress(ascii, { vision: false });
	assert.equal(shaped.changed, true);
	assert.equal(shaped.snapped, false);
	assert.equal(shaped.excerpted, true);
	assert.equal(shaped.image, undefined);
	assert.ok(shaped.text.includes("snap_excerpt_marker"));
	assert.ok(shaped.text.startsWith("[Snapcompact"));
});

test("shapeIngress rasters CJK", () => {
	const zh = "这是一段很长的中文日志用来验证密图能画汉字。".repeat(150);
	assert.ok(estTokensUtf8(zh) >= MIN_SNAP_TOKENS);
	const shaped = shapeIngress(zh, { vision: true, model: "claude-sonnet-4" });
	assert.equal(shaped.snapped, true);
	assert.ok(shaped.text.includes("中文日志"));
});

test("applyIngress writes the shaped body onto a toolResult", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	const m = toolResult("b0", "bash", ascii);
	const r = applyIngress(m, { vision: true, model: "gpt-4o" });
	assert.equal(r.snapped, 1);
	assert.ok(textOf(m).startsWith("[Snapcompact"));
	const blocks = m.content as Array<{ type: string; data?: string }>;
	assert.ok(blocks.some((b) => b.type === "image" && typeof b.data === "string" && b.data.length > 0));
});

test("applyIngress does not rewrite a sibling old result", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	const old = toolResult("old", "bash", ascii);
	const neu = toolResult("neu", "bash", ascii);
	applyIngress(neu, { vision: true, model: "gpt-4o" });
	assert.equal(textOf(old), ascii);
	assert.ok(textOf(neu).startsWith("[Snapcompact"));
});

test("shapeIngress is idempotent", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	const once = shapeIngress(ascii, { vision: true, model: "gpt-4o" });
	const twice = shapeIngress(once.text, { vision: true, model: "gpt-4o" });
	assert.equal(twice.changed, false);
	assert.equal(twice.text, once.text);
});

test("encodePngGray writes a valid PNG signature", () => {
	const px = new Uint8Array(8 * 8);
	px.fill(200);
	const png = encodePngGray(px, 8, 8);
	assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("8x13 and CJK fonts have ink", async () => {
	const { lookup8, lookupCjk, resolveShape } = await import("./snapfont.ts");
	const a = lookup8(65);
	assert.ok(a && [...a].some((b) => b !== 0));
	const zhong = lookupCjk(0x4e2d);
	assert.ok(zhong && [...zhong].some((b) => b !== 0));
	assert.equal(resolveShape("claude-sonnet-4").name, "11on16");
	assert.equal(resolveShape("gpt-4o").name, "8on22");
});

test("modelHasVision gates known families", () => {
	assert.equal(modelHasVision("claude-sonnet-4"), true);
	assert.equal(modelHasVision("gpt-4o-mini"), true);
	assert.equal(modelHasVision("qwen2.5-vl-72b"), true);
	assert.equal(modelHasVision("deepseek-reasoner"), false);
	assert.equal(modelHasVision("deepseek-chat"), false);
	assert.equal(modelHasVision("o1-mini"), false);
});

test("formatStatus reports compact-or-idle", () => {
	const msgs: AnyMsg[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
	const s = formatStatus(msgs, 1000, false);
	assert.ok(s.includes("vision=no"));
	assert.ok(s.includes("next=idle"));
	assert.ok(estimateMessages(msgs) > 0);
	const fat: AnyMsg[] = [{ role: "user", content: [{ type: "text", text: "x".repeat(4000) }] }];
	assert.ok(formatStatus(fat, 1000, true).includes("next=compact"));
});

test("inventory lists large raw tool results by size", () => {
	const msgs: AnyMsg[] = [
		{ role: "user", content: "q" },
		toolResult("a", "bash", "x".repeat(400)),
		toolResult("b", "read", `[Snapcompact: already]\n${"k".repeat(400)}`),
		toolResult("c", "grep", "y".repeat(1200)),
	];
	const items = inventory(msgs);
	assert.ok(items.length >= 2);
	assert.equal(items[0].tool, "grep");
	assert.equal(items[0].shaped, false);
	const shaped = items.find((it) => it.tool === "read");
	assert.ok(shaped?.shaped);
	const status = formatStatus(msgs, 10000, true);
	assert.ok(status.includes("raw≈"));
	assert.ok(status.includes("grep"));
});

test("snapExcerpt keeps head and tail", () => {
	const lines = Array.from({ length: 40 }, (_, i) => `L${i}`);
	const ex = snapExcerpt(lines.join("\n"));
	assert.ok(ex.includes("L0"));
	assert.ok(ex.includes("L39"));
	assert.ok(ex.includes("elided"));
	assert.ok(!ex.includes("L20"));
});

test("placeholder detector", () => {
	assert.ok(isPlaceholder("[Output truncated - 12 tokens]"));
	assert.ok(isPlaceholder("[Snapcompact: 3000 tokens → 768x256 PNG ~400 tokens]"));
	assert.equal(isPlaceholder("real tool output"), false);
});

test("usageFooter only stamps task nodes", () => {
	assert.equal(usageFooter(12, 12000, 100000), "");
	assert.equal(usageFooter(12, 12000, 100000, null), "");
	assert.ok(usageFooter(12, 12000, 100000, "user").includes("node=user"));
	assert.ok(!usageFooter(12, 12000, 100000, "user").includes("compact"));
	assert.ok(usageFooter(40, undefined, undefined, "ingress").includes("node=ingress"));
	assert.ok(usageFooter(45, undefined, undefined, "goal").includes('context({op:"compact"})'));
	assert.ok(usageFooter(86, 86000, 100000, "hard").includes('context({op:"compact"})'));
	assert.equal(compactHint("goal", 39), false);
	assert.equal(compactHint("goal", 40), true);
	assert.equal(canCompactNow({}), false);
	assert.equal(canCompactNow({ isIdle: () => true }), true);
	assert.equal(canCompactNow({ isIdle: () => false }), false);
	assert.equal(taskNode({ percent: 12, ingressChanged: false, newTurn: false }), null);
	assert.equal(taskNode({ percent: 12, ingressChanged: false, newTurn: true, newUserTurn: true }), "user");
	assert.equal(taskNode({ percent: 12, ingressChanged: false, newTurn: true, goalActive: true }), "goal");
	assert.equal(taskNode({ percent: 12, ingressChanged: false, newTurn: true }), "turn");
	assert.equal(taskNode({ percent: 12, ingressChanged: true, newTurn: true }), "ingress");
	assert.equal(taskNode({ percent: 86, ingressChanged: false, newTurn: false }), "hard");
	assert.equal(lastUserIsGoal([{ role: "user", content: "<!-- pi-goal-continuation:abc -->" }]), true);
	assert.equal(lastUserIsGoal([{ role: "user", content: "在吗" }]), false);
});

test("serializeMessages prefixes roles", () => {
	const text = serializeMessages([
		{ role: "user", content: "hello" },
		{ role: "assistant", content: "world" },
	]);
	assert.ok(text.includes("[user] hello"));
	assert.ok(text.includes("[assistant] world"));
});

test("buildCompactPayload rasters and labels snapcompact", () => {
	const text = "fn main() void { return; }\n".repeat(400);
	const payload = buildCompactPayload({
		text,
		tokensBefore: 9000,
		fileOps: { read: ["src/a.zig"], written: [], edited: ["src/b.zig"] },
		vision: true,
		model: "gpt-4o",
	});
	assert.ok(payload.summary.startsWith("[Snapcompact]"));
	assert.ok(payload.summary.includes("FILES"));
	assert.ok(payload.summary.includes("src/a.zig"));
	assert.equal(payload.details.kind, "moke-snap");
	assert.ok(payload.details.frames.length >= 1);
	assert.ok(payload.details.frames[0].data.length > 80);
});

test("attachSnapFrames injects after compactionSummary", () => {
	const msgs: AnyMsg[] = [
		{ role: "compactionSummary", summary: "old" },
		{ role: "user", content: "keep" },
	];
	attachSnapFrames(msgs, { kind: "moke-snap", frames: [{ data: "AAAA", w: 8, h: 8 }] });
	assert.equal(msgs[1].role, "user");
	assert.ok(textOf(msgs[1]).includes("Snapcompact frames"));
	const blocks = msgs[1].content as Array<{ type: string }>;
	assert.ok(blocks.some((b) => b.type === "image"));
});

test("compact-guard skips foreign session_before_compact handlers", async () => {
	const foreign = async () => ({ compaction: { summary: "llm" } });
	const ours = markMokeCompact(async () => ({ compaction: { summary: "snap" } }));
	const list: unknown[] = [foreign, ours];
	neutralizeForeignCompactHandlers(list);
	assert.notEqual(list[0], foreign);
	assert.equal(list[1], ours);
	assert.equal(await (list[0] as () => Promise<undefined>)(), undefined);
	assert.equal((await (list[1] as () => Promise<{ compaction: { summary: string } }>)()).compaction.summary, "snap");
});

test("loadTypebox resolves from the pi CLI", async () => {
	const { execSync } = await import("node:child_process");
	const { realpathSync } = await import("node:fs");
	let cli: string;
	try {
		cli = realpathSync(execSync("command -v pi", { encoding: "utf8" }).trim());
	} catch {
		return;
	}
	const prev = process.argv[1];
	process.argv[1] = cli;
	try {
		const Type = loadTypebox();
		assert.ok(Type);
		assert.ok(Type.Object({ op: Type.Unsafe({ type: "string", enum: ["status", "compact"] }) }));
	} finally {
		process.argv[1] = prev;
	}
});
