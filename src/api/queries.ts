import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DEFAULT_ARENA } from "../game/config/arenaMap";
import type { PlayerOptions } from "../game/config/gameConfig";
import { DEFAULT_PAGE_SIZE, type MatchSettings } from "./contracts";
import { fetchHistory, fetchRanking } from "./endpoints";
import { queryKeys } from "./queryKeys";

export function rankingSettingsFor(options: PlayerOptions): MatchSettings {
	return {
		sessionTime: options.sessionTime,
		spawnInterval: options.spawnInterval,
		mapId: DEFAULT_ARENA.id,
	};
}

export function useRankingQuery(
	settings: MatchSettings,
	page: number,
	pageSize = DEFAULT_PAGE_SIZE,
) {
	return useQuery({
		queryKey: queryKeys.ranking(settings, page, pageSize),
		queryFn: ({ signal }) => fetchRanking({ settings, page, pageSize }, signal),
		placeholderData: keepPreviousData,
		refetchOnMount: "always",
	});
}

export function useHistoryQuery(
	playerId: string,
	page: number,
	pageSize = DEFAULT_PAGE_SIZE,
) {
	return useQuery({
		queryKey: queryKeys.history(playerId, page, pageSize),
		queryFn: ({ signal }) => fetchHistory({ playerId, page, pageSize }, signal),
		placeholderData: keepPreviousData,
		refetchOnMount: "always",
	});
}
