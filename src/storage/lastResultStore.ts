import { useSyncExternalStore } from "react";
import { sanitizeOptions } from "../game/config/playerOptions";
import type { MatchOutcome } from "../game/session/gameSession";
import {
	isRecord,
	readStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "./localStore";

export interface LastResult extends MatchOutcome {
	readonly matchId: string;
	readonly playerId: string;
}

export function parseLastResult(data: unknown): LastResult | null {
	if (!isRecord(data)) return null;
	const {
		matchId,
		playerId,
		reason,
		score,
		duration,
		seed,
		mapId,
		options,
		endedAt,
	} = data;

	if (typeof matchId !== "string" || matchId === "") return null;
	if (typeof playerId !== "string" || playerId === "") return null;
	if (reason !== "time" && reason !== "death") return null;
	if (typeof score !== "number" || !Number.isInteger(score) || score < 0)
		return null;
	if (
		typeof duration !== "number" ||
		!Number.isFinite(duration) ||
		duration < 0
	)
		return null;
	if (typeof seed !== "number" || typeof mapId !== "string") return null;
	if (typeof endedAt !== "string" || Number.isNaN(Date.parse(endedAt)))
		return null;

	const parsedOptions = sanitizeOptions(options);
	if (!parsedOptions) return null;

	return Object.freeze({
		matchId,
		playerId,
		reason,
		score,
		duration,
		seed,
		mapId,
		options: Object.freeze(parsedOptions),
		endedAt,
	});
}

const LAST_RESULT_CODEC: StorageCodec<LastResult> = {
	key: `${STORAGE_PREFIX}last-result`,
	version: 1,
	parse: parseLastResult,
};

const listeners = new Set<() => void>();
let current: LastResult | null = readStored(LAST_RESULT_CODEC);

export function getLastResult(): LastResult | null {
	return current;
}

export function saveLastResult(result: LastResult): boolean {
	current = Object.freeze({ ...result });
	const saved = writeStored(LAST_RESULT_CODEC, current);
	for (const listener of listeners) listener();
	return saved;
}

export function subscribeLastResult(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useLastResult(): LastResult | null {
	return useSyncExternalStore(
		subscribeLastResult,
		getLastResult,
		getLastResult,
	);
}
