import { navigate } from "../../app/router";
import { useLastResult } from "../../storage/lastResultStore";
import {
	type OutboxEntry,
	requestSync,
	useRegistration,
} from "../../storage/registrationOutbox";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { formatClock, formatEndReason } from "../format";
import { useScreenFocus } from "../hooks/useScreenFocus";

function registrationMessage(entry: OutboxEntry | null): string {
	if (!entry) return "Not registered.";
	switch (entry.status) {
		case "pending":
			return "Waiting to save your match…";
		case "sending":
			return "Saving your match…";
		case "confirmed":
			return "Saved to ranking and match history.";
		case "failed":
			return "Could not save your match yet. Your result is kept on this device.";
	}
}

export function ResultScreen() {
	const result = useLastResult();
	const registration = useRegistration(result?.matchId ?? null);
	const headingRef = useScreenFocus<HTMLHeadingElement>();

	if (!result) {
		return (
			<main className="screen screen--result">
				<Panel heading="No results yet" headingRef={headingRef}>
					<p className="result__empty">
						Finish a battle to see your result here.
					</p>
					<div className="form-actions">
						<Button onClick={() => navigate("play")} data-testid="result-play">
							Play
						</Button>
						<Button
							variant="secondary"
							onClick={() => navigate("menu")}
							data-testid="result-menu"
						>
							Main Menu
						</Button>
					</div>
				</Panel>
			</main>
		);
	}

	const heading =
		result.reason === "time" ? "You survived!" : "Your ship has sunk";
	const status = registration?.status ?? "none";

	return (
		<main className="screen screen--result">
			<Panel heading={heading} headingRef={headingRef}>
				<dl className="result-summary" data-testid="result-summary">
					<div className="result-summary__row result-summary__row--score">
						<dt>Score</dt>
						<dd data-testid="result-score">{result.score}</dd>
					</div>
					<div className="result-summary__row">
						<dt>Time played</dt>
						<dd data-testid="result-duration" data-seconds={result.duration}>
							<time dateTime={`PT${result.duration}S`}>
								{formatClock(result.duration)}
							</time>
						</dd>
					</div>
					<div className="result-summary__row">
						<dt>Ended by</dt>
						<dd data-testid="result-reason" data-reason={result.reason}>
							{formatEndReason(result.reason)}
						</dd>
					</div>
					<div className="result-summary__row">
						<dt>Settings</dt>
						<dd data-testid="result-settings">
							{result.options.sessionTime} s match · enemy every{" "}
							{result.options.spawnInterval} s
						</dd>
					</div>
				</dl>

				<div
					className="registration"
					data-status={status}
					data-testid="result-registration"
				>
					<p className="registration__text" role="status">
						{registrationMessage(registration)}
					</p>
					{registration?.status === "failed" && (
						<Button
							variant="secondary"
							onClick={requestSync}
							data-testid="result-retry"
						>
							Retry now
						</Button>
					)}
				</div>

				<div className="form-actions">
					<Button
						onClick={() => navigate("play")}
						data-testid="result-play-again"
					>
						Play Again
					</Button>
					<Button
						variant="secondary"
						onClick={() => navigate("menu")}
						data-testid="result-menu"
					>
						Main Menu
					</Button>
				</div>
			</Panel>
		</main>
	);
}
