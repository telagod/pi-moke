/** UTF-8 token heuristic. Same numbers as dsh-ledger-compact / 快压. */

export function estTokensUtf8(text: string): number {
	const value = String(text ?? "");
	let ascii = 0;
	let two = 0;
	let wide = 0;
	for (const ch of value) {
		const n = ch.length === 1 ? (ch.charCodeAt(0) < 0x80 ? 1 : ch.charCodeAt(0) < 0x800 ? 2 : 3) : 4;
		if (n === 1) ascii += 1;
		else if (n === 2) two += 1;
		else wide += 1;
	}
	return Math.floor(ascii / 4) + Math.floor((two * 2) / 3) + wide;
}

export function clampUtf8(s: string, maxBytes: number): string {
	const value = String(s ?? "");
	const buf = Buffer.from(value, "utf8");
	if (buf.length <= maxBytes) return value;
	let end = maxBytes;
	while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
	return buf.subarray(0, Math.max(0, end)).toString("utf8");
}

export function percentOf(used: number, window: number): number {
	if (!window || window <= 0) return 0;
	return Math.floor((used * 100) / window);
}
