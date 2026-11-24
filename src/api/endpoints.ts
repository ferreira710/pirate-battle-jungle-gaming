import {
	API_PATHS,
	type HistoryPage,
	type HistoryQuery,
	type RankingPage,
	type RankingQuery,
	type RegisterMatchRequest,
	type RegisterMatchResponse,
} from "./contracts";
import {
	isHistoryPage,
	isRankingPage,
	isRegisterMatchResponse,
} from "./guards";
import { ApiError, httpClient } from "./httpClient";

function invalid(): ApiError {
	return new ApiError(
		"invalid-response",
		"The server sent an unexpected response.",
	);
}

export async function fetchRanking(
	query: RankingQuery,
	signal?: AbortSignal,
): Promise<RankingPage> {
	const { settings, page, pageSize } = query;
	const response = await httpClient.get<unknown>(API_PATHS.ranking, {
		params: {
			sessionTime: settings.sessionTime,
			spawnInterval: settings.spawnInterval,
			mapId: settings.mapId,
			page,
			pageSize,
		},
		signal,
	});
	if (!isRankingPage(response.data)) throw invalid();
	return response.data;
}

export async function fetchHistory(
	query: HistoryQuery,
	signal?: AbortSignal,
): Promise<HistoryPage> {
	const response = await httpClient.get<unknown>(
		API_PATHS.history(query.playerId),
		{
			params: { page: query.page, pageSize: query.pageSize },
			signal,
		},
	);
	if (!isHistoryPage(response.data)) throw invalid();
	return response.data;
}

export async function registerMatch(
	request: RegisterMatchRequest,
	signal?: AbortSignal,
): Promise<RegisterMatchResponse> {
	const response = await httpClient.put<unknown>(
		API_PATHS.match(request.matchId),
		request,
		{
			headers: { "Idempotency-Key": request.matchId },
			signal,
		},
	);
	if (!isRegisterMatchResponse(response.data)) throw invalid();
	return response.data;
}
