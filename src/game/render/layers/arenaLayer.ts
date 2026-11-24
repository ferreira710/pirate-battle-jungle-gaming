import {
	Container,
	Graphics,
	Sprite,
	type Texture,
	TilingSprite,
} from "pixi.js";
import type { Island } from "../../config/arenaMap";
import type { GameState } from "../../sim/state";
import type { GameTextures } from "../assets";
import type { LayerContext, SceneLayer } from "../gameRenderer";

interface TileSet {
	readonly topLeft: number;
	readonly top: readonly number[];
	readonly topRight: number;
	readonly left: readonly number[];
	readonly center: readonly number[];
	readonly right: readonly number[];
	readonly bottomLeft: number;
	readonly bottom: readonly number[];
	readonly bottomRight: number;
}

const SAND_SET: TileSet = {
	topLeft: 1,
	top: [2],
	topRight: 3,
	left: [17],
	center: [18],
	right: [19],
	bottomLeft: 33,
	bottom: [34],
	bottomRight: 35,
};

const GRASS_SET: TileSet = {
	topLeft: 6,
	top: [7, 8],
	topRight: 9,
	left: [22, 38],
	center: [23, 24, 39, 40],
	right: [25, 41],
	bottomLeft: 54,
	bottom: [55, 56],
	bottomRight: 57,
};

const WATER_TILE = 73;
const WATER_DRIFT_X = 6;
const WATER_DRIFT_Y = 3;
const GRASS_DECOR = [70, 71, 72, 87, 88] as const;
const ROCK_DECOR = [49, 50, 51, 65, 66, 67] as const;
const SMALL_ISLAND_CELLS = 4;
const DECOR_CHANCE = 3;
const DECOR_SCALE = 0.8;
const SHALLOW_PADDING = 18;
const SHALLOW_RADIUS = 28;
const SHALLOW_COLOR = 0xc8f0ff;
const SHALLOW_ALPHA = 0.3;

function cellKey(col: number, row: number): string {
	return `${col},${row}`;
}

function cellHash(col: number, row: number): number {
	return (Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663)) >>> 0;
}

function variant(list: readonly number[], index: number): number {
	return list[index % list.length] ?? list[0] ?? 0;
}

function pickTile(
	set: TileSet,
	cells: ReadonlySet<string>,
	col: number,
	row: number,
): number {
	const north = cells.has(cellKey(col, row - 1));
	const south = cells.has(cellKey(col, row + 1));
	const west = cells.has(cellKey(col - 1, row));
	const east = cells.has(cellKey(col + 1, row));

	if (!north) {
		if (!west) return set.topLeft;
		if (!east) return set.topRight;
		return variant(set.top, col);
	}

	if (!south) {
		if (!west) return set.bottomLeft;
		if (!east) return set.bottomRight;
		return variant(set.bottom, col);
	}

	if (!west) return variant(set.left, row);
	if (!east) return variant(set.right, row);
	return variant(set.center, (row % 2) * 2 + (col % 2));
}

function tileTexture(textures: GameTextures, id: number): Texture {
	const texture = textures.tiles.get(id);
	if (!texture) throw new Error(`Missing tile texture ${id}`);
	return texture;
}

function addDecoration(
	parent: Container,
	texture: Texture,
	x: number,
	y: number,
	rotation: number,
): void {
	const decor = new Sprite(texture);
	decor.anchor.set(0.5);
	decor.position.set(x, y);
	decor.scale.set(DECOR_SCALE);
	decor.rotation = rotation;
	parent.addChild(decor);
}

function buildIsland(
	island: Island,
	textures: GameTextures,
	tileSize: number,
): Container {
	const container = new Container();
	const cells = new Set<string>();
	const list: { col: number; row: number }[] = [];

	for (const part of island.tiles) {
		for (let row = part.row; row < part.row + part.rows; row += 1) {
			for (let col = part.col; col < part.col + part.cols; col += 1) {
				const key = cellKey(col, row);
				if (cells.has(key)) continue;
				cells.add(key);
				list.push({ col, row });
			}
		}
	}

	const small = list.length <= SMALL_ISLAND_CELLS;
	const set = small ? SAND_SET : GRASS_SET;
	const decorLayer = new Container();

	for (const { col, row } of list) {
		const tile = new Sprite(
			tileTexture(textures, pickTile(set, cells, col, row)),
		);
		tile.position.set(col * tileSize, row * tileSize);
		tile.width = tileSize;
		tile.height = tileSize;
		container.addChild(tile);

		const interior =
			cells.has(cellKey(col, row - 1)) &&
			cells.has(cellKey(col, row + 1)) &&
			cells.has(cellKey(col - 1, row)) &&
			cells.has(cellKey(col + 1, row));

		const hash = cellHash(col, row);
		if (!small && interior && hash % DECOR_CHANCE === 0) {
			const id = GRASS_DECOR[hash % GRASS_DECOR.length] ?? GRASS_DECOR[0];
			addDecoration(
				decorLayer,
				tileTexture(textures, id),
				col * tileSize + tileSize / 2,
				row * tileSize + tileSize / 2,
				((hash >>> 8) % 360) * (Math.PI / 180),
			);
		}
	}

	if (small) {
		const first = list[0];
		if (first) {
			const minCol = Math.min(...list.map((cell) => cell.col));
			const maxCol = Math.max(...list.map((cell) => cell.col));
			const minRow = Math.min(...list.map((cell) => cell.row));
			const maxRow = Math.max(...list.map((cell) => cell.row));
			const hash = cellHash(first.col, first.row);
			const id = ROCK_DECOR[hash % ROCK_DECOR.length] ?? ROCK_DECOR[0];
			addDecoration(
				decorLayer,
				tileTexture(textures, id),
				((minCol + maxCol + 1) / 2) * tileSize,
				((minRow + maxRow + 1) / 2) * tileSize,
				0,
			);
		}
	}

	container.addChild(decorLayer);
	return container;
}

function buildShallows(islands: readonly Island[]): Container {
	const wrapper = new Container();
	const shapes = new Graphics();

	for (const island of islands) {
		for (const rect of island.rects) {
			shapes.roundRect(
				rect.x - SHALLOW_PADDING,
				rect.y - SHALLOW_PADDING,
				rect.width + SHALLOW_PADDING * 2,
				rect.height + SHALLOW_PADDING * 2,
				SHALLOW_RADIUS,
			);
			shapes.fill(SHALLOW_COLOR);
		}
	}

	wrapper.addChild(shapes);
	wrapper.cacheAsTexture(true);
	wrapper.alpha = SHALLOW_ALPHA;
	return wrapper;
}

export function createArenaLayer({
	textures,
	state,
}: LayerContext): SceneLayer {
	const { map } = state;
	const container = new Container();

	const water = new TilingSprite({
		texture: tileTexture(textures, WATER_TILE),
		width: map.width,
		height: map.height,
	});

	const shallows = buildShallows(map.islands);
	const islands = new Container();
	for (const island of map.islands) {
		islands.addChild(buildIsland(island, textures, map.tileSize));
	}

	container.addChild(water, shallows, islands);

	return {
		container,
		update(current: Readonly<GameState>) {
			water.tilePosition.set(
				current.elapsed * WATER_DRIFT_X,
				current.elapsed * WATER_DRIFT_Y,
			);
		},
		destroy() {
			shallows.cacheAsTexture(false);
			container.destroy({ children: true });
		},
	};
}
