import type { DeepReadonly, WeaponSpec } from "../../config/gameConfig";
import type { PlayerAction, PlayerCommands } from "../commands";
import {
	allocateId,
	type GameState,
	type PlayerWeapon,
	type ShipState,
	type Team,
} from "../state";

const COOLDOWN_EPSILON = 1e-9;

const WEAPON_ANGLE_OFFSET: Record<PlayerWeapon, number> = {
	front: 0,
	left: -Math.PI / 2,
	right: Math.PI / 2,
};

const PLAYER_WEAPONS: readonly {
	weapon: PlayerWeapon;
	action: PlayerAction;
}[] = [
	{ weapon: "front", action: "fireFront" },
	{ weapon: "left", action: "fireLeft" },
	{ weapon: "right", action: "fireRight" },
];

export function fireWeapon(
	state: GameState,
	ship: ShipState,
	owner: Team,
	weapon: PlayerWeapon | "enemy",
	spec: DeepReadonly<WeaponSpec>,
	direction: number,
): void {
	const dirX = Math.cos(direction);
	const dirY = Math.sin(direction);
	const perpX = -dirY;
	const perpY = dirX;
	const muzzleX = ship.x + dirX * spec.muzzleOffset;
	const muzzleY = ship.y + dirY * spec.muzzleOffset;
	const centerIndex = (spec.projectileCount - 1) / 2;

	for (let index = 0; index < spec.projectileCount; index += 1) {
		const lateral = (index - centerIndex) * spec.spacing;
		state.projectiles.push({
			id: allocateId(state),
			owner,
			x: muzzleX + perpX * lateral,
			y: muzzleY + perpY * lateral,
			vx: dirX * spec.projectile.speed,
			vy: dirY * spec.projectile.speed,
			damage: spec.projectile.damage,
			radius: spec.projectile.radius,
			remainingRange: spec.projectile.range,
			alive: true,
		});
	}

	state.events.push({
		type: "shot",
		owner,
		weapon,
		x: muzzleX,
		y: muzzleY,
		rotation: direction,
	});
}

export function isCooldownReady(cooldown: number): boolean {
	return cooldown <= COOLDOWN_EPSILON;
}

export function updatePlayerWeapons(
	state: GameState,
	commands: PlayerCommands,
	dt: number,
): void {
	const player = state.player;

	for (const entry of PLAYER_WEAPONS) {
		player.cooldowns[entry.weapon] = Math.max(
			0,
			player.cooldowns[entry.weapon] - dt,
		);
	}

	if (!player.alive) return;

	for (const entry of PLAYER_WEAPONS) {
		if (!commands[entry.action]) continue;
		if (!isCooldownReady(player.cooldowns[entry.weapon])) continue;

		const spec =
			entry.weapon === "front"
				? state.config.player.frontCannon
				: state.config.player.sideCannons;
		fireWeapon(
			state,
			player,
			"player",
			entry.weapon,
			spec,
			player.rotation + WEAPON_ANGLE_OFFSET[entry.weapon],
		);
		player.cooldowns[entry.weapon] = spec.cooldown;
	}
}
