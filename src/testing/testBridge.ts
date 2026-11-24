import type {
	DeepReadonly,
	EnemyKind,
	WeaponSpec,
} from "../game/config/gameConfig";
import type {
	GameSession,
	MatchSnapshot,
	TimeMode,
} from "../game/session/gameSession";
import type { Rect } from "../game/sim/geometry";
import type {
	EndReason,
	MatchPhase,
	PlayerWeapon,
	Team,
} from "../game/sim/state";

export interface BridgeShip {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly rotation: number;
	readonly health: number;
	readonly maxHealth: number;
	readonly radius: number;
}

export interface BridgeWeapon {
	readonly cooldown: number;
	readonly count: number;
	readonly spacing: number;
	readonly damage: number;
	readonly speed: number;
	readonly range: number;
}

export interface BridgeConfig {
	readonly sessionTime: number;
	readonly spawnInterval: number;
	readonly fixedStep: number;
	readonly minSpawnDistance: number;
	readonly openingSequence: readonly EnemyKind[];
	readonly front: BridgeWeapon;
	readonly side: BridgeWeapon;
	readonly chaser: {
		readonly contactDamage: number;
		readonly maxHealth: number;
	};
	readonly shooter: {
		readonly attackRange: number;
		readonly preferredDistance: number;
		readonly maxHealth: number;
		readonly cannon: BridgeWeapon;
	};
}

export interface BridgeState {
	readonly phase: MatchPhase;
	readonly endReason: EndReason | null;
	readonly elapsed: number;
	readonly remaining: number;
	readonly score: number;
	readonly spawnCount: number;
	readonly seed: number;
	readonly world: { readonly width: number; readonly height: number };
	readonly colliders: readonly Rect[];
	readonly config: BridgeConfig;
	readonly player: BridgeShip & {
		readonly cooldowns: Readonly<Record<PlayerWeapon, number>>;
	};
	readonly enemies: readonly (BridgeShip & {
		readonly kind: EnemyKind;
		readonly cooldown: number;
	})[];
	readonly projectiles: readonly {
		readonly id: number;
		readonly owner: Team;
		readonly x: number;
		readonly y: number;
		readonly vx: number;
		readonly vy: number;
	}[];
}

export interface TestBridge {
	isReady(): boolean;
	state(): BridgeState | null;
	snapshot(): MatchSnapshot | null;
	advance(seconds: number): number;
	step(seconds: number): BridgeState | null;
	run(seconds: number, chunk: number): BridgeState[];
	setTimeMode(mode: TimeMode): void;
}

declare global {
	interface Window {
		__PIRATE_BATTLE__?: TestBridge;
	}
}

const CHUNK_EPSILON = 1e-9;

function params(): URLSearchParams {
	return new URLSearchParams(window.location.search);
}

export function isTestMode(): boolean {
	return params().has("e2e");
}

export function readSeedParam(): number | null {
	const raw = params().get("seed");
	if (raw === null) return null;
	const value = Number(raw);
	return Number.isInteger(value) && value >= 0 ? value >>> 0 : null;
}

export function readClockParam(): TimeMode {
	return params().get("clock") === "manual" ? "manual" : "realtime";
}

function weapon(spec: DeepReadonly<WeaponSpec>): BridgeWeapon {
	return {
		cooldown: spec.cooldown,
		count: spec.projectileCount,
		spacing: spec.spacing,
		damage: spec.projectile.damage,
		speed: spec.projectile.speed,
		range: spec.projectile.range,
	};
}

function serialize(session: GameSession): BridgeState {
	const state = session.getState();
	const { player, config } = state;

	return {
		phase: state.phase,
		endReason: state.endReason,
		elapsed: state.elapsed,
		remaining: state.remaining,
		score: state.score,
		spawnCount: state.spawnCount,
		seed: state.rng.seed,
		world: { width: state.map.width, height: state.map.height },
		colliders: state.map.colliders.map((rect) => ({ ...rect })),
		config: {
			sessionTime: config.match.duration,
			spawnInterval: config.spawn.interval,
			fixedStep: config.simulation.fixedStep,
			minSpawnDistance: config.spawn.minDistanceFromPlayer,
			openingSequence: [...config.spawn.openingSequence],
			front: weapon(config.player.frontCannon),
			side: weapon(config.player.sideCannons),
			chaser: {
				contactDamage: config.chaser.contactDamage,
				maxHealth: config.chaser.ship.maxHealth,
			},
			shooter: {
				attackRange: config.shooter.attackRange,
				preferredDistance: config.shooter.preferredDistance,
				maxHealth: config.shooter.ship.maxHealth,
				cannon: weapon(config.shooter.cannon),
			},
		},
		player: {
			id: player.id,
			x: player.x,
			y: player.y,
			rotation: player.rotation,
			health: player.health,
			maxHealth: player.maxHealth,
			radius: player.radius,
			cooldowns: { ...player.cooldowns },
		},
		enemies: state.enemies
			.filter((enemy) => enemy.alive)
			.map((enemy) => ({
				id: enemy.id,
				kind: enemy.kind,
				x: enemy.x,
				y: enemy.y,
				rotation: enemy.rotation,
				health: enemy.health,
				maxHealth: enemy.maxHealth,
				radius: enemy.radius,
				cooldown: enemy.cooldown,
			})),
		projectiles: state.projectiles
			.filter((projectile) => projectile.alive)
			.map((projectile) => ({
				id: projectile.id,
				owner: projectile.owner,
				x: projectile.x,
				y: projectile.y,
				vx: projectile.vx,
				vy: projectile.vy,
			})),
	};
}

let current: GameSession | null = null;

function createBridge(): TestBridge {
	return {
		isReady: () => current !== null,
		state: () => (current ? serialize(current) : null),
		snapshot: () => (current ? current.getSnapshot() : null),
		advance: (seconds) => (current ? current.advance(seconds) : 0),
		step: (seconds) => {
			if (!current) return null;
			current.advance(seconds);
			return serialize(current);
		},
		run: (seconds, chunk) => {
			const samples: BridgeState[] = [];
			if (!current || chunk <= 0) return samples;
			const chunks = Math.ceil(seconds / chunk - CHUNK_EPSILON);
			for (let index = 0; index < chunks; index += 1) {
				current.advance(chunk);
				samples.push(serialize(current));
				if (current.getState().phase !== "running") break;
			}
			return samples;
		},
		setTimeMode: (mode) => current?.setTimeMode(mode),
	};
}

export function exposeSession(session: GameSession | null): void {
	if (!isTestMode()) return;
	current = session;
}

if (isTestMode()) {
	window.__PIRATE_BATTLE__ = createBridge();
}
