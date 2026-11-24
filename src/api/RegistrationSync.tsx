import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
	getUnconfirmedRegistrations,
	markConfirmed,
	markFailed,
	markSending,
	type OutboxEntry,
	subscribeSyncRequests,
} from "../storage/registrationOutbox";
import type { RegisterMatchRequest, RegisterMatchResponse } from "./contracts";
import { registerMatch } from "./endpoints";
import { ApiError } from "./httpClient";
import { queryKeys, REGISTER_MUTATION_KEY } from "./queryKeys";

const SYNC_INTERVAL_MS = 30_000;

export function toRegisterRequest(entry: OutboxEntry): RegisterMatchRequest {
	const { result } = entry;
	return {
		matchId: result.matchId,
		playerId: result.playerId,
		playerName: entry.playerName,
		playedAt: result.endedAt,
		score: result.score,
		duration: result.duration,
		endReason: result.reason,
		settings: {
			sessionTime: result.options.sessionTime,
			spawnInterval: result.options.spawnInterval,
			mapId: result.mapId,
		},
	};
}

export function RegistrationSync() {
	const queryClient = useQueryClient();
	const inFlight = useRef(new Set<string>());

	const { mutateAsync } = useMutation<
		RegisterMatchResponse,
		unknown,
		OutboxEntry
	>({
		mutationKey: REGISTER_MUTATION_KEY,
		scope: { id: "register-match" },
		mutationFn: (entry) => registerMatch(toRegisterRequest(entry)),
		onMutate: (entry) => {
			markSending(entry.matchId);
		},
		onSuccess: (_response, entry) => {
			markConfirmed(entry.matchId);
			void queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll });
			void queryClient.invalidateQueries({ queryKey: queryKeys.historyAll });
		},
		onError: (error, entry) => {
			markFailed(
				entry.matchId,
				error instanceof ApiError
					? error.message
					: "The match could not be saved.",
			);
		},
	});

	const mutateRef = useRef(mutateAsync);

	useEffect(() => {
		mutateRef.current = mutateAsync;
	}, [mutateAsync]);

	useEffect(() => {
		const pending = inFlight.current;
		let disposed = false;

		const run = () => {
			if (disposed) return;
			for (const entry of getUnconfirmedRegistrations()) {
				if (pending.has(entry.matchId)) continue;
				pending.add(entry.matchId);
				mutateRef
					.current(entry)
					.catch(() => undefined)
					.finally(() => {
						pending.delete(entry.matchId);
					});
			}
		};

		const handleVisibility = () => {
			if (document.visibilityState === "visible") run();
		};

		run();
		const unsubscribe = subscribeSyncRequests(run);
		const interval = window.setInterval(run, SYNC_INTERVAL_MS);
		window.addEventListener("online", run);
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			disposed = true;
			unsubscribe();
			window.clearInterval(interval);
			window.removeEventListener("online", run);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, []);

	return null;
}
