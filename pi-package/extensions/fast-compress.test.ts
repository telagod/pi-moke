import assert from "node:assert/strict";
import { test } from "node:test";
import { markMokeCompact, neutralizeForeignCompactHandlers } from "./compact-guard.ts";
import {
	applyPrune,
	applySealed,
	applyShake,
	applySnap,
	canReuseSeal,
	dropImages,
	encodePngGray,
	estimateMessages,
	estTokensUtf8,
	formatStatus,
	isPlaceholder,
	MIN_SNAP_TOKENS,
	modelHasVision,
	snapExcerpt,
	serializeMessages,
	buildCompactPayload,
	attachSnapFrames,
	textOf,
	type AnyMsg,
} from "./fast-compress.ts";

const textJoin = textOf;

function toolPair(id: string, name: string, args: Record<string, unknown>, body: string): AnyMsg[] {
	return [
		{
			role: "assistant",
			content: [{ type: "toolCall", id, name, arguments: args }],
		},
		{
			role: "toolResult",
			toolCallId: id,
			toolName: name,
			content: [{ type: "text", text: body }],
		},
	];
}

test("estTokensUtf8 does not underreport CJK", () => {
	const zh = "这是一段纯中文文本用来验证上下文预算估算";
	assert.ok(estTokensUtf8(zh) >= [...zh].length);
	assert.equal(estTokensUtf8("abcd"), 1);
});

test("prune supersedes older read of the same path", () => {
	const big = "x".repeat(800);
	const msgs: AnyMsg[] = [
		...toolPair("r1", "read", { path: "src/a.ts" }, big),
		...toolPair("r2", "read", { path: "src/a.ts" }, big + "newer"),
	];
	const r = applyPrune(msgs);
	assert.equal(r.superseded, 1);
	assert.ok(String((msgs[1].content as { text: string }[])[0].text).startsWith("[Superseded"));
	assert.equal((msgs[3].content as { text: string }[])[0].text, big + "newer");
});

test("prune age-cuts old bash and keeps latest read", () => {
	const big = "z".repeat(20 * 1024);
	const msgs: AnyMsg[] = [];
	for (let i = 0; i < 8; i++) msgs.push(...toolPair(`b${i}`, "bash", {}, big));
	msgs.push(...toolPair("rd", "read", { path: "keep.ts" }, big));
	const r = applyPrune(msgs);
	assert.ok(r.pruned > 0);
	const read = msgs.find((m) => m.toolCallId === "rd");
	assert.equal((read?.content as { text: string }[])[0].text, big);
	assert.ok(msgs.some((m) => m.role === "toolResult" && isPlaceholder((m.content as { text: string }[])[0].text)));
});

test("shake drops old tool results and large fences, keeps skill", () => {
	const big = "y".repeat(6 * 1024);
	const fence = `intro\n\`\`\`\n${"line\n".repeat(500)}\`\`\`\nend`;
	const msgs: AnyMsg[] = [
		...toolPair("b0", "bash", {}, big),
		...toolPair("sk", "skill", { name: "x" }, big),
		{ role: "assistant", content: [{ type: "text", text: fence }] },
	];
	const r = applyShake(msgs, { protectTokens: 0, minSavings: 0 });
	assert.ok(r.shaken >= 2);
	assert.ok(String((msgs[1].content as { text: string }[])[0].text).startsWith("[Shake elided"));
	assert.equal((msgs[3].content as { text: string }[])[0].text, big);
	assert.ok(String((msgs[4].content as { text: string }[])[0].text).includes("[Shake elided fence"));
});

test("snap rasters large ASCII tool output", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	assert.ok(estTokensUtf8(ascii) >= MIN_SNAP_TOKENS);
	const msgs: AnyMsg[] = [...toolPair("b0", "bash", {}, ascii)];
	const r = applySnap(msgs);
	assert.equal(r.snapped, 1);
	const blocks = msgs[1].content as Array<{ type: string; data?: string; text?: string }>;
	assert.ok(blocks.some((b) => b.type === "image" && typeof b.data === "string" && b.data.length > 0));
	assert.ok(String((msgs[1].content as { text?: string }[])[0].text).startsWith("[Snapcompact"));
});

test("snap rasters CJK tool output", () => {
	const zh = "这是一段很长的中文日志用来验证密图能画汉字。".repeat(150);
	assert.ok(estTokensUtf8(zh) >= MIN_SNAP_TOKENS);
	const msgs: AnyMsg[] = [...toolPair("b1", "bash", {}, zh)];
	const r = applySnap(msgs);
	assert.equal(r.snapped, 1);
	const blocks = msgs[1].content as Array<{ type: string; data?: string; text?: string }>;
	assert.ok(blocks.some((b) => b.type === "image"));
	assert.ok(textJoin(msgs[1]).includes("中文日志"));
});

