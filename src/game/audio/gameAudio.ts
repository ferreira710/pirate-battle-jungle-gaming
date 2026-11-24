import {
	type AudioEngine,
	audioEngine,
	type SoundName,
} from "../../audio/audioEngine";
import type { GameSession, MatchSnapshot } from "../session/gameSession";
import type { GameEvent } from "../sim/state";

const SAILING_POLL_MS = 100;
const TIME_WARNING_SECONDS = 10;
const LOW_HEALTH_RATIO = 0.3;
const OCEAN_VOLUME = 0.35;
const OCEAN_PAUSED_VOLUME = 0.12;
const SAILING_VOLUME = 0.25;

function pick(names: readonly SoundName[]): SoundName {
	return (
		names[Math.floor(Math.random() * names.length)] ?? names[0] ?? "ui_click"
	);
}

function playEvent(engine: AudioEngine, event: GameEvent): void {
	switch (event.type) {
		case "shot":
			if (event.owner === "enemy") {
				engine.play(pick(["cannon_fire_1", "cannon_fire_2", "cannon_fire_3"]), {
					volume: 0.35,
					rate: 0.9,
				});
			} else if (event.weapon === "front") {
				engine.play(pick(["cannon_fire_1", "cannon_fire_2", "cannon_fire_3"]), {
					volume: 0.6,
				});
			} else {
				engine.play("cannon_broadside", { volume: 0.7 });
			}
			break;
		case "shipHit":
			engine.play(pick(["ship_wood_hit_1", "ship_wood_hit_2"]), {
				volume: 0.5,
			});
			break;
		case "shipDestroyed":
			engine.play(pick(["ship_explosion_1", "ship_explosion_2"]), {
				volume: 0.75,
			});
			engine.play("ship_sinking", { volume: 0.4 });
			break;
		case "chaserImpact":
			engine.play("ship_collision", { volume: 0.7 });
			break;
		case "projectileExpired":
			engine.play(pick(["cannonball_water_hit_1", "cannonball_water_hit_2"]), {
				volume: 0.25,
			});
			break;
		case "projectileBlocked":
			engine.play("ship_wood_hit_2", { volume: 0.25, rate: 1.3 });
			break;
		case "scored":
			engine.play("score_point", { volume: 0.5 });
			break;
		case "matchEnded":
			engine.play(event.reason === "time" ? "game_complete" : "game_over", {
				volume: 0.8,
			});
			engine.setLoop("ship_sailing_loop", 0);
			break;
		default:
			break;
	}
}

export function bindGameAudio(
	session: GameSession,
	engine: AudioEngine = audioEngine,
): () => void {
	let previous: MatchSnapshot = session.getSnapshot();
	let warnedSecond = -1;
	let lowHealthWarned = false;
	let sailing = false;

	engine.play("game_start", { volume: 0.7 });
	engine.setLoop("ocean_ambience_loop", OCEAN_VOLUME);

	const unsubscribeEvents = session.subscribeEvents((events) => {
		for (const event of events) {
			playEvent(engine, event);
		}
	});

	const unsubscribeSnapshot = session.subscribe(() => {
		const snapshot = session.getSnapshot();

		if (snapshot.phase !== previous.phase) {
			if (snapshot.phase === "paused") {
				engine.play("game_pause", { volume: 0.6 });
				engine.setLoop("ocean_ambience_loop", OCEAN_PAUSED_VOLUME);
			} else if (snapshot.phase === "running" && previous.phase === "paused") {
				engine.play("game_resume", { volume: 0.6 });
				engine.setLoop("ocean_ambience_loop", OCEAN_VOLUME);
			}
		}

		if (
			snapshot.phase === "running" &&
			snapshot.remainingSeconds > 0 &&
			snapshot.remainingSeconds <= TIME_WARNING_SECONDS &&
			snapshot.remainingSeconds !== warnedSecond
		) {
			warnedSecond = snapshot.remainingSeconds;
			engine.play("time_warning", { volume: 0.5 });
		}

		const ratio =
			snapshot.maxHealth > 0 ? snapshot.health / snapshot.maxHealth : 0;
		if (!lowHealthWarned && snapshot.health > 0 && ratio <= LOW_HEALTH_RATIO) {
			lowHealthWarned = true;
			engine.play("health_low", { volume: 0.6 });
		}

		previous = snapshot;
	});

	const sailingTimer = window.setInterval(() => {
		const next =
			session.getState().phase === "running" && session.input.read().forward;
		if (next === sailing) return;
		sailing = next;
		engine.setLoop("ship_sailing_loop", sailing ? SAILING_VOLUME : 0);
	}, SAILING_POLL_MS);

	return () => {
		window.clearInterval(sailingTimer);
		unsubscribeEvents();
		unsubscribeSnapshot();
		engine.stopLoops();
	};
}
