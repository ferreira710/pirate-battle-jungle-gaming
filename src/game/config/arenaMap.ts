import { circleIntersectsRect, type Rect, type Vec2 } from "../sim/geometry";

export interface TileRect {
	col: number;
	row: number;
	cols: number;
	rows: number;
}

export interface IslandDef {
	id: string;
	parts: TileRect[];
}

export interface SpawnPoint extends Vec2 {
	rotation: number;
}

export interface ArenaMapDef {
	id: string;
	playerSpawn: SpawnPoint;
	playerSpawnClearance: number;
	islands: IslandDef[];
}

export interface WorldBounds {
	readonly width: number;
	readonly height: number;
	readonly tileSize: number;
}

export interface Island {
	readonly id: string;
	readonly rects: readonly Rect[];
	readonly tiles: readonly TileRect[];
}

export interface ArenaMap {
	readonly id: string;
	readonly width: number;
	readonly height: number;
	readonly tileSize: number;
	readonly playerSpawn: Readonly<SpawnPoint>;
	readonly islands: readonly Island[];
	readonly colliders: readonly Rect[];
}

export const DEFAULT_ARENA: ArenaMapDef = {
	id: "archipelago-v1",
	playerSpawn: { x: 800, y: 450, rotation: -Math.PI / 2 },
	playerSpawnClearance: 96,
	islands: [
		{
			id: "north-west",
			parts: [
				{ col: 2, row: 1, cols: 5, rows: 3 },
				{ col: 2, row: 4, cols: 2, rows: 3 },
			],
		},
		{
			id: "west-rock",
			parts: [{ col: 7, row: 7, cols: 2, rows: 2 }],
		},
		{
			id: "south",
			parts: [
				{ col: 9, row: 11, cols: 7, rows: 3 },
				{ col: 13, row: 9, cols: 3, rows: 2 },
			],
		},
		{
			id: "east",
			parts: [{ col: 18, row: 2, cols: 3, rows: 4 }],
		},
		{
			id: "south-east",
			parts: [
				{ col: 20, row: 11, cols: 4, rows: 3 },
				{ col: 22, row: 9, cols: 2, rows: 2 },
			],
		},
	],
};

function tileToRect(tile: TileRect, tileSize: number): Rect {
	return {
		x: tile.col * tileSize,
		y: tile.row * tileSize,
		width: tile.cols * tileSize,
		height: tile.rows * tileSize,
	};
}

export function buildArenaMap(def: ArenaMapDef, world: WorldBounds): ArenaMap {
	const islands: Island[] = def.islands.map((island) => {
		const rects = island.parts.map((part) => tileToRect(part, world.tileSize));
		for (const rect of rects) {
			if (
				rect.x < 0 ||
				rect.y < 0 ||
				rect.x + rect.width > world.width ||
				rect.y + rect.height > world.height
			) {
				throw new Error(`Island "${island.id}" is outside the arena bounds`);
			}
		}
		return Object.freeze({
			id: island.id,
			rects: Object.freeze(rects.map((rect) => Object.freeze(rect))),
			tiles: Object.freeze(
				island.parts.map((part) => Object.freeze({ ...part })),
			),
		});
	});

	const colliders = islands.flatMap((island) => island.rects);

	const spawnArea = {
		x: def.playerSpawn.x,
		y: def.playerSpawn.y,
		radius: def.playerSpawnClearance,
	};

	if (colliders.some((rect) => circleIntersectsRect(spawnArea, rect))) {
		throw new Error(`Player spawn of map "${def.id}" overlaps an island`);
	}

	return Object.freeze({
		id: def.id,
		width: world.width,
		height: world.height,
		tileSize: world.tileSize,
		playerSpawn: Object.freeze({ ...def.playerSpawn }),
		islands: Object.freeze(islands),
		colliders: Object.freeze(colliders),
	});
}
