import { Container, Graphics, Sprite } from "pixi.js";
import type { GameEvent, GameState, ShipState } from "../../sim/state";
import type { HealthBarTextures, ShipSkin, ShipStages } from "../assets";
import type { LayerContext, SceneLayer } from "../gameRenderer";

interface BarLayout {
	readonly fillX: number;
	readonly fillY: number;
	readonly fillWidth: number;
	readonly fillHeight: number;
	readonly displayWidth: number;
}

const PLAYER_BAR: BarLayout = {
	fillX: 30,
	fillY: 15,
	fillWidth: 196,
	fillHeight: 20,
	displayWidth: 84,
};
const ENEMY_BAR: BarLayout = {
	fillX: 24,
	fillY: 12,
	fillWidth: 112,
	fillHeight: 15,
	displayWidth: 60,
};

const SHIP_BEAM_RATIO = 2.1;
const BAR_OFFSET_RATIO = 2.3;
const HIT_FLASH_DURATION = 0.12;
const HIT_TINT = 0xff7a7a;
const FIRE_FRAME_TIME = 0.15;
const FIRE_SCALE = 0.55;
const FIRE_SPOTS: readonly { x: number; y: number }[] = [
	{ x: -6, y: -10 },
	{ x: 8, y: 14 },
];

function stageFor(ratio: number): number {
	if (ratio > 2 / 3) return 0;
	if (ratio > 1 / 3) return 1;
	return 2;
}

class HealthBar {
	readonly container = new Container();
	private readonly fill: Sprite;
	private readonly mask = new Graphics();
	private readonly textures: HealthBarTextures;
	private readonly layout: BarLayout;
	private ratio = -1;

	constructor(textures: HealthBarTextures, layout: BarLayout) {
		this.textures = textures;
		this.layout = layout;

		const frame = new Sprite(textures.frame);
		this.fill = new Sprite(textures.high);
		this.fill.mask = this.mask;
		this.container.addChild(frame, this.fill, this.mask);

		const scale = layout.displayWidth / textures.frame.width;
		this.container.scale.set(scale);
		this.container.pivot.set(textures.frame.width / 2, textures.frame.height);
	}

	set(ratio: number): void {
		const clamped = Math.min(1, Math.max(0, ratio));
		if (clamped === this.ratio) return;
		this.ratio = clamped;

		if (clamped > 0.6) this.fill.texture = this.textures.high;
		else if (clamped > 0.3) this.fill.texture = this.textures.medium;
		else this.fill.texture = this.textures.low;

		const { fillX, fillY, fillWidth, fillHeight } = this.layout;
		this.mask
			.clear()
			.rect(fillX, fillY, fillWidth * clamped, fillHeight)
			.fill(0xffffff);
	}

	reset(): void {
		this.ratio = -1;
	}
}

class ShipView {
	readonly container = new Container();
	readonly skin: ShipSkin;
	private readonly body = new Container();
	private readonly hull: Sprite;
	private readonly fires: Sprite[];
	private readonly bar: HealthBar;
	private readonly stages: ShipStages;
	private readonly fireFrames: readonly Sprite["texture"][];
	private stage = -1;
	private flash = 0;
	private fireClock = 0;

	constructor(
		skin: ShipSkin,
		stages: ShipStages,
		fireFrames: readonly Sprite["texture"][],
		barTextures: HealthBarTextures,
		layout: BarLayout,
		radius: number,
	) {
		this.skin = skin;
		this.stages = stages;
		this.fireFrames = fireFrames;

		this.hull = new Sprite(stages[0]);
		this.hull.anchor.set(0.5);
		this.hull.scale.set((radius * SHIP_BEAM_RATIO) / stages[0].width);

		this.fires = FIRE_SPOTS.map((spot) => {
			const fire = new Sprite(fireFrames[0]);
			fire.anchor.set(0.5, 0.8);
			fire.scale.set(FIRE_SCALE);
			fire.position.set(spot.x, spot.y);
			fire.visible = false;
			return fire;
		});

		this.body.addChild(this.hull, ...this.fires);

		this.bar = new HealthBar(barTextures, layout);
		this.bar.container.position.set(0, -radius * BAR_OFFSET_RATIO);

		this.container.addChild(this.body, this.bar.container);
	}

