import { Container, Sprite } from "pixi.js";
import type { GameState } from "../../sim/state";
import type { LayerContext, SceneLayer } from "../gameRenderer";

const BALL_SIZE_RATIO = 2.4;
const ENEMY_TINT = 0xffc9b8;
const PLAYER_TINT = 0xffffff;

export function createProjectileLayer({ textures }: LayerContext): SceneLayer {
	const container = new Container();
	const sprites: Sprite[] = [];

	return {
		container,
		update(state: Readonly<GameState>) {
			let index = 0;

			for (const projectile of state.projectiles) {
				if (!projectile.alive) continue;

				let sprite = sprites[index];
				if (!sprite) {
					sprite = new Sprite(textures.cannonBall);
					sprite.anchor.set(0.5);
					container.addChild(sprite);
					sprites.push(sprite);
				}

				const size = projectile.radius * BALL_SIZE_RATIO;
				sprite.visible = true;
				sprite.position.set(projectile.x, projectile.y);
				sprite.width = size;
				sprite.height = size;
				sprite.tint = projectile.owner === "enemy" ? ENEMY_TINT : PLAYER_TINT;
				index += 1;
			}

			for (; index < sprites.length; index += 1) {
				const sprite = sprites[index];
				if (sprite) sprite.visible = false;
			}
		},
		destroy() {
			sprites.length = 0;
			container.destroy({ children: true });
		},
	};
}
