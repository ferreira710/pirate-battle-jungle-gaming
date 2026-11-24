import type { ArenaMap } from "../../config/arenaMap";
import {
	type Circle,
	circleIntersectsRect,
	isOutsideBounds,
} from "../geometry";
import type { GameState } from "../state";

function hitsIsland(circle: Circle, map: ArenaMap): boolean {
	for (const rect of map.colliders) {
		if (circleIntersectsRect(circle, rect)) return true;
	}
	return false;
}

export function updateProjectiles(state: GameState, dt: number): void {
	const { map } = state;

	for (const projectile of state.projectiles) {
		if (!projectile.alive) continue;

		const stepX = projectile.vx * dt;
		const stepY = projectile.vy * dt;
		projectile.x += stepX;
		projectile.y += stepY;
		projectile.remainingRange -= Math.hypot(stepX, stepY);

		if (isOutsideBounds(projectile, map.width, map.height)) {
			projectile.alive = false;
			continue;
		}

		if (hitsIsland(projectile, map)) {
			projectile.alive = false;
			state.events.push({
				type: "projectileBlocked",
				x: projectile.x,
				y: projectile.y,
			});
			continue;
		}

		if (projectile.remainingRange <= 0) {
			projectile.alive = false;
			state.events.push({
				type: "projectileExpired",
				x: projectile.x,
				y: projectile.y,
			});
		}
	}
}
