// snapfont.ts — omp 同款密图字库：X.org 8x13 + 16x16 CJK，按家塑形。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GLYPH_W = 8;
const GLYPH_H = 13;
const CJK_PX = 16;
const PAPER = 245;
const INK = 16;

export type Family = "anthropic" | "openai";

export type Shape = {
	name: string;
	family: Family;
	cellW: number;
	cellH: number;
	cols: number;
	frameW: number;
	frameH: number;
};

export type Frame = { pixels: Uint8Array; w: number; h: number; rows: number };

const here = dirname(fileURLToPath(import.meta.url));
const font8 = readFileSync(join(here, "font8x13.bin"));
const fontCjk = readFileSync(join(here, "snapcjk.bin"));

function u32le(buf: Buffer, off: number): number {
	return buf.readUInt32LE(off);
}

function loadMap(buf: Buffer, magic: string, hdr: number, glyphBytes: number): Map<number, Buffer> {
	if (buf.length < hdr + 4 || buf.subarray(0, magic.length).toString("binary") !== magic) {
		return new Map();
	}
	const count = u32le(buf, magic === "F8X13" ? 8 : 12);
	const cpsOff = magic === "F8X13" ? 12 : 16;
	const bitsOff = cpsOff + count * 4;
	const map = new Map<number, Buffer>();
	for (let i = 0; i < count; i++) {
		const cp = u32le(buf, cpsOff + i * 4);
		const start = bitsOff + i * glyphBytes;
		if (start + glyphBytes > buf.length) break;
		map.set(cp, buf.subarray(start, start + glyphBytes));
	}
	return map;
}

const map8 = loadMap(font8, "F8X13", 8, 13);
const mapCjk = loadMap(fontCjk, "SNAPCJK1", 8, 32);

export function familyOf(model?: string): Family {
	const n = (model ?? "").toLowerCase();
	if (n.includes("claude") || n.includes("anthropic")) return "anthropic";
	return "openai";
}

export function resolveShape(model?: string): Shape {
	const family = familyOf(model);
	if (family === "anthropic") {
		return { name: "11on16", family, cellW: 11, cellH: 16, cols: 142, frameW: 142 * 11, frameH: 1568 };
	}
	return { name: "8on22", family, cellW: 8, cellH: 22, cols: 128, frameW: 1024, frameH: 1540 };
}

export function isWide(cp: number): boolean {
	return (
		(cp >= 0x1100 && cp <= 0x115f) ||
		(cp >= 0x2329 && cp <= 0x232a) ||
		(cp >= 0x2e80 && cp <= 0xa4cf) ||
		(cp >= 0xac00 && cp <= 0xd7a3) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe10 && cp <= 0xfe19) ||
		(cp >= 0xfe30 && cp <= 0xfe6f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x1f300 && cp <= 0x1faff)
	);
}

export function cellsOf(cp: number): number {
	return isWide(cp) ? 2 : 1;
}

export function lookup8(cp: number): Buffer | undefined {
	return map8.get(cp);
}

export function lookupCjk(cp: number): Buffer | undefined {
	return mapCjk.get(cp);
}

export function estImageTokens(w: number, h: number, family: Family, _window = 0): number {
	if (family === "anthropic") return Math.max(1, Math.ceil((w * h) / 750));
	const tiles = Math.max(1, Math.ceil(w / 512) * Math.ceil(h / 512));
	return 85 + 170 * tiles;
}

