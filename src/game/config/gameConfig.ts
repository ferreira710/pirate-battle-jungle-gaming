export type DeepReadonly<T> = T extends (infer U)[]
	? ReadonlyArray<DeepReadonly<U>>
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

export type EnemyKind = "chaser" | "shooter";

export interface ProjectileSpec {
	speed: number;
	damage: number;
	range: number;
	radius: number;
}

export interface WeaponSpec {
	cooldown: number;
	projectileCount: number;
	spacing: number;
	muzzleOffset: number;
	projectile: ProjectileSpec;
}

export interface ShipSpec {
	maxHealth: number;
	speed: number;
	turnRate: number;
	radius: number;
}

export interface PlayerSpec {
	ship: ShipSpec;
	frontCannon: WeaponSpec;
	sideCannons: WeaponSpec;
}

export interface ChaserSpec {
	ship: ShipSpec;
	contactDamage: number;
}

export interface ShooterSpec {
	ship: ShipSpec;
	attackRange: number;
	preferredDistance: number;
	cannon: WeaponSpec;
}

export interface SpawnSpec {
	interval: number;
	openingSequence: EnemyKind[];
	weights: Record<EnemyKind, number>;
	maxAlive: number;
	minDistanceFromPlayer: number;
	edgeMargin: number;
	maxAttempts: number;
}

export interface WorldSpec {
	width: number;
	height: number;
	tileSize: number;
}

export interface SimulationSpec {
	fixedStep: number;
	maxFrameDelta: number;
	uiSyncInterval: number;
}

export interface MatchSpec {
	duration: number;
}

export interface GameConfigShape {
	world: WorldSpec;
	simulation: SimulationSpec;
	match: MatchSpec;
	spawn: SpawnSpec;
	player: PlayerSpec;
	chaser: ChaserSpec;
	shooter: ShooterSpec;
}

export type GameConfig = DeepReadonly<GameConfigShape>;

export interface PlayerOptions {
	sessionTime: number;
	spawnInterval: number;
}

export interface NumericLimit {
	min: number;
	max: number;
	step: number;
	defaultValue: number;
}

export const OPTION_LIMITS: Readonly<
	Record<keyof PlayerOptions, Readonly<NumericLimit>>
> = Object.freeze({
	sessionTime: Object.freeze({
		min: 60,
		max: 180,
		step: 10,
		defaultValue: 120,
	}),
	spawnInterval: Object.freeze({ min: 1, max: 10, step: 0.5, defaultValue: 3 }),
});

export const DEFAULT_OPTIONS: Readonly<PlayerOptions> = Object.freeze({
	sessionTime: OPTION_LIMITS.sessionTime.defaultValue,
	spawnInterval: OPTION_LIMITS.spawnInterval.defaultValue,
});

const BASE_CONFIG: GameConfigShape = {
	world: {
		width: 1600,
		height: 900,
		tileSize: 64,
	},
	simulation: {
		fixedStep: 1 / 60,
		maxFrameDelta: 0.25,
		uiSyncInterval: 0.1,
	},
	match: {
		duration: DEFAULT_OPTIONS.sessionTime,
	},
	spawn: {
		interval: DEFAULT_OPTIONS.spawnInterval,
		openingSequence: ["chaser", "shooter"],
		weights: { chaser: 0.55, shooter: 0.45 },
		maxAlive: 12,
		minDistanceFromPlayer: 420,
		edgeMargin: 48,
		maxAttempts: 30,
	},
	player: {
		ship: {
			maxHealth: 100,
			speed: 140,
			turnRate: 2.4,
			radius: 26,
		},
		frontCannon: {
			cooldown: 0.45,
			projectileCount: 1,
			spacing: 0,
			muzzleOffset: 40,
			projectile: { speed: 420, damage: 20, range: 420, radius: 6 },
		},
		sideCannons: {
			cooldown: 1.6,
			projectileCount: 3,
			spacing: 16,
			muzzleOffset: 22,
			projectile: { speed: 360, damage: 15, range: 300, radius: 6 },
		},
	},
	chaser: {
		ship: {
			maxHealth: 40,
			speed: 120,
			turnRate: 2,
			radius: 22,
		},
		contactDamage: 25,
	},
	shooter: {
		ship: {
			maxHealth: 60,
			speed: 90,
			turnRate: 1.8,
			radius: 26,
		},
		attackRange: 320,
		preferredDistance: 240,
		cannon: {
			cooldown: 1.8,
			projectileCount: 1,
			spacing: 0,
			muzzleOffset: 36,
			projectile: { speed: 300, damage: 10, range: 360, radius: 6 },
		},
	},
};

function deepFreeze<T>(value: T): DeepReadonly<T> {
	if (value !== null && typeof value === "object") {
		for (const key of Object.keys(value)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
		Object.freeze(value);
	}
	return value as DeepReadonly<T>;
}

export function createMatchConfig(
	options: PlayerOptions = DEFAULT_OPTIONS,
): GameConfig {
	const snapshot = structuredClone(BASE_CONFIG);
	snapshot.match.duration = options.sessionTime;
	snapshot.spawn.interval = options.spawnInterval;
	return deepFreeze(snapshot);
}
