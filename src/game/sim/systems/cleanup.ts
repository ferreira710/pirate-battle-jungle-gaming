import type { GameState } from "../state";

export function removeDead<T extends { alive: boolean }>(items: T[]): void {
	let write = 0;
	for (let read = 0; read < items.length; read += 1) {
		const item = items[read];
		if (item?.alive) {
			items[write] = item;
			write += 1;
		}
	}
	items.length = write;
}

export function removeDeadEntities(state: GameState): void {
	removeDead(state.enemies);
	removeDead(state.projectiles);
}
