import type { EnemyKind } from "../../config/gameConfig";
import { circlesIntersect } from "../geometry";
import type { GameState, ProjectileState, ShipState } from "../state";

function damageShip(
	state: GameState,
	ship: ShipState,
	amount: number,
	kind: EnemyKind | "player",
): boolean {
	if (!ship.alive || amount <= 0) return false;

	ship.health = Math.max(0, ship.health - amount);
	state.events.push({
		type: "shipHit",
		targetId: ship.id,
		x: ship.x,
		y: ship.y,
		damage: amount,
	});

	if (ship.health > 0) return false;

	ship.alive = false;
	state.events.push({
		type: "shipDestroyed",
		targetId: ship.id,
		kind,
		x: ship.x,
		y: ship.y,
	});
	return true;
}

function hitEnemies(state: GameState, projectile: ProjectileState): void {
	for (const enemy of state.enemies) {
		if (!enemy.alive || !circlesIntersect(projectile, enemy)) continue;

		projectile.alive = false;

		if (damageShip(state, enemy, projectile.damage, enemy.kind)) {
			state.score += 1;
			state.events.push({ type: "scored", score: state.score });
		}
		return;
	}
}

function hitPlayer(state: GameState, projectile: ProjectileState): void {
	const player = state.player;
	if (!player.alive || !circlesIntersect(projectile, player)) return;

	projectile.alive = false;
	damageShip(state, player, projectile.damage, "player");
}

export function resolveProjectileHits(state: GameState): void {
	for (const projectile of state.projectiles) {
		if (!state.player.alive) return;
		if (!projectile.alive) continue;

		if (projectile.owner === "player") {
			hitEnemies(state, projectile);
		} else {
			hitPlayer(state, projectile);
		}
	}
}

export function resolveChaserImpacts(state: GameState): void {
	const player = state.player;

	for (const enemy of state.enemies) {
		if (!player.alive) return;
		if (!enemy.alive || enemy.kind !== "chaser") continue;
		if (!circlesIntersect(enemy, player)) continue;

		enemy.alive = false;
		state.events.push({
			type: "chaserImpact",
			targetId: enemy.id,
			x: enemy.x,
			y: enemy.y,
		});
		state.events.push({
			type: "shipDestroyed",
			targetId: enemy.id,
			kind: "chaser",
			x: enemy.x,
			y: enemy.y,
		});
		damageShip(state, player, state.config.chaser.contactDamage, "player");
	}
}
