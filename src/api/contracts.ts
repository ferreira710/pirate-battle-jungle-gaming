export type EndReason = "time" | "death";

export interface MatchSettings {
	readonly sessionTime: number;
	readonly spawnInterval: number;
	readonly mapId: string;
}

export interface RegisterMatchRequest {
	readonly matchId: string;
	readonly playerId: string;
	readonly playerName: string;
	readonly playedAt: string;
	readonly score: number;
	readonly duration: number;
	readonly endReason: EndReason;
	readonly settings: MatchSettings;
}

export interface MatchRecord extends RegisterMatchRequest {
	readonly recordedAt: string;
}

export interface RegisterMatchResponse {
	readonly record: MatchRecord;
	readonly created: boolean;
}

export interface Page<T> {
	readonly items: readonly T[];
	readonly page: number;
	readonly pageSize: number;
	readonly totalItems: number;
	readonly totalPages: number;
}

export interface RankingEntry {
	readonly rank: number;
	readonly matchId: string;
	readonly playerId: string;
	readonly playerName: string;
	readonly score: number;
	readonly duration: number;
	readonly endReason: EndReason;
	readonly playedAt: string;
}

export interface RankingPage extends Page<RankingEntry> {
	readonly settings: MatchSettings;
}

export type HistoryPage = Page<MatchRecord>;

export interface RankingQuery {
	readonly settings: MatchSettings;
	readonly page: number;
	readonly pageSize: number;
}

export interface HistoryQuery {
	readonly playerId: string;
	readonly page: number;
	readonly pageSize: number;
}

export interface ApiErrorBody {
	readonly error: {
		readonly code: string;
		readonly message: string;
	};
}

export const API_PATHS = {
	ranking: "/api/ranking",
	history: (playerId: string) =>
		`/api/players/${encodeURIComponent(playerId)}/matches`,
	match: (matchId: string) => `/api/matches/${encodeURIComponent(matchId)}`,
} as const;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;
