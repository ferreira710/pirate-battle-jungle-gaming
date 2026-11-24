import { AI_TUNING } from "../../config/aiConfig";
import type { ArenaMap } from "../../config/arenaMap";
import {
	angleTo,
	circleIntersectsRect,
	clamp,
	distance,
	normalizeAngle,
} from "../geometry";
import type { EnemyState, GameState, ShipState } from "../state";
import { resolveShipPlacement, steerShip } from "./movement";
import { fireWeapon, isCooldownReady } from "./weapons";

function isPathClear(ship: ShipState, heading: number, map: ArenaMap): boolean {
	const cos = Math.cos(heading);
	const sin = Math.sin(heading);
	const fullReach = ship.radius + AI_TUNING.lookahead;

	for (let step = 1; step <= 2; step += 1) {
		const reach = fullReach * (step / 2);
		const probe = {
			x: ship.x + cos * reach,
			y: ship.y + sin * reach,
			radius: ship.radius,
		};
		for (const rect of map.colliders) {
			if (circleIntersectsRect(probe, rect)) return false;
		}
	}

	return true;
}

function chooseHeading(
	ship: ShipState,
	desired: number,
	map: ArenaMap,
): number {
	if (isPathClear(ship, desired, map)) return desired;

	const preferredSide = ship.id % 2 === 0 ? 1 : -1;

	for (let index = 1; index <= AI_TUNING.avoidanceSteps; index += 1) {
		const offset = AI_TUNING.avoidanceStep * index;
		const first = normalizeAngle(desired + offset * preferredSide);
		if (isPathClear(ship, first, map)) return first;
		const second = normalizeAngle(desired - offset * preferredSide);
		if (isPathClear(ship, second, map)) return second;
	}

	return desired;
}

function drive(
	ship: ShipState,
	heading: number,
	turnRate: number,
	speed: number,
	thrustLimit: number,
	dt: number,
	map: ArenaMap,
): void {
	const delta = normalizeAngle(heading - ship.rotation);
	const maxStep = turnRate * dt;
	const turnInput = maxStep > 0 ? clamp(delta / maxStep, -1, 1) : 0;
	const thrust =
		Math.abs(delta) > AI_TUNING.sharpTurnAngle
			? Math.min(thrustLimit, AI_TUNING.sharpTurnThrust)
			: thrustLimit;

	steerShip(ship, turnInput, turnRate, speed, thrust, dt, map);
}

function updateChaser(state: GameState, enemy: EnemyState, dt: number): void {
	const spec = state.config.chaser.ship;
	const desired = angleTo(enemy, state.player);
	const heading = chooseHeading(enemy, desired, state.map);

	drive(enemy, heading, spec.turnRate, spec.speed, 1, dt, state.map);
}

function updateShooter(state: GameState, enemy: EnemyState, dt: number): void {
	const spec = state.config.shooter;
	const player = state.player;
	const toPlayer = angleTo(enemy, player);
	const gap = distance(enemy, player);
	const approaching = gap > spec.preferredDistance;
	const heading = approaching
		? chooseHeading(enemy, toPlayer, state.map)
		: toPlayer;
	const thrust = approaching
		? clamp((gap - spec.preferredDistance) / AI_TUNING.shooterBrakeBand, 0, 1)
		: 0;

	drive(
		enemy,
		heading,
		spec.ship.turnRate,
		spec.ship.speed,
		thrust,
		dt,
		state.map,
	);

	if (gap > spec.attackRange) return;
	if (!isCooldownReady(enemy.cooldown)) return;

	const aimError = Math.abs(
		normalizeAngle(angleTo(enemy, player) - enemy.rotation),
	);
	if (aimError > AI_TUNING.shooterAimTolerance) return;

	fireWeapon(state, enemy, "enemy", "enemy", spec.cannon, enemy.rotation);
	enemy.cooldown = spec.cannon.cooldown;
}

function pushApart(a: ShipState, b: ShipState, moveA: boolean): void {
	const minDistance = a.radius + b.radius;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const distSq = dx * dx + dy * dy;
	if (distSq >= minDistance * minDistance) return;

	const dist = Math.sqrt(distSq);
	const nx = dist > 0 ? dx / dist : 1;
	const ny = dist > 0 ? dy / dist : 0;
	const overlap = minDistance - dist;

	if (moveA) {
		a.x -= nx * overlap * 0.5;
		a.y -= ny * overlap * 0.5;
		b.x += nx * overlap * 0.5;
		b.y += ny * overlap * 0.5;
	} else {
		b.x += nx * overlap;
		b.y += ny * overlap;
	}
}

function separateShips(state: GameState): void {
	const { enemies, player } = state;

	for (let i = 0; i < enemies.length; i += 1) {
		const a = enemies[i];
		if (a === undefined || !a.alive) continue;

		for (let j = i + 1; j < enemies.length; j += 1) {
			const b = enemies[j];
			if (b === undefined || !b.alive) continue;
			pushApart(a, b, true);
		}

		if (a.kind === "shooter" && player.alive) {
			pushApart(player, a, false);
		}
	}

	for (const enemy of enemies) {
		if (enemy.alive) resolveShipPlacement(enemy, state.map);
	}
}

export function updateEnemies(state: GameState, dt: number): void {
	for (const enemy of state.enemies) {
		enemy.cooldown = Math.max(0, enemy.cooldown - dt);
	}

	if (!state.player.alive) return;

	for (const enemy of state.enemies) {
		if (!enemy.alive) continue;
		if (enemy.kind === "chaser") {
			updateChaser(state, enemy, dt);
		} else {
			updateShooter(state, enemy, dt);
		}
	}

	separateShips(state);
}
