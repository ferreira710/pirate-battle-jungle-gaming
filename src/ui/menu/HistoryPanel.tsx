import { useEffect, useState, useSyncExternalStore } from "react";
import { useHistoryQuery } from "../../api/queries";
import { getPlayerIdentity } from "../../storage/playerIdentity";
import {
	getUnconfirmedRegistrations,
	requestSync,
	subscribeOutbox,
} from "../../storage/registrationOutbox";
import { Pagination } from "../components/Pagination";
import { formatClock, formatDate, formatEndReason } from "../format";
import {
	EmptyState,
	ErrorState,
	LoadingState,
	RefreshNotice,
} from "./DataStates";

function getPendingCount(): number {
	return getUnconfirmedRegistrations().length;
}

function PendingNotice() {
	const pending = useSyncExternalStore(
		subscribeOutbox,
		getPendingCount,
		getPendingCount,
	);
	if (pending === 0) return null;

	return (
		<div className="pending-notice" role="status" data-testid="history-pending">
			<p>
				{pending === 1 ? "1 match is" : `${pending} matches are`} waiting to be
				saved.
			</p>
			<button
				type="button"
				className="pager-btn pager-btn--small"
				onClick={requestSync}
				data-testid="history-pending-retry"
			>
				Retry now
			</button>
		</div>
	);
}

export function HistoryPanel() {
	const [page, setPage] = useState(1);
	const identity = getPlayerIdentity();
	const {
		data,
		error,
		isPending,
		isError,
		isFetching,
		isPlaceholderData,
		refetch,
	} = useHistoryQuery(identity.id, page);

	useEffect(() => {
		if (data && page > data.totalPages) setPage(data.totalPages);
	}, [data, page]);

	return (
		<div className="data-view">
			<PendingNotice />

			{isPending ? (
				<LoadingState label="Loading match history…" testId="history-loading" />
			) : isError && !data ? (
				<ErrorState
					title="Your match history is unavailable."
					error={error}
					onRetry={() => void refetch()}
					retrying={isFetching}
					testId="history-error"
				/>
			) : (
				<>
					<div className="data-view__header">
						<p className="data-view__caption">Battles of {identity.name}</p>
						<RefreshNotice
							fetching={isFetching}
							failed={isError}
							onRetry={() => void refetch()}
							testId="history-refresh"
						/>
					</div>

					{data.items.length === 0 ? (
						<EmptyState
							message="No battles yet. Play a match to start your history."
							testId="history-empty"
						/>
					) : (
						<section className="table-scroll" aria-label="Match history table">
							<table
								className="data-table"
								aria-busy={isPlaceholderData || undefined}
								data-testid="history-table"
							>
								<caption className="sr-only">
									Match history, page {data.page} of {data.totalPages}
								</caption>
								<thead>
									<tr>
										<th scope="col">Date</th>
										<th scope="col">Score</th>
										<th scope="col">Time</th>
										<th scope="col">Ended by</th>
										<th scope="col">Settings</th>
									</tr>
								</thead>
								<tbody>
									{data.items.map((record) => (
										<tr
											key={record.matchId}
											data-testid="history-row"
											data-match-id={record.matchId}
										>
											<th scope="row">{formatDate(record.playedAt)}</th>
											<td className="data-table__number">{record.score}</td>
											<td className="data-table__number">
												{formatClock(record.duration)}
											</td>
											<td>{formatEndReason(record.endReason)}</td>
											<td>
												{record.settings.sessionTime} s ·{" "}
												{record.settings.spawnInterval} s
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}

					<Pagination
						label="Match history pages"
						page={data.page}
						totalPages={data.totalPages}
						busy={isPlaceholderData}
						onChange={setPage}
						testId="history-pagination"
					/>
				</>
			)}
		</div>
	);
}
