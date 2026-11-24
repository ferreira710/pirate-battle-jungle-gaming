import { isRecord } from "../storage/localStore";
import type {
	ApiErrorBody,
	EndReason,
	HistoryPage,
	MatchRecord,
	MatchSettings,
	RankingEntry,
	RankingPage,
	RegisterMatchRequest,
	RegisterMatchResponse,
} from "./contracts";

function isString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return isNonNegativeNumber(value) && Number.isInteger(value);
}

function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isEndReason(value: unknown): value is EndReason {
	return value === "time" || value === "death";
}

export function isMatchSettings(value: unknown): value is MatchSettings {
	if (!isRecord(value)) return false;
	return (
		isNonNegativeNumber(value.sessionTime) &&
		isNonNegativeNumber(value.spawnInterval) &&
		isString(value.mapId)
	);
}

export function isRegisterMatchRequest(
	value: unknown,
): value is RegisterMatchRequest {
	if (!isRecord(value)) return false;
	return (
		isString(value.matchId) &&
		isString(value.playerId) &&
		isString(value.playerName) &&
		isIsoDate(value.playedAt) &&
		isNonNegativeInteger(value.score) &&
		isNonNegativeNumber(value.duration) &&
		isEndReason(value.endReason) &&
		isMatchSettings(value.settings)
	);
}

export function isMatchRecord(value: unknown): value is MatchRecord {
	return (
		isRegisterMatchRequest(value) &&
		isRecord(value) &&
		isIsoDate(value.recordedAt)
	);
}

export function isRankingEntry(value: unknown): value is RankingEntry {
	if (!isRecord(value)) return false;
	return (
		isNonNegativeInteger(value.rank) &&
		isString(value.matchId) &&
		isString(value.playerId) &&
		isString(value.playerName) &&
		isNonNegativeInteger(value.score) &&
		isNonNegativeNumber(value.duration) &&
		isEndReason(value.endReason) &&
		isIsoDate(value.playedAt)
	);
}

function isPageShape(
	value: unknown,
): value is Record<string, unknown> & { items: unknown[] } {
	if (!isRecord(value) || !Array.isArray(value.items)) return false;
	return (
		isNonNegativeInteger(value.page) &&
		isNonNegativeInteger(value.pageSize) &&
		isNonNegativeInteger(value.totalItems) &&
		isNonNegativeInteger(value.totalPages)
	);
}

export function isRankingPage(value: unknown): value is RankingPage {
	return (
		isPageShape(value) &&
		isMatchSettings(value.settings) &&
		value.items.every(isRankingEntry)
	);
}

export function isHistoryPage(value: unknown): value is HistoryPage {
	return isPageShape(value) && value.items.every(isMatchRecord);
}

export function isRegisterMatchResponse(
	value: unknown,
): value is RegisterMatchResponse {
	return (
		isRecord(value) &&
		typeof value.created === "boolean" &&
		isMatchRecord(value.record)
	);
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
	return (
		isRecord(value) &&
		isRecord(value.error) &&
		isString(value.error.code) &&
		isString(value.error.message)
	);
}
