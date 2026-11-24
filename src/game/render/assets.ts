import { Assets, Texture } from "pixi.js";

export type ShipSkin = "player" | "chaser" | "shooter";
export type Density = "default" | "retina";
export type ShipStages = readonly [Texture, Texture, Texture, Texture];

export interface HealthBarTextures {
	readonly frame: Texture;
	readonly high: Texture;
	readonly medium: Texture;
	readonly low: Texture;
}

export interface GameTextures {
	readonly density: Density;
	readonly ships: Readonly<Record<ShipSkin, ShipStages>>;
	readonly cannonBall: Texture;
	readonly explosion: readonly Texture[];
	readonly fire: readonly Texture[];
	readonly tiles: ReadonlyMap<number, Texture>;
	readonly playerHealth: HealthBarTextures;
	readonly enemyHealth: HealthBarTextures;
}

interface AssetEntry {
	key: string;
	path: string;
}

export class AssetLoadError extends Error {
	readonly failed: readonly string[];

	constructor(failed: readonly string[]) {
		super(`Failed to load ${failed.length} asset(s)`);
		this.name = "AssetLoadError";
		this.failed = failed;
	}
}

const SHIP_COLOR_INDEX: Record<ShipSkin, number> = {
	player: 5,
	chaser: 2,
	shooter: 3,
};
const SHIP_SKINS: readonly ShipSkin[] = ["player", "chaser", "shooter"];
const SHIP_COLORS = 6;
const SHIP_STAGES = 4;
const TILE_COUNT = 96;

const resolved = new Map<string, Texture>();
const progressListeners = new Set<(progress: number) => void>();
let cached: GameTextures | null = null;
let pending: Promise<GameTextures> | null = null;
let attempt = 0;
let density: Density | null = null;

function shipKey(skin: ShipSkin, stage: number): string {
	return `ship:${skin}:${stage}`;
}

function buildManifest(): AssetEntry[] {
	const entries: AssetEntry[] = [];

	for (const skin of SHIP_SKINS) {
		for (let stage = 0; stage < SHIP_STAGES; stage += 1) {
			const number = SHIP_COLOR_INDEX[skin] + stage * SHIP_COLORS;
			entries.push({
				key: shipKey(skin, stage),
				path: `ships/ship_${number}.png`,
			});
		}
	}

	entries.push({ key: "cannonBall", path: "ship_parts/cannon_ball.png" });

	for (let index = 1; index <= 3; index += 1) {
		entries.push({
			key: `explosion:${index}`,
			path: `effects/explosion_${index}.png`,
		});
	}

	for (let index = 1; index <= 2; index += 1) {
		entries.push({ key: `fire:${index}`, path: `effects/fire_${index}.png` });
	}

	for (let index = 1; index <= TILE_COUNT; index += 1) {
		entries.push({ key: `tile:${index}`, path: `tiles/tile_${index}.png` });
	}

	const hud: readonly [string, string][] = [
		["playerHealth:frame", "health_frame"],
		["playerHealth:high", "health_fill_green"],
		["playerHealth:medium", "health_fill_amber"],
		["playerHealth:low", "health_fill_red"],
		["enemyHealth:frame", "enemy_health_frame"],
		["enemyHealth:high", "enemy_health_fill_green"],
		["enemyHealth:medium", "enemy_health_fill_red"],
		["enemyHealth:low", "enemy_health_fill_red"],
	];

	for (const [key, file] of hud) {
		entries.push({ key, path: `ui/hud/${file}.png` });
	}

	return entries;
}

export function pickDensity(): Density {
	if (density) return density;
	density = window.devicePixelRatio >= 1.5 ? "retina" : "default";
	return density;
}

function assetUrl(
	target: Density,
	path: string,
	currentAttempt: number,
): string {
	const url = `${import.meta.env.BASE_URL}assets/png/${target}/${path}`;
	return currentAttempt > 0 ? `${url}?retry=${currentAttempt}` : url;
}

function emitProgress(progress: number): void {
	for (const listener of progressListeners) {
		listener(progress);
	}
}

function take(key: string): Texture {
	const texture = resolved.get(key);
	if (!texture) throw new AssetLoadError([key]);
	return texture;
}

function shipStages(skin: ShipSkin): ShipStages {
	return [
		take(shipKey(skin, 0)),
		take(shipKey(skin, 1)),
		take(shipKey(skin, 2)),
		take(shipKey(skin, 3)),
	];
}

function healthBar(prefix: string): HealthBarTextures {
	return {
		frame: take(`${prefix}:frame`),
		high: take(`${prefix}:high`),
		medium: take(`${prefix}:medium`),
		low: take(`${prefix}:low`),
	};
}

function assemble(target: Density): GameTextures {
	const tiles = new Map<number, Texture>();
	for (let index = 1; index <= TILE_COUNT; index += 1) {
		tiles.set(index, take(`tile:${index}`));
	}

	return Object.freeze({
		density: target,
		ships: Object.freeze({
			player: shipStages("player"),
			chaser: shipStages("chaser"),
			shooter: shipStages("shooter"),
		}),
		cannonBall: take("cannonBall"),
		explosion: Object.freeze([
			take("explosion:1"),
			take("explosion:2"),
			take("explosion:3"),
		]),
		fire: Object.freeze([take("fire:1"), take("fire:2")]),
		tiles,
		playerHealth: Object.freeze(healthBar("playerHealth")),
		enemyHealth: Object.freeze(healthBar("enemyHealth")),
	});
}

async function loadAll(): Promise<GameTextures> {
	const target = pickDensity();
	const resolution = target === "retina" ? 2 : 1;
	const manifest = buildManifest();
	const missing = manifest.filter((entry) => !resolved.has(entry.key));
	const currentAttempt = attempt;
	const failed: string[] = [];
	let done = manifest.length - missing.length;

	emitProgress(done / manifest.length);

	await Promise.all(
		missing.map(async (entry) => {
			try {
				const texture: unknown = await Assets.load({
					src: assetUrl(target, entry.path, currentAttempt),
					data: { resolution },
				});
				if (texture instanceof Texture) {
					resolved.set(entry.key, texture);
				} else {
					failed.push(entry.path);
				}
			} catch {
				failed.push(entry.path);
			} finally {
				done += 1;
				emitProgress(done / manifest.length);
			}
		}),
	);

	if (failed.length > 0) throw new AssetLoadError(failed);
	return assemble(target);
}

export function getLoadedTextures(): GameTextures | null {
	return cached;
}

export function loadGameTextures(
	onProgress?: (progress: number) => void,
): Promise<GameTextures> {
	if (cached) {
		onProgress?.(1);
		return Promise.resolve(cached);
	}

	if (onProgress) progressListeners.add(onProgress);

	if (!pending) {
		pending = loadAll()
			.then((textures) => {
				cached = textures;
				return textures;
			})
			.catch((error: unknown) => {
				attempt += 1;
				throw error;
			})
			.finally(() => {
				pending = null;
				progressListeners.clear();
			});
	}

	return pending;
}
