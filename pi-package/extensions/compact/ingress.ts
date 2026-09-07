/** Ingress shaping: large tool results freeze at first send. History already in the prefix is left alone. */

import { MIN_SNAP_TOKENS, SNAP_SAVINGS } from "./config.ts";
import { excerptNotice, isPlaceholder, skipIngressTool, snapExcerpt, textOf, setText } from "./excerpt.ts";
import { encodePngGray } from "./png.ts";
import { estTokensUtf8 } from "./tokens.ts";
import type { AnyMsg, Report } from "./types.ts";
import { emptyReport } from "./types.ts";
import * as snapfont from "../snapfont.ts";

export type IngressOpts = {
	vision?: boolean;
	model?: string;
	toolName?: string;
	minSnapTokens?: number;
	savingsRatio?: number;
};

export type IngressShaped = {
	changed: boolean;
	snapped: boolean;
	excerpted: boolean;
	text: string;
	image?: { data: string; mimeType: string };
	tokensSaved: number;
};

export function shapeIngress(text: string, opts: IngressOpts = {}): IngressShaped {
	const keep = { changed: false, snapped: false, excerpted: false, text, tokensSaved: 0 };
	if (!text || isPlaceholder(text) || skipIngressTool(opts.toolName)) return keep;
	const tok = estTokensUtf8(text);
	if (tok < (opts.minSnapTokens ?? MIN_SNAP_TOKENS)) return keep;
	const excerpt = snapExcerpt(text);
	const excerptText = excerptNotice(tok, excerpt);
	const excerptSaved = Math.max(0, tok - estTokensUtf8(excerptText));
	const excerptOnly: IngressShaped = {
		changed: excerptSaved > 0,
		snapped: false,
		excerpted: true,
		text: excerptText,
		tokensSaved: excerptSaved,
	};
	if (opts.vision !== true) return excerptOnly.changed ? excerptOnly : keep;

	const shape = snapfont.resolveShape(opts.model);
	const excerptTok = Math.min(estTokensUtf8(excerpt) + 48, 800);
	const rows = snapfont.maxRows(tok, excerptTok, shape);
	const framed = snapfont.raster(text, shape, rows);
	if (!framed) return excerptOnly.changed ? excerptOnly : keep;
	const imgTok = snapfont.estImageTokens(framed.w, framed.h, shape.family);
	const extra = `${framed.w}x${framed.h} PNG ~${imgTok} tokens`;
	const notice = excerptNotice(tok, excerpt, extra);
	const after = estTokensUtf8(notice) + imgTok;
	const savings = opts.savingsRatio ?? SNAP_SAVINGS;
	if (after > tok * savings) return excerptOnly.changed ? excerptOnly : keep;
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

export function shapedContent(
	shaped: IngressShaped,
	footer: string,
): Array<{ type: string; text?: string; data?: string; mimeType?: string }> {
	const text = footer ? shaped.text + footer : shaped.text;
	if (shaped.image) {
		return [
			{ type: "text", text },
			{ type: "image", data: shaped.image.data, mimeType: shaped.image.mimeType },
		];
	}
	return [{ type: "text", text }];
}
