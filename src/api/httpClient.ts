import axios, { type AxiosError } from "axios";
import { isApiErrorBody } from "./guards";

export type ApiErrorKind =
	| "timeout"
	| "network"
	| "client"
	| "server"
	| "invalid-response"
	| "cancelled"
	| "unknown";

export class ApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status: number | null;
	readonly code: string | null;
	readonly retryable: boolean;

	constructor(
		kind: ApiErrorKind,
		message: string,
		status: number | null = null,
		code: string | null = null,
	) {
		super(message);
		this.name = "ApiError";
		this.kind = kind;
		this.status = status;
		this.code = code;
		this.retryable =
			kind === "timeout" ||
			kind === "network" ||
			kind === "server" ||
			status === 408 ||
			status === 429;
	}
}

const DEFAULT_TIMEOUT_MS = 8000;

function resolveTimeout(): number {
	const raw = new URLSearchParams(window.location.search).get("apiTimeout");
	const value = raw === null ? NaN : Number(raw);
	return Number.isInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

export function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) return error;
	if (axios.isCancel(error))
		return new ApiError("cancelled", "The request was cancelled.");

	if (axios.isAxiosError(error)) {
		const axiosError = error as AxiosError<unknown>;
		if (axiosError.code === "ETIMEDOUT" || axiosError.code === "ECONNABORTED") {
			return new ApiError("timeout", "The server took too long to respond.");
		}
		if (axiosError.code === "ERR_CANCELED") {
			return new ApiError("cancelled", "The request was cancelled.");
		}

		const response = axiosError.response;
		if (!response)
			return new ApiError("network", "Could not reach the server.");

		const body = response.data;
		const code = isApiErrorBody(body) ? body.error.code : null;
		const message = isApiErrorBody(body)
			? body.error.message
			: `Request failed with status ${response.status}.`;
		const kind: ApiErrorKind = response.status >= 500 ? "server" : "client";
		return new ApiError(kind, message, response.status, code);
	}

	return new ApiError("unknown", "Something went wrong.");
}

export const httpClient = axios.create({
	baseURL: import.meta.env.BASE_URL.replace(/\/$/, ""),
	timeout: resolveTimeout(),
	headers: { Accept: "application/json" },
	transitional: { clarifyTimeoutError: true },
});

httpClient.interceptors.response.use(
	(response) => response,
	(error: unknown) => Promise.reject(toApiError(error)),
);