test("encodePngGray writes a valid PNG signature", () => {
	const px = new Uint8Array(8 * 8);
	px.fill(200);
	const png = encodePngGray(px, 8, 8);
	assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("dropImages removes image blocks", () => {
	const msgs: AnyMsg[] = [
		{ role: "user", content: [{ type: "text", text: "see" }, { type: "image", data: "AAAA", mimeType: "image/png" }] },
	];
	assert.equal(dropImages(msgs), 1);
	assert.equal((msgs[0].content as unknown[]).length, 1);
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

test("snap keeps a text excerpt so the original is not evaporated", () => {
	const line = "fn snap_excerpt_marker() void { return; }\n";
	const ascii = line.repeat(600);
	assert.ok(estTokensUtf8(ascii) >= MIN_SNAP_TOKENS);
	const msgs: AnyMsg[] = [...toolPair("b0", "bash", {}, ascii)];
	const r = applySnap(msgs);
	assert.equal(r.snapped, 1);
	assert.ok(textJoin(msgs[1]).includes("snap_excerpt_marker"));
});

test("snap skips when the model has no vision", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	const msgs: AnyMsg[] = [...toolPair("b0", "bash", {}, ascii)];
	const r = applySnap(msgs, { vision: false });
	assert.equal(r.snapped, 0);
	assert.equal(textJoin(msgs[1]), ascii);
});

test("snap prefers cheap tail so prefix cache stays warm", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	const msgs: AnyMsg[] = [];
	for (let i = 0; i < 6; i++) msgs.push(...toolPair(`old${i}`, "bash", {}, ascii));
	msgs.push(...toolPair("tail", "bash", {}, ascii));
	const r = applySnap(msgs);
	assert.ok(r.snapped >= 1);
	const old = msgs.find((m) => m.toolCallId === "old0");
	assert.ok(old && !textJoin(old).startsWith("[Snapcompact"));
	const tail = msgs.find((m) => m.toolCallId === "tail");
	assert.ok(tail && textJoin(tail).startsWith("[Snapcompact"));
});

test("shake elides large XML blocks", () => {
	const inner = "x".repeat(6 * 1024);
	const xml = `<log>\n${inner}\n</log>`;
	const msgs: AnyMsg[] = [{ role: "assistant", content: [{ type: "text", text: xml }] }];
	const r = applyShake(msgs, { protectTokens: 0, minSavings: 0 });
	assert.ok(r.shaken >= 1);
	assert.ok(textJoin(msgs[0]).includes("[Shake elided xml"));
});

test("modelHasVision gates known families", () => {
	assert.equal(modelHasVision("claude-sonnet-4"), true);
	assert.equal(modelHasVision("gpt-4o-mini"), true);
	assert.equal(modelHasVision("qwen2.5-vl-72b"), true);
	assert.equal(modelHasVision("deepseek-reasoner"), false);
	assert.equal(modelHasVision("deepseek-chat"), false);
	assert.equal(modelHasVision("o1-mini"), false);
});

test("formatStatus reports usage next-layer and vision", () => {
	const msgs: AnyMsg[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
	const s = formatStatus(msgs, 1000, false);
	assert.ok(s.includes("vision=no"));
	assert.ok(s.includes("next="));
	assert.ok(estimateMessages(msgs) > 0);
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
	assert.ok(textJoin(msgs[1]).includes("Snapcompact frames"));
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

test("applySealed freezes prefix after first send", () => {
	const big = "y".repeat(8 * 1024);
	const first = [...toolPair("a", "bash", {}, big)];
	const state = { prefix: null as AnyMsg[] | null };
	applySealed(first, state, { window: 1000, mode: "shake", vision: false });
	const frozen = textJoin(first[1]);
	assert.ok(frozen.startsWith("[Shake"));

	const second = [...toolPair("a", "bash", {}, big), { role: "user", content: "more" }];
	applySealed(second, state, { window: 200_000, vision: false });
	assert.equal(textJoin(second[1]), frozen);
	assert.equal(second[2]?.role, "user");
});

test("applySealed force shake opens a new epoch", () => {
	const big = "z".repeat(8 * 1024);
	const first = [...toolPair("a", "bash", {}, big)];
	const state = { prefix: null as AnyMsg[] | null };
	applySealed(first, state, { window: 200_000, vision: false });
	const second = [...toolPair("a", "bash", {}, big), { role: "user", content: "more" }];
	applySealed(second, state, { window: 1000, mode: "shake", vision: false });
	assert.ok(textJoin(second[1]).startsWith("[Shake"));
});

test("canReuseSeal rejects shorter history and new compaction", () => {
	const prefix: AnyMsg[] = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }];
	assert.equal(canReuseSeal(prefix, [{ role: "user", content: "a" }]), false);
	assert.equal(
		canReuseSeal([{ role: "compactionSummary", summary: "old" }], [{ role: "compactionSummary", summary: "new" }, { role: "user", content: "x" }]),
		false,
	);
});
