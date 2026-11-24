import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { EnemyKind } from "../../config/gameConfig";
import type { GameEvent, GameState } from "../../sim/state";
import type { ShipSkin } from "../assets";
import type { LayerContext, SceneLayer } from "../gameRenderer";

type SpriteEffectKind = "flash" | "burst" | "explosion" | "wreck";

interface SpriteEffect {
	kind: SpriteEffectKind;
	sprite: Sprite;
	age: number;
	duration: number;
	baseScale: number;
}

interface RingEffect {
	graphics: Graphics;
	x: number;
	y: number;
	age: number;
	duration: number;
}

const MAX_EFFECTS = 200;
const SHIP_BEAM_RATIO = 2.1;

const FLASH = { scale: 0.35, duration: 0.12, growth: 0.6 };
const HIT_BURST = { scale: 0.45, duration: 0.2, growth: 0.4 };
const BLOCKED_BURST = {
	scale: 0.3,
	duration: 0.18,
	growth: 0.5,
	tint: 0xdcc8a0,
};
const EXPLOSION = { scale: 1, duration: 0.45, growth: 0.3, fadeStart: 0.7 };
const WRECK = { duration: 1.6, shrink: 0.15 };
const SPLASH = {
	duration: 0.4,
	startRadius: 4,
	growth: 12,
	width: 2,
	color: 0xffffff,
	alpha: 0.8,
};

function skinFor(kind: EnemyKind | "player"): ShipSkin {
	return kind;
}

