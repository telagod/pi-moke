export type AnyMsg = {
	role: string;
	toolName?: string;
	toolCallId?: string;
	content?: unknown;
	summary?: string;
	[k: string]: unknown;
};

export type Report = {
	snapped: number;
	excerpted: number;
	tokensSaved: number;
};

export function emptyReport(): Report {
	return { snapped: 0, excerpted: 0, tokensSaved: 0 };
}

export function formatReport(r: Report): string {
	return `墨客快压: snap ${r.snapped} excerpt ${r.excerpted} (−${r.tokensSaved} tok)`;
}

export type SnapFrame = { data: string; w: number; h: number };
export type SnapDetails = { kind: "moke-snap"; frames: SnapFrame[] };
