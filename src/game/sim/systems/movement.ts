import type { ArenaMap } from "../../config/arenaMap";
import type { PlayerCommands } from "../commands";
import {
	circleRectPenetration,
	clampCircleToBounds,
	normalizeAngle,
} from "../geometry";
import type { GameState, ShipState } from "../state";

const COLLISION_PASSES = 3;

export function resolveShipPlacement(ship: ShipState, map: ArenaMap): boolean {
	let collided = false;

	for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
		let pushed = false;

		for (const rect of map.colliders) {
			const push = circleRectPenetration(ship, rect);
			if (!push) continue;
			ship.x += push.x;
			ship.y += push.y;
			pushed = true;
		}

		const clamped = clampCircleToBounds(ship, map.width, map.height);
		if (clamped.x !== ship.x || clamped.y !== ship.y) {
			ship.x = clamped.x;
			ship.y = clamped.y;
			pushed = true;
		}

		if (!pushed) break;
		collided = true;
	}

	return collided;
}

export function steerShip(
	ship: ShipState,
	turnInput: number,
	turnRate: number,
	speed: number,
	thrust: number,
	dt: number,
	map: ArenaMap,
): boolean {
	ship.rotation = normalizeAngle(ship.rotation + turnInput * turnRate * dt);

	if (thrust > 0) {
		const distance = speed * thrust * dt;
		ship.x += Math.cos(ship.rotation) * distance;
		ship.y += Math.sin(ship.rotation) * distance;
	}

	return resolveShipPlacement(ship, map);
}

export function updatePlayerMovement(
	state: GameState,
	commands: PlayerCommands,
	dt: number,
): void {
	const player = state.player;
	if (!player.alive) return;

	const spec = state.config.player.ship;
	const turnInput = (commands.turnRight ? 1 : 0) - (commands.turnLeft ? 1 : 0);
	const thrust = commands.forward ? 1 : 0;

	steerShip(
		player,
		turnInput,
		spec.turnRate,
		spec.speed,
		thrust,
		dt,
		state.map,
	);
}
