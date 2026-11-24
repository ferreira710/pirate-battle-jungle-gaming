import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
	GameSession,
	MatchSnapshot,
} from "../../game/session/gameSession";
import { IconButton } from "../components/IconButton";

const HUD_PATH = `${import.meta.env.BASE_URL}assets/png/default/ui/hud`;
const LOW_HEALTH_RATIO = 0.3;
const TIME_WARNINGS = [30, 10];

function formatTime(totalSeconds: number): string {
	const safe = Math.max(0, totalSeconds);
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function fillFor(ratio: number): string {
	if (ratio > 0.6) return "health_fill_green";
	if (ratio > LOW_HEALTH_RATIO) return "health_fill_amber";
	return "health_fill_red";
}

function healthRatio(snapshot: MatchSnapshot): number {
	return snapshot.maxHealth > 0 ? snapshot.health / snapshot.maxHealth : 0;
}

function describeChange(
	previous: MatchSnapshot,
	next: MatchSnapshot,
): string | null {
	if (previous.phase !== next.phase) {
		if (next.phase === "paused") return "Game paused.";
		if (next.phase === "running") return "Game resumed.";
		if (next.phase === "ended") {
			const cause =
				next.endReason === "time" ? "Time's up." : "Your ship has sunk.";
			return `${cause} Final score: ${next.score}.`;
		}
	}

	for (const mark of TIME_WARNINGS) {
		if (
			previous.remainingSeconds > mark &&
			next.remainingSeconds <= mark &&
			next.phase === "running"
		) {
			return `${mark} seconds left.`;
		}
	}

	if (
		healthRatio(previous) > LOW_HEALTH_RATIO &&
		healthRatio(next) <= LOW_HEALTH_RATIO &&
		next.health > 0
	) {
		return "Warning: hull integrity low.";
	}

	return null;
}

interface HudProps {
	session: GameSession;
	onPause: () => void;
}

export function Hud({ session, onPause }: HudProps) {
	const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
	const previous = useRef(snapshot);
	const [announcement, setAnnouncement] = useState("");

	useEffect(() => {
		const message = describeChange(previous.current, snapshot);
		previous.current = snapshot;
		if (message) setAnnouncement(message);
	}, [snapshot]);

	const ratio = Math.min(1, Math.max(0, healthRatio(snapshot)));
	const health = Math.ceil(snapshot.health);

	return (
		<section
			className="hud"
			aria-label="Match status"
			data-phase={snapshot.phase}
		>
			<div className="hud__health">
				<img
					className="hud__icon"
					src={`${HUD_PATH}/icon_heart.png`}
					alt=""
					aria-hidden="true"
				/>
				<meter
					className="health-bar"
					aria-label="Ship health"
					aria-valuetext={`${health} of ${snapshot.maxHealth}`}
					min={0}
					max={snapshot.maxHealth}
					value={health}
					style={{ ["--ratio" as string]: ratio }}
					data-testid="hud-health"
					data-value={health}
				>
					<img
						className="health-bar__frame"
						src={`${HUD_PATH}/health_frame.png`}
						alt=""
						aria-hidden="true"
					/>
					<span className="health-bar__clip">
						<img
							className="health-bar__fill"
							src={`${HUD_PATH}/${fillFor(ratio)}.png`}
							alt=""
							aria-hidden="true"
						/>
					</span>
					<span className="health-bar__text" aria-hidden="true">
						{health} / {snapshot.maxHealth}
					</span>
				</meter>
			</div>

			<dl className="hud__counters">
				<div className="counter">
					<dt>
						<img
							className="hud__icon"
							src={`${HUD_PATH}/icon_score.png`}
							alt=""
							aria-hidden="true"
						/>
						<span className="sr-only">Score</span>
					</dt>
					<dd data-testid="hud-score">{snapshot.score}</dd>
				</div>
				<div className="counter">
					<dt>
						<img
							className="hud__icon"
							src={`${HUD_PATH}/icon_time.png`}
							alt=""
							aria-hidden="true"
						/>
						<span className="sr-only">Time left</span>
					</dt>
					<dd data-testid="hud-time" data-seconds={snapshot.remainingSeconds}>
						<time dateTime={`PT${snapshot.remainingSeconds}S`}>
							{formatTime(snapshot.remainingSeconds)}
						</time>
					</dd>
				</div>
			</dl>

			<IconButton
				className="hud__pause"
				icon="pause"
				label="Pause game"
				onClick={onPause}
				disabled={snapshot.phase !== "running"}
				data-testid="hud-pause"
			/>

			{snapshot.phase === "ended" && (
				<div className="end-banner" data-testid="end-banner">
					{snapshot.endReason === "time" ? "Time's up!" : "Your ship has sunk!"}
				</div>
			)}

			<p className="sr-only" aria-live="polite" data-testid="hud-announcer">
				{announcement}
			</p>
		</section>
	);
}
