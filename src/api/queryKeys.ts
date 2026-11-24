import type { MatchSettings } from "./contracts";

export const queryKeys = {
	rankingAll: ["ranking"] as const,
	ranking: (settings: MatchSettings, page: number, pageSize: number) =>
		[
			"ranking",
			settings.mapId,
			settings.sessionTime,
			settings.spawnInterval,
			page,
			pageSize,
		] as const,
	historyAll: ["history"] as const,
	history: (playerId: string, page: number, pageSize: number) =>
		["history", playerId, page, pageSize] as const,
};

export const REGISTER_MUTATION_KEY = ["register-match"] as const;
