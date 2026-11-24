import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;

export function shouldRetry(failureCount: number, error: unknown): boolean {
	if (failureCount >= MAX_RETRIES) return false;
	return !(error instanceof ApiError) || error.retryable;
}

export function retryDelay(attempt: number): number {
	return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 5 * 60_000,
			retry: shouldRetry,
			retryDelay,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
		},
		mutations: {
			retry: shouldRetry,
			retryDelay,
		},
	},
});
