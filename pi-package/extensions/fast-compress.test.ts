import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyPrune,
	applyShake,
	applySnap,
	dropImages,
	encodePngGray,
	estTokensUtf8,
	glyph5x7,
	isPlaceholder,
	MIN_SNAP_TOKENS,
	type AnyMsg,
} from "./fast-compress.ts";

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

test("snap rasters large ASCII and skips CJK", () => {
	const ascii = "fn main() void { return; }\n".repeat(600);
	assert.ok(estTokensUtf8(ascii) >= MIN_SNAP_TOKENS);
	const zh = "这是一段很长的中文日志用来验证密图不会拿汉字去赌视觉识别。".repeat(80);
	const msgs: AnyMsg[] = [...toolPair("b0", "bash", {}, ascii), ...toolPair("b1", "bash", {}, zh)];
	const r = applySnap(msgs);
	assert.equal(r.snapped, 1);
	const blocks = msgs[1].content as Array<{ type: string; data?: string; text?: string }>;
	assert.ok(blocks.some((b) => b.type === "image" && typeof b.data === "string" && b.data.length > 0));
	assert.ok(String((msgs[1].content as { text?: string }[])[0].text).startsWith("[Snapcompact"));
	const zhBlocks = msgs[3].content as Array<{ type: string }>;
	assert.ok(!zhBlocks.some((b) => b.type === "image"));
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

test("5x7 font covers printable ASCII and A is not a box", () => {
	const box = glyph5x7(0x4e2d); // 中
	assert.notDeepEqual(glyph5x7(65), box); // A
	assert.notDeepEqual(glyph5x7(122), box); // z
	assert.deepEqual(glyph5x7(32), [0, 0, 0, 0, 0, 0, 0]);
});

test("placeholder detector", () => {
	assert.ok(isPlaceholder("[Output truncated - 12 tokens]"));
	assert.ok(isPlaceholder("[Snapcompact: 3000 tokens → 768x256 PNG ~400 tokens]"));
	assert.equal(isPlaceholder("real tool output"), false);
});
