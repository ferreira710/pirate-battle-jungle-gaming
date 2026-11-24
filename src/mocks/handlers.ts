import { HttpResponse, http } from "msw";
import {
	DEFAULT_PAGE_SIZE,
	MAX_PAGE_SIZE,
	type MatchSettings,
} from "../api/contracts";
import { isRegisterMatchRequest } from "../api/guards";
import { OPTION_LIMITS } from "../game/config/gameConfig";
import { insertMatch, queryHistory, queryRanking } from "./db";
import { afterHandling, beforeHandling, shouldReturnEmpty } from "./network";

const MAX_SCORE = 10_000;
const DURATION_TOLERANCE = 0.5;

function errorResponse(status: number, code: string, message: string) {
	return HttpResponse.json({ error: { code, message } }, { status });
}

function readInt(
	params: URLSearchParams,
	name: string,
	fallback: number,
	max: number,
): number | null {
	const raw = params.get(name);
	if (raw === null) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1 || value > max) return null;
	return value;
}

function readSettings(params: URLSearchParams): MatchSettings | null {
	const sessionTime = Number(params.get("sessionTime"));
	const spawnInterval = Number(params.get("spawnInterval"));
	const mapId = params.get("mapId");
	if (
		!Number.isFinite(sessionTime) ||
		!Number.isFinite(spawnInterval) ||
		!mapId
	)
		return null;
	return { sessionTime, spawnInterval, mapId };
}

function isPlausible(
	score: number,
	duration: number,
	settings: MatchSettings,
): boolean {
	const { sessionTime, spawnInterval } = OPTION_LIMITS;
	return (
		score <= MAX_SCORE &&
		settings.sessionTime >= sessionTime.min &&
		settings.sessionTime <= sessionTime.max &&
		settings.spawnInterval >= spawnInterval.min &&
		settings.spawnInterval <= spawnInterval.max &&
		duration <= settings.sessionTime + DURATION_TOLERANCE
	);
}

function emptyPage<T extends { page: number; pageSize: number }>(page: T): T {
	return { ...page, items: [], totalItems: 0, totalPages: 1 };
}

export const handlers = [
	http.get("*/api/ranking", async ({ request }) => {
		const ticket = await beforeHandling("ranking");
		if (ticket.response) return ticket.response;

		const params = new URL(request.url).searchParams;
		const settings = readSettings(params);
		const page = readInt(params, "page", 1, Number.MAX_SAFE_INTEGER);
		const pageSize = readInt(
			params,
			"pageSize",
			DEFAULT_PAGE_SIZE,
			MAX_PAGE_SIZE,
		);
		if (!settings || page === null || pageSize === null) {
			return errorResponse(400, "INVALID_QUERY", "Invalid ranking query.");
		}

		const result = queryRanking(settings, page, pageSize);
		const late = await afterHandling(ticket);
		if (late) return late;
		return HttpResponse.json(
			shouldReturnEmpty("ranking") ? emptyPage(result) : result,
		);
	}),

	http.get("*/api/players/:playerId/matches", async ({ request, params }) => {
		const ticket = await beforeHandling("history");
		if (ticket.response) return ticket.response;

		const playerId = typeof params.playerId === "string" ? params.playerId : "";
		const search = new URL(request.url).searchParams;
		const page = readInt(search, "page", 1, Number.MAX_SAFE_INTEGER);
		const pageSize = readInt(
			search,
			"pageSize",
			DEFAULT_PAGE_SIZE,
			MAX_PAGE_SIZE,
		);
		if (!playerId || page === null || pageSize === null) {
			return errorResponse(400, "INVALID_QUERY", "Invalid history query.");
		}

		const result = queryHistory(playerId, page, pageSize);
		const late = await afterHandling(ticket);
		if (late) return late;
		return HttpResponse.json(
			shouldReturnEmpty("history") ? emptyPage(result) : result,
		);
	}),

	http.put("*/api/matches/:matchId", async ({ request, params }) => {
		const ticket = await beforeHandling("register");
		if (ticket.response) return ticket.response;

		const body: unknown = await request.json().catch(() => null);
		if (!isRegisterMatchRequest(body) || body.matchId !== params.matchId) {
			return errorResponse(
				400,
				"INVALID_MATCH",
				"The match payload is invalid.",
			);
		}
		if (!isPlausible(body.score, body.duration, body.settings)) {
			return errorResponse(
				422,
				"IMPLAUSIBLE_MATCH",
				"The match data is out of range.",
			);
		}

		const result = insertMatch(body);
		if (result.kind === "conflict") {
			return errorResponse(
				409,
				"MATCH_CONFLICT",
				"A different match is already registered with this id.",
			);
		}

		const late = await afterHandling(ticket);
		if (late) return late;

		return HttpResponse.json(
			{ record: result.record, created: result.kind === "created" },
			{ status: result.kind === "created" ? 201 : 200 },
		);
	}),
];
