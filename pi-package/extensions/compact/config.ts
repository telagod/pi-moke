/** Budgets and markers. Tuned to match dsh-ledger-compact. */

export const HARD_PERCENT = 85;
export const PROACTIVE_PERCENT = 40;
export const MIN_SNAP_TOKENS = 3000;
export const SNAP_SAVINGS = 0.85;
export const SNAP_HEAD_LINES = 16;
export const SNAP_TAIL_LINES = 8;
export const SNAP_EXCERPT_MAX = 2400;
export const SNAP_KIND = "moke-snap";

export const PREFIXES = [
	"[Output truncated",
	"[Superseded",
	"[Shake elided",
	"[Snapcompact",
	"[Ledger]",
	"[Uneventful",
	"[image omitted",
	"[Artifact stored",
	"[... tool result middle pruned",
] as const;
