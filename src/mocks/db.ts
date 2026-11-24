import type {
	HistoryPage,
	MatchRecord,
	MatchSettings,
	RankingEntry,
	RankingPage,
	RegisterMatchRequest,
} from "../api/contracts";
import { isMatchRecord } from "../api/guards";
import {
	readStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "../storage/localStore";
import { createFixtureRecords } from "./fixtures";

const DB_CODEC: StorageCodec<MatchRecord[]> = {
	key: `${STORAGE_PREFIX}mock-db`,
	version: 1,
	parse(data) {
		if (!Array.isArray(data)) return null;
		return data.filter(isMatchRecord);
	},
};

let records: MatchRecord[] | null = null;

function table(): MatchRecord[] {
	if (!records) {
		records = readStored(DB_CODEC) ?? createFixtureRecords();
		writeStored(DB_CODEC, records);
	}
	return records;
}

function persist(): void {
	writeStored(DB_CODEC, table());
}

function sameSettings(a: MatchSettings, b: MatchSettings): boolean {
	return (
		a.sessionTime === b.sessionTime &&
		a.spawnInterval === b.spawnInterval &&
		a.mapId === b.mapId
	);
}

function samePayload(
	record: MatchRecord,
	request: RegisterMatchRequest,
): boolean {
	return (
		record.playerId === request.playerId &&
		record.score === request.score &&
		record.duration === request.duration &&
		record.endReason === request.endReason &&
		record.playedAt === request.playedAt &&
		sameSettings(record.settings, request.settings)
	);
}

export function compareRanking(a: MatchRecord, b: MatchRecord): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.duration !== b.duration) return a.duration - b.duration;
	if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
	return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

function paginate<T>(items: readonly T[], page: number, pageSize: number) {
	const totalItems = items.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const start = (page - 1) * pageSize;
	return {
		items: items.slice(start, start + pageSize),
		page,
		pageSize,
		totalItems,
		totalPages,
	};
}

export type InsertResult =
	| { readonly kind: "created"; readonly record: MatchRecord }
	| { readonly kind: "existing"; readonly record: MatchRecord }
	| { readonly kind: "conflict" };

export function insertMatch(request: RegisterMatchRequest): InsertResult {
	const existing = table().find((record) => record.matchId === request.matchId);
	if (existing) {
		return samePayload(existing, request)
			? { kind: "existing", record: existing }
			: { kind: "conflict" };
	}

	const record: MatchRecord = {
		...request,
		recordedAt: new Date().toISOString(),
	};
	table().push(record);
	persist();
	return { kind: "created", record };
}

export function queryRanking(
	settings: MatchSettings,
	page: number,
	pageSize: number,
): RankingPage {
	const ranked: RankingEntry[] = table()
		.filter((record) => sameSettings(record.settings, settings))
		.sort(compareRanking)
		.map((record, index) => ({
			rank: index + 1,
			matchId: record.matchId,
			playerId: record.playerId,
			playerName: record.playerName,
			score: record.score,
			duration: record.duration,
			endReason: record.endReason,
			playedAt: record.playedAt,
		}));

	return { ...paginate(ranked, page, pageSize), settings };
}

export function queryHistory(
	playerId: string,
	page: number,
	pageSize: number,
): HistoryPage {
	const matches = table()
		.filter((record) => record.playerId === playerId)
		.sort((a, b) =>
			a.playedAt === b.playedAt
				? a.matchId.localeCompare(b.matchId)
				: a.playedAt < b.playedAt
					? 1
					: -1,
		);

	return paginate(matches, page, pageSize);
}

export function resetDb(): void {
	records = createFixtureRecords();
	persist();
}
