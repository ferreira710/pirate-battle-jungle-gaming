import type { EnemyKind } from "../game/config/gameConfig";
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
	readonly config: {
		readonly sessionTime: number;
		readonly spawnInterval: number;
		readonly fixedStep: number;
	};
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
	setTimeMode(mode: TimeMode): void;
}

declare global {
	interface Window {
		__PIRATE_BATTLE__?: TestBridge;
	}
}

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

function serialize(session: GameSession): BridgeState {
	const state = session.getState();
	const { player } = state;

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
			sessionTime: state.config.match.duration,
			spawnInterval: state.config.spawn.interval,
			fixedStep: state.config.simulation.fixedStep,
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
