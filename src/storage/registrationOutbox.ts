import { useSyncExternalStore } from "react";
import { type LastResult, parseLastResult } from "./lastResultStore";
import {
	isRecord,
	readStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "./localStore";

export type RegistrationStatus = "pending" | "sending" | "confirmed" | "failed";

export interface OutboxEntry {
	readonly matchId: string;
	readonly result: LastResult;
	readonly playerName: string;
	readonly status: RegistrationStatus;
	readonly attempts: number;
	readonly lastError: string | null;
	readonly updatedAt: string;
}

const STATUSES: readonly RegistrationStatus[] = [
	"pending",
	"sending",
	"confirmed",
	"failed",
];
const MAX_CONFIRMED = 10;

function parseEntry(data: unknown): OutboxEntry | null {
	if (!isRecord(data)) return null;
	const result = parseLastResult(data.result);
	const { playerName, status, attempts, lastError, updatedAt } = data;

	if (!result) return null;
	if (typeof playerName !== "string" || playerName === "") return null;
	if (
		typeof status !== "string" ||
		!STATUSES.includes(status as RegistrationStatus)
	)
		return null;
	if (
		typeof attempts !== "number" ||
		!Number.isInteger(attempts) ||
		attempts < 0
	)
		return null;
	if (lastError !== null && typeof lastError !== "string") return null;
	if (typeof updatedAt !== "string") return null;

	return Object.freeze({
		matchId: result.matchId,
		result,
		playerName,
		status: status as RegistrationStatus,
		attempts,
		lastError,
		updatedAt,
	});
}

const OUTBOX_CODEC: StorageCodec<OutboxEntry[]> = {
	key: `${STORAGE_PREFIX}registration-outbox`,
	version: 1,
	parse(data) {
		if (!Array.isArray(data)) return null;
		return data.flatMap((item) => {
			const entry = parseEntry(item);
			return entry ? [entry] : [];
		});
	},
};

const listeners = new Set<() => void>();
const syncListeners = new Set<() => void>();
let entries: readonly OutboxEntry[] = load();

function load(): readonly OutboxEntry[] {
	const stored = readStored(OUTBOX_CODEC) ?? [];
	return stored.map((entry) =>
		entry.status === "sending"
			? Object.freeze({ ...entry, status: "pending" })
			: entry,
	);
}

function prune(list: readonly OutboxEntry[]): readonly OutboxEntry[] {
	const confirmed = list.filter((entry) => entry.status === "confirmed");
	const excess = confirmed.length - MAX_CONFIRMED;
	if (excess <= 0) return list;
	const dropped = new Set(
		confirmed.slice(0, excess).map((entry) => entry.matchId),
	);
	return list.filter((entry) => !dropped.has(entry.matchId));
}

function commit(next: readonly OutboxEntry[]): void {
	entries = prune(next);
	writeStored(OUTBOX_CODEC, [...entries]);
	for (const listener of listeners) listener();
}

function update(
	matchId: string,
	patch: Partial<Pick<OutboxEntry, "status" | "attempts" | "lastError">>,
): void {
	let changed = false;
	const next = entries.map((entry) => {
		if (entry.matchId !== matchId) return entry;
		changed = true;
		return Object.freeze({
			...entry,
			...patch,
			updatedAt: new Date().toISOString(),
		});
	});
	if (changed) commit(next);
}

export function enqueueRegistration(
	result: LastResult,
	playerName: string,
): void {
	if (entries.some((entry) => entry.matchId === result.matchId)) return;
	const entry: OutboxEntry = Object.freeze({
		matchId: result.matchId,
		result,
		playerName,
		status: "pending",
		attempts: 0,
		lastError: null,
		updatedAt: new Date().toISOString(),
	});
	commit([...entries, entry]);
	requestSync();
}

export function markSending(matchId: string): void {
	const entry = getRegistration(matchId);
	if (!entry || entry.status === "confirmed") return;
	update(matchId, { status: "sending", attempts: entry.attempts + 1 });
}

export function markConfirmed(matchId: string): void {
	update(matchId, { status: "confirmed", lastError: null });
}

export function markFailed(matchId: string, message: string): void {
	const entry = getRegistration(matchId);
	if (!entry || entry.status === "confirmed") return;
	update(matchId, { status: "failed", lastError: message });
}

export function getRegistration(matchId: string): OutboxEntry | null {
	return entries.find((entry) => entry.matchId === matchId) ?? null;
}

export function getUnconfirmedRegistrations(): readonly OutboxEntry[] {
	return entries.filter((entry) => entry.status !== "confirmed");
}

export function subscribeOutbox(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useRegistration(matchId: string | null): OutboxEntry | null {
	const getSnapshot = () => (matchId ? getRegistration(matchId) : null);
	return useSyncExternalStore(subscribeOutbox, getSnapshot, getSnapshot);
}

export function requestSync(): void {
	for (const listener of syncListeners) listener();
}

export function subscribeSyncRequests(listener: () => void): () => void {
	syncListeners.add(listener);
	return () => {
		syncListeners.delete(listener);
	};
}

window.addEventListener("storage", (event) => {
	if (event.key !== OUTBOX_CODEC.key) return;
	entries = load();
	for (const listener of listeners) listener();
});
