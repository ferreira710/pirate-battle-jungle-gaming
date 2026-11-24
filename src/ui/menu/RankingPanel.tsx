import { useEffect, useMemo, useState } from "react";
import type { MatchSettings } from "../../api/contracts";
import { rankingSettingsFor, useRankingQuery } from "../../api/queries";
import { useOptions } from "../../storage/optionsStore";
import { getPlayerIdentity } from "../../storage/playerIdentity";
import { Pagination } from "../components/Pagination";
import { formatClock, formatDate, formatEndReason } from "../format";
import {
	EmptyState,
	ErrorState,
	LoadingState,
	RefreshNotice,
} from "./DataStates";

function RankingContent({ settings }: { settings: MatchSettings }) {
	const [page, setPage] = useState(1);
	const playerId = getPlayerIdentity().id;
	const {
		data,
		error,
		isPending,
		isError,
		isFetching,
		isPlaceholderData,
		refetch,
	} = useRankingQuery(settings, page);

	useEffect(() => {
		if (data && page > data.totalPages) setPage(data.totalPages);
	}, [data, page]);

	const settingsLabel = `${settings.sessionTime} s matches · enemy every ${settings.spawnInterval} s`;

	if (isPending)
		return <LoadingState label="Loading ranking…" testId="ranking-loading" />;

	if (isError && !data) {
		return (
			<ErrorState
				title="The ranking is unavailable."
				error={error}
				onRetry={() => void refetch()}
				retrying={isFetching}
				testId="ranking-error"
			/>
		);
	}

	return (
		<div className="data-view">
			<div className="data-view__header">
				<p className="data-view__caption" data-testid="ranking-settings">
					{settingsLabel}
				</p>
				<RefreshNotice
					fetching={isFetching}
					failed={isError}
					onRetry={() => void refetch()}
					testId="ranking-refresh"
				/>
			</div>

			{data.items.length === 0 ? (
				<EmptyState
					message="No battles recorded for these settings yet."
					testId="ranking-empty"
				/>
			) : (
				<section className="table-scroll" aria-label="Ranking table">
					<table
						className="data-table"
						aria-busy={isPlaceholderData || undefined}
						data-testid="ranking-table"
					>
						<caption className="sr-only">
							Ranking for {settingsLabel}, page {data.page} of {data.totalPages}
						</caption>
						<thead>
							<tr>
								<th scope="col">#</th>
								<th scope="col">Captain</th>
								<th scope="col">Score</th>
								<th scope="col">Time</th>
								<th scope="col">Ended by</th>
								<th scope="col">Date</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((entry) => {
								const isPlayer = entry.playerId === playerId;
								return (
									<tr
										key={entry.matchId}
										data-current={isPlayer || undefined}
										data-testid="ranking-row"
									>
										<td className="data-table__rank">{entry.rank}</td>
										<th scope="row">
											{entry.playerName}
											{isPlayer && <span className="badge">You</span>}
										</th>
										<td className="data-table__number">{entry.score}</td>
										<td className="data-table__number">
											{formatClock(entry.duration)}
										</td>
										<td>{formatEndReason(entry.endReason)}</td>
										<td>{formatDate(entry.playedAt)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</section>
			)}

			<Pagination
				label="Ranking pages"
				page={data.page}
				totalPages={data.totalPages}
				busy={isPlaceholderData}
				onChange={setPage}
				testId="ranking-pagination"
			/>
		</div>
	);
}

export function RankingPanel() {
	const options = useOptions();
	const settings = useMemo(() => rankingSettingsFor(options), [options]);

	return (
		<RankingContent
			key={`${settings.mapId}-${settings.sessionTime}-${settings.spawnInterval}`}
			settings={settings}
		/>
	);
}