	reset(): void {
		this.stage = -1;
		this.flash = 0;
		this.fireClock = 0;
		this.hull.tint = 0xffffff;
		this.bar.reset();
	}

	hit(): void {
		this.flash = HIT_FLASH_DURATION;
	}

	sync(ship: ShipState, frameDelta: number): void {
		this.container.position.set(ship.x, ship.y);
		this.body.rotation = ship.rotation - Math.PI / 2;

		const ratio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 0;
		const stage = stageFor(ratio);
		if (stage !== this.stage) {
			this.stage = stage;
			this.hull.texture = this.stages[stage] ?? this.stages[0];
			this.fires.forEach((fire, index) => {
				fire.visible = index < stage;
			});
		}
		this.bar.set(ratio);

		if (this.flash > 0) {
			this.flash = Math.max(0, this.flash - frameDelta);
			this.hull.tint = this.flash > 0 ? HIT_TINT : 0xffffff;
		}

		if (stage > 0) {
			this.fireClock += frameDelta;
			const frameIndex =
				Math.floor(this.fireClock / FIRE_FRAME_TIME) % this.fireFrames.length;
			const texture = this.fireFrames[frameIndex];
			if (texture) {
				for (const fire of this.fires) fire.texture = texture;
			}
		}
	}
}

export function createShipLayer({ textures, state }: LayerContext): SceneLayer {
	const container = new Container();
	const views = new Map<number, ShipView>();
	const pool = new Map<ShipSkin, ShipView[]>();
	const seen = new Set<number>();

	const radiusFor: Record<ShipSkin, number> = {
		player: state.config.player.ship.radius,
		chaser: state.config.chaser.ship.radius,
		shooter: state.config.shooter.ship.radius,
	};

	function acquire(skin: ShipSkin): ShipView {
		const reused = pool.get(skin)?.pop();
		if (reused) {
			reused.reset();
			return reused;
		}
		const isPlayer = skin === "player";
		return new ShipView(
			skin,
			textures.ships[skin],
			textures.fire,
			isPlayer ? textures.playerHealth : textures.enemyHealth,
			isPlayer ? PLAYER_BAR : ENEMY_BAR,
			radiusFor[skin],
		);
	}

	function release(id: number, view: ShipView): void {
		container.removeChild(view.container);
		views.delete(id);
		const list = pool.get(view.skin) ?? [];
		list.push(view);
		pool.set(view.skin, list);
	}

	function syncShip(ship: ShipState, skin: ShipSkin, frameDelta: number): void {
		let view = views.get(ship.id);
		if (!view) {
			view = acquire(skin);
			views.set(ship.id, view);
			container.addChild(view.container);
		}
		view.sync(ship, frameDelta);
		seen.add(ship.id);
	}

	return {
		container,
		update(current: Readonly<GameState>, _alpha: number, frameDelta: number) {
			seen.clear();
			for (const enemy of current.enemies) {
				if (enemy.alive) syncShip(enemy, enemy.kind, frameDelta);
			}
			if (current.player.alive) syncShip(current.player, "player", frameDelta);

			for (const [id, view] of views) {
				if (!seen.has(id)) release(id, view);
			}
		},
		handleEvents(events: readonly GameEvent[]) {
			for (const event of events) {
				if (event.type === "shipHit") views.get(event.targetId)?.hit();
			}
		},
		destroy() {
			for (const list of pool.values()) {
				for (const view of list) view.container.destroy({ children: true });
			}
			pool.clear();
			views.clear();
			container.destroy({ children: true });
		},
	};
}
