import { ApiError } from "../../api/httpClient";

export function errorMessage(error: unknown): string {
	return error instanceof ApiError ? error.message : "Something went wrong.";
}

export function LoadingState({
	label,
	testId,
}: {
	label: string;
	testId: string;
}) {
	return (
		<div
			className="data-state data-state--loading"
			role="status"
			data-testid={testId}
		>
			<span className="spinner" aria-hidden="true" />
			<span>{label}</span>
		</div>
	);
}

export function EmptyState({
	message,
	testId,
}: {
	message: string;
	testId: string;
}) {
	return (
		<div className="data-state" data-testid={testId}>
			<p>{message}</p>
		</div>
	);
}

interface ErrorStateProps {
	title: string;
	error: unknown;
	onRetry: () => void;
	retrying: boolean;
	testId: string;
}

export function ErrorState({
	title,
	error,
	onRetry,
	retrying,
	testId,
}: ErrorStateProps) {
	return (
		<div
			className="data-state data-state--error"
			role="alert"
			data-testid={testId}
		>
			<p className="data-state__title">{title}</p>
			<p>{errorMessage(error)}</p>
			<button
				type="button"
				className="pager-btn"
				onClick={onRetry}
				disabled={retrying}
				data-testid={`${testId}-retry`}
			>
				{retrying ? "Retrying…" : "Try again"}
			</button>
		</div>
	);
}

interface RefreshNoticeProps {
	fetching: boolean;
	failed: boolean;
	onRetry: () => void;
	testId: string;
}

export function RefreshNotice({
	fetching,
	failed,
	onRetry,
	testId,
}: RefreshNoticeProps) {
	return (
		<div
			className="refresh-notice"
			data-testid={testId}
			data-state={fetching ? "fetching" : failed ? "stale" : "idle"}
		>
			<p aria-live="polite" className="refresh-notice__text">
				{fetching
					? "Updating…"
					: failed
						? "Could not refresh. Showing the last saved results."
						: ""}
			</p>
			{failed && !fetching && (
				<button
					type="button"
					className="pager-btn pager-btn--small"
					onClick={onRetry}
					data-testid={`${testId}-retry`}
				>
					Refresh
				</button>
			)}
		</div>
	);
}
