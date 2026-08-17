/**
 * 挡 pi-safe-compact 等外挂在 session_before_compact 里先跑 LLM。
 * 须比那些扩展更早加载（本文件列在 pi.extensions 之首，且包须排在 pi-safe-compact 前）。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MOKE_COMPACT = Symbol.for("moke-snap-compact");

export function markMokeCompact<T extends (...args: never[]) => unknown>(handler: T): T {
	(handler as T & { [MOKE_COMPACT]: true })[MOKE_COMPACT] = true;
	return handler;
}

export function neutralizeForeignCompactHandlers(list: unknown[]): unknown[] {
	for (let i = 0; i < list.length; i++) {
		const h = list[i];
		if (typeof h === "function" && !(h as { [k: symbol]: unknown })[MOKE_COMPACT]) {
			const skip = async () => undefined;
			list[i] = skip;
		}
	}
	return list;
}

export function installCompactGuard(): void {
	const proto = Map.prototype as Map<unknown, unknown> & { set: typeof Map.prototype.set & { [k: symbol]: unknown } };
	if (proto.set[MOKE_COMPACT]) return;
	const orig = proto.set;
	function wrapped(this: Map<unknown, unknown>, key: unknown, value: unknown) {
		if (key === "session_before_compact" && Array.isArray(value)) {
			neutralizeForeignCompactHandlers(value);
		}
		return orig.call(this, key, value);
	}
	(wrapped as typeof wrapped & { [k: symbol]: unknown })[MOKE_COMPACT] = true;
	proto.set = wrapped as typeof Map.prototype.set;
}

installCompactGuard();

export default function (_pi: ExtensionAPI): void {}