export function createEffectsLayer({
	textures,
	state,
}: LayerContext): SceneLayer {
	const container = new Container();
	const wreckLayer = new Container();
	const fxLayer = new Container();
	container.addChild(wreckLayer, fxLayer);

	const sprites: SpriteEffect[] = [];
	const rings: RingEffect[] = [];
	const spritePool: Sprite[] = [];
	const ringPool: Graphics[] = [];
	const lastRotation = new Map<number, number>();
	const explosionFrames = textures.explosion;
	const firstExplosion = explosionFrames[0];
	let lastElapsed = state.elapsed;

	const radiusFor: Record<ShipSkin, number> = {
		player: state.config.player.ship.radius,
		chaser: state.config.chaser.ship.radius,
		shooter: state.config.shooter.ship.radius,
	};

	function activeCount(): number {
		return sprites.length + rings.length;
	}

	function spawnSprite(
		parent: Container,
		kind: SpriteEffectKind,
		texture: Texture,
		x: number,
		y: number,
		rotation: number,
		baseScale: number,
		duration: number,
		tint = 0xffffff,
	): void {
		if (activeCount() >= MAX_EFFECTS) return;
		const sprite = spritePool.pop() ?? new Sprite();
		sprite.texture = texture;
		sprite.anchor.set(0.5);
		sprite.position.set(x, y);
		sprite.rotation = rotation;
		sprite.scale.set(baseScale);
		sprite.alpha = 1;
		sprite.tint = tint;
		sprite.visible = true;
		parent.addChild(sprite);
		sprites.push({ kind, sprite, age: 0, duration, baseScale });
	}

	function spawnSplash(x: number, y: number): void {
		if (activeCount() >= MAX_EFFECTS) return;
		const graphics = ringPool.pop() ?? new Graphics();
		graphics.clear();
		graphics.visible = true;
		fxLayer.addChild(graphics);
		rings.push({ graphics, x, y, age: 0, duration: SPLASH.duration });
	}

	function spawnDestruction(
		id: number,
		kind: EnemyKind | "player",
		x: number,
		y: number,
	): void {
		const skin = skinFor(kind);
		const wreckTexture = textures.ships[skin][3];
		const rotation = (lastRotation.get(id) ?? 0) - Math.PI / 2;
		const wreckScale = (radiusFor[skin] * SHIP_BEAM_RATIO) / wreckTexture.width;
		spawnSprite(
			wreckLayer,
			"wreck",
			wreckTexture,
			x,
			y,
			rotation,
			wreckScale,
			WRECK.duration,
		);
		if (firstExplosion) {
			spawnSprite(
				fxLayer,
				"explosion",
				firstExplosion,
				x,
				y,
				0,
				EXPLOSION.scale,
				EXPLOSION.duration,
			);
		}
	}

	function handleEvent(event: GameEvent): void {
		if (!firstExplosion) return;

		switch (event.type) {
			case "shot":
				spawnSprite(
					fxLayer,
					"flash",
					firstExplosion,
					event.x,
					event.y,
					event.rotation,
					FLASH.scale,
					FLASH.duration,
				);
				break;
			case "shipHit":
				spawnSprite(
					fxLayer,
					"burst",
					firstExplosion,
					event.x,
					event.y,
					0,
					HIT_BURST.scale,
					HIT_BURST.duration,
				);
				break;
			case "shipDestroyed":
				spawnDestruction(event.targetId, event.kind, event.x, event.y);
				break;
			case "projectileBlocked":
				spawnSprite(
					fxLayer,
					"burst",
					firstExplosion,
					event.x,
					event.y,
					0,
					BLOCKED_BURST.scale,
					BLOCKED_BURST.duration,
					BLOCKED_BURST.tint,
				);
				break;
			case "projectileExpired":
				spawnSplash(event.x, event.y);
				break;
			default:
				break;
		}
	}

	function growthFor(kind: SpriteEffectKind): number {
		if (kind === "flash") return FLASH.growth;
		if (kind === "explosion") return EXPLOSION.growth;
		return HIT_BURST.growth;
	}

	function animateSprite(effect: SpriteEffect, t: number): void {
		const { sprite, kind, baseScale } = effect;

		if (kind === "wreck") {
			sprite.alpha = 1 - t;
			sprite.scale.set(baseScale * (1 - WRECK.shrink * t));
			return;
		}

		if (kind === "explosion") {
			const frame =
				explosionFrames[
					Math.min(
						explosionFrames.length - 1,
						Math.floor(t * explosionFrames.length),
					)
				];
			if (frame) sprite.texture = frame;
			sprite.alpha =
				t < EXPLOSION.fadeStart ? 1 : (1 - t) / (1 - EXPLOSION.fadeStart);
		} else {
			sprite.alpha = 1 - t;
		}

		sprite.scale.set(baseScale * (1 + growthFor(kind) * t));
	}

	function advance(dt: number): void {
		for (let index = sprites.length - 1; index >= 0; index -= 1) {
			const effect = sprites[index];
			if (!effect) continue;
			effect.age += dt;
			const t = effect.age / effect.duration;
			if (t >= 1) {
				effect.sprite.removeFromParent();
				effect.sprite.visible = false;
				spritePool.push(effect.sprite);
				sprites[index] = sprites[sprites.length - 1] as SpriteEffect;
				sprites.pop();
				continue;
			}
			animateSprite(effect, t);
		}

		for (let index = rings.length - 1; index >= 0; index -= 1) {
			const ring = rings[index];
			if (!ring) continue;
			ring.age += dt;
			const t = ring.age / ring.duration;
			if (t >= 1) {
				ring.graphics.removeFromParent();
				ring.graphics.clear();
				ringPool.push(ring.graphics);
				rings[index] = rings[rings.length - 1] as RingEffect;
				rings.pop();
				continue;
			}
			ring.graphics
				.clear()
				.circle(ring.x, ring.y, SPLASH.startRadius + SPLASH.growth * t)
				.stroke({
					width: SPLASH.width,
					color: SPLASH.color,
					alpha: SPLASH.alpha * (1 - t),
				});
		}
	}

	function recordRotations(current: Readonly<GameState>): void {
		lastRotation.clear();
		lastRotation.set(current.player.id, current.player.rotation);
		for (const enemy of current.enemies) {
			lastRotation.set(enemy.id, enemy.rotation);
		}
	}

	return {
		container,
		update(current: Readonly<GameState>, _alpha: number, frameDelta: number) {
			const simDelta = Math.max(0, current.elapsed - lastElapsed);
			lastElapsed = current.elapsed;
			const dt = current.phase === "ended" ? frameDelta : simDelta;

			advance(dt);
			recordRotations(current);
		},
		handleEvents(events: readonly GameEvent[]) {
			for (const event of events) {
				handleEvent(event);
			}
		},
		destroy() {
			for (const sprite of spritePool) sprite.destroy();
			for (const graphics of ringPool) graphics.destroy();
			spritePool.length = 0;
			ringPool.length = 0;
			sprites.length = 0;
			rings.length = 0;
			lastRotation.clear();
			container.destroy({ children: true });
		},
	};
}
