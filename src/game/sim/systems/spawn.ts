import type { EnemyKind } from "../../config/gameConfig";
import {
	angleTo,
	type Circle,
	circleIntersectsRect,
	distanceSq,
} from "../geometry";
import { allocateId, type EnemyState, type GameState } from "../state";

const SPAWN_RETRY_DELAY = 0.25;
const ISLAND_CLEARANCE = 16;
const TIMER_EPSILON = 1e-9;

function pickKind(state: GameState): EnemyKind {
	const { openingSequence, weights } = state.config.spawn;
	const scripted = openingSequence[state.spawnCount];
	return scripted ?? state.rng.weighted(weights);
}

function shipSpecFor(state: GameState, kind: EnemyKind) {
	return kind === "chaser"
		? state.config.chaser.ship
		: state.config.shooter.ship;
}

function isSpawnPointFree(state: GameState, candidate: Circle): boolean {
	const minDistance = state.config.spawn.minDistanceFromPlayer;
	if (distanceSq(candidate, state.player) < minDistance * minDistance)
		return false;

	const padded = {
		x: candidate.x,
		y: candidate.y,
		radius: candidate.radius + ISLAND_CLEARANCE,
	};
	for (const rect of state.map.colliders) {
		if (circleIntersectsRect(padded, rect)) return false;
	}

	for (const enemy of state.enemies) {
		if (!enemy.alive) continue;
		const gap = enemy.radius + candidate.radius;
		if (distanceSq(candidate, enemy) < gap * gap) return false;
	}

	return true;
}

function findSpawnPoint(state: GameState, radius: number): Circle | null {
	const { edgeMargin, maxAttempts } = state.config.spawn;
	const { width, height } = state.map;
	const inset = edgeMargin + radius;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const candidate = {
			x: state.rng.range(inset, width - inset),
			y: state.rng.range(inset, height - inset),
			radius,
		};
		if (isSpawnPointFree(state, candidate)) return candidate;
	}

	return null;
}

function spawnEnemy(state: GameState): boolean {
	const kind = pickKind(state);
	const ship = shipSpecFor(state, kind);
	const point = findSpawnPoint(state, ship.radius);
	if (!point) return false;

	const enemy: EnemyState = {
		id: allocateId(state),
		kind,
		x: point.x,
		y: point.y,
		rotation: angleTo(point, state.player),
		health: ship.maxHealth,
		maxHealth: ship.maxHealth,
		radius: ship.radius,
		alive: true,
		cooldown: kind === "shooter" ? state.config.shooter.cannon.cooldown : 0,
	};

	state.enemies.push(enemy);
	state.spawnCount += 1;
	state.events.push({ type: "enemySpawned", targetId: enemy.id, kind });
	return true;
}

export function countAliveEnemies(state: GameState): number {
	let count = 0;
	for (const enemy of state.enemies) {
		if (enemy.alive) count += 1;
	}
	return count;
}

export function updateSpawns(state: GameState, dt: number): void {
	if (!state.player.alive) return;

	state.spawnTimer -= dt;
	if (state.spawnTimer > TIMER_EPSILON) return;

	const { interval, maxAlive } = state.config.spawn;

	if (countAliveEnemies(state) >= maxAlive) {
		state.spawnTimer += interval;
		return;
	}

	if (spawnEnemy(state)) {
		state.spawnTimer += interval;
	} else {
		state.spawnTimer = SPAWN_RETRY_DELAY;
	}
}
