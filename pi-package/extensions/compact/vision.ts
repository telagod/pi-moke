/** Dense PNG only when opted in. Explicit image modalities win; Pi often omits them. */

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

export function modalitiesIncludeImage(modalities: unknown): boolean | undefined {
	if (!Array.isArray(modalities)) return undefined;
	return modalities.map(String).includes("image");
}

export type VisionRoute = {
	model: string;
	snapImages: boolean;
	ingressVision: boolean;
};

/**
 * PNG rides the prefix only when snapImages is on *and* the model can see it.
 * Advertised `inputModalities` wins. Unknown modalities fall back to family
 * names because Pi model rows often omit the field (unlike DSH adapters).
 */
export function resolveVisionRoute(input: {
	model?: string;
	inputModalities?: unknown;
	snapImages?: boolean;
} = {}): VisionRoute {
	const model = String(input.model ?? "");
	const snapImages = input.snapImages !== false;
	const fromModalities = modalitiesIncludeImage(input.inputModalities);
	const ingressVision =
		snapImages && (fromModalities === true || (fromModalities === undefined && modelHasVision(model)));
	return { model, snapImages, ingressVision };
}