export function maxRows(textTok: number, excerptTok: number, shape: Shape, window = 0): number {
	const keep = Math.floor((textTok * 85) / 100);
	if (keep <= excerptTok) return 0;
	const budget = keep - excerptTok;
	const hard = Math.floor(shape.frameH / shape.cellH);
	if (hard <= 0) return 0;
	let lo = 0;
	let hi = hard;
	while (lo < hi) {
		const mid = lo + Math.floor((hi - lo + 1) / 2);
		const tok = estImageTokens(shape.frameW, mid * shape.cellH, shape.family, window);
		if (tok <= budget) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

function put(px: Uint8Array, stride: number, x: number, y: number, v: number): void {
	if (x < 0 || x >= stride) return;
	const i = y * stride + x;
	if (i < 0 || i >= px.length) return;
	px[i] = v;
}

function blit8(px: Uint8Array, stride: number, x: number, y: number, rows: Buffer, shape: Shape): void {
	const oy = shape.cellH > GLYPH_H ? Math.floor((shape.cellH - GLYPH_H) / 2) : 0;
	for (let r = 0; r < GLYPH_H; r++) {
		const bits = rows[r] ?? 0;
		for (let c = 0; c < GLYPH_W; c++) {
			if (((bits >> (7 - c)) & 1) === 0) continue;
			put(px, stride, x + c, y + oy + r, INK);
		}
	}
}

function blitCjk(px: Uint8Array, stride: number, x: number, y: number, bits: Buffer, shape: Shape): void {
	const boxW = shape.cellW * 2;
	const ox = boxW > CJK_PX ? Math.floor((boxW - CJK_PX) / 2) : 0;
	const oy = shape.cellH > CJK_PX ? Math.floor((shape.cellH - CJK_PX) / 2) : 0;
	for (let r = 0; r < CJK_PX; r++) {
		const row = ((bits[r * 2] ?? 0) << 8) | (bits[r * 2 + 1] ?? 0);
		for (let c = 0; c < CJK_PX; c++) {
			if (((row >> (15 - c)) & 1) === 0) continue;
			put(px, stride, x + ox + c, y + oy + r, INK);
		}
	}
}

function blitBox(px: Uint8Array, stride: number, x: number, y: number, bw: number, bh: number): void {
	if (bw < 3 || bh < 3) return;
	for (let c = 1; c + 1 < bw; c++) {
		put(px, stride, x + c, y + 1, INK);
		put(px, stride, x + c, y + bh - 2, INK);
	}
	for (let r = 1; r + 1 < bh; r++) {
		put(px, stride, x + 1, y + r, INK);
		put(px, stride, x + bw - 2, y + r, INK);
	}
}

export function wrapLines(text: string, cols: number): string[] {
	const rows: string[] = [];
	let i = 0;
	while (i < text.length) {
		if (text[i] === "\n") {
			rows.push("");
			i += 1;
			continue;
		}
		const start = i;
		let used = 0;
		while (i < text.length && text[i] !== "\n") {
			const cp = text.codePointAt(i) ?? 63;
			const w = cellsOf(cp);
			if (used > 0 && used + w > cols) break;
			used += w;
			i += cp > 0xffff ? 2 : 1;
		}
		rows.push(text.slice(start, i));
		if (text[i] === "\n") i += 1;
	}
	return rows;
}

export function raster(text: string, shape: Shape, maxRowCount: number): Frame | undefined {
	if (maxRowCount <= 0) return undefined;
	const lines = wrapLines(text, shape.cols);
	if (lines.length === 0) return undefined;
	const rows = Math.min(lines.length, maxRowCount);
	const w = shape.frameW;
	const h = rows * shape.cellH;
	const pixels = new Uint8Array(w * h);
	pixels.fill(PAPER);
	for (let r = 0; r < rows; r++) {
		let col = 0;
		const line = lines[r] ?? "";
		let i = 0;
		while (i < line.length) {
			const cp = line.codePointAt(i) ?? 63;
			const wcells = cellsOf(cp);
			if (col + wcells > shape.cols) break;
			const x = col * shape.cellW;
			const y = r * shape.cellH;
			if (wcells === 2) {
				const bits = lookupCjk(cp);
				if (bits) blitCjk(pixels, w, x, y, bits, shape);
				else blitBox(pixels, w, x, y, shape.cellW * 2, shape.cellH);
			} else {
				const bits = lookup8(cp);
				if (bits) blit8(pixels, w, x, y, bits, shape);
				else blitBox(pixels, w, x, y, shape.cellW, shape.cellH);
			}
			col += wcells;
			i += cp > 0xffff ? 2 : 1;
		}
	}
	return { pixels, w, h, rows };
}
