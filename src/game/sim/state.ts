import type { ArenaMap } from "../config/arenaMap";
import type { EnemyKind, GameConfig } from "../config/gameConfig";
import { createRng, type Rng } from "./rng";

export type Team = "player" | "enemy";
export type MatchPhase = "running" | "paused" | "ended";
export type EndReason = "time" | "death";
export type PlayerWeapon = "front" | "left" | "right";

export interface ShipState {
	id: number;
	x: number;
	y: number;
	rotation: number;
	health: number;
	maxHealth: number;
	radius: number;
	alive: boolean;
}

export interface PlayerState extends ShipState {
	cooldowns: Record<PlayerWeapon, number>;
}

export interface EnemyState extends ShipState {
	kind: EnemyKind;
	cooldown: number;
}

export interface ProjectileState {
	id: number;
	owner: Team;
	x: number;
	y: number;
	vx: number;
	vy: number;
	damage: number;
	radius: number;
	remainingRange: number;
	alive: boolean;
}

export type GameEvent =
	| {
			type: "shot";
			owner: Team;
			weapon: PlayerWeapon | "enemy";
			x: number;
			y: number;
			rotation: number;
	  }
	| { type: "shipHit"; targetId: number; x: number; y: number; damage: number }
	| {
			type: "shipDestroyed";
			targetId: number;
			kind: EnemyKind | "player";
			x: number;
			y: number;
	  }
	| { type: "chaserImpact"; targetId: number; x: number; y: number }
	| { type: "projectileBlocked"; x: number; y: number }
	| { type: "projectileExpired"; x: number; y: number }
	| { type: "enemySpawned"; targetId: number; kind: EnemyKind }
	| { type: "scored"; score: number }
	| { type: "matchEnded"; reason: EndReason };

export interface GameState {
	readonly config: GameConfig;
	readonly map: ArenaMap;
	readonly rng: Rng;
	phase: MatchPhase;
	endReason: EndReason | null;
	elapsed: number;
	remaining: number;
	score: number;
	spawnTimer: number;
	spawnCount: number;
	nextId: number;
	player: PlayerState;
	enemies: EnemyState[];
	projectiles: ProjectileState[];
	events: GameEvent[];
}

export function allocateId(state: GameState): number {
	const id = state.nextId;
	state.nextId += 1;
	return id;
}

export function createInitialState(
	config: GameConfig,
	map: ArenaMap,
	seed: number,
): GameState {
	const ship = config.player.ship;

	return {
		config,
		map,
		rng: createRng(seed),
		phase: "running",
		endReason: null,
		elapsed: 0,
		remaining: config.match.duration,
		score: 0,
		spawnTimer: config.spawn.interval,
		spawnCount: 0,
		nextId: 2,
		player: {
			id: 1,
			x: map.playerSpawn.x,
			y: map.playerSpawn.y,
			rotation: map.playerSpawn.rotation,
			health: ship.maxHealth,
			maxHealth: ship.maxHealth,
			radius: ship.radius,
			alive: true,
			cooldowns: { front: 0, left: 0, right: 0 },
		},
		enemies: [],
		projectiles: [],
		events: [],
	};
}
