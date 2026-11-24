import type { PlayerCommands } from "./commands";
import type { EndReason, GameState } from "./state";
import { removeDeadEntities } from "./systems/cleanup";
import { resolveChaserImpacts, resolveProjectileHits } from "./systems/combat";
import { updateEnemies } from "./systems/enemies";
import { updatePlayerMovement } from "./systems/movement";
import { updateProjectiles } from "./systems/projectiles";
import { updateSpawns } from "./systems/spawn";
import { updatePlayerWeapons } from "./systems/weapons";

const TIME_EPSILON = 1e-9;

export function endMatch(state: GameState, reason: EndReason): void {
	if (state.phase === "ended") return;
	state.phase = "ended";
	state.endReason = reason;
	state.events.push({ type: "matchEnded", reason });
}

export function pauseMatch(state: GameState): boolean {
	if (state.phase !== "running") return false;
	state.phase = "paused";
	return true;
}

export function resumeMatch(state: GameState): boolean {
	if (state.phase !== "paused") return false;
	state.phase = "running";
	return true;
}

export function stepSimulation(
	state: GameState,
	commands: PlayerCommands,
	dt: number,
): void {
	if (state.phase !== "running") return;

	updatePlayerMovement(state, commands, dt);
	updatePlayerWeapons(state, commands, dt);
	updateEnemies(state, dt);
	updateSpawns(state, dt);
	updateProjectiles(state, dt);
	resolveProjectileHits(state);
	resolveChaserImpacts(state);
	removeDeadEntities(state);

	const duration = state.config.match.duration;
	state.elapsed = Math.min(duration, state.elapsed + dt);
	state.remaining = Math.max(0, duration - state.elapsed);

	if (!state.player.alive) {
		endMatch(state, "death");
		return;
	}

	if (state.remaining <= TIME_EPSILON) {
		state.remaining = 0;
		state.elapsed = duration;
		endMatch(state, "time");
	}
}
