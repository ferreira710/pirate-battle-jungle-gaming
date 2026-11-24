export interface Rng {
	readonly seed: number;
	next(): number;
	range(min: number, max: number): number;
	pick<T>(items: readonly T[]): T;
	weighted<K extends string>(weights: Readonly<Record<K, number>>): K;
}

export function createRng(seed: number): Rng {
	let state = seed >>> 0;

	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	return {
		seed: seed >>> 0,
		next,
		range(min, max) {
			return min + next() * (max - min);
		},
		pick(items) {
			const item = items[Math.floor(next() * items.length)];
			if (item === undefined) throw new Error("Cannot pick from an empty list");
			return item;
		},
		weighted(weights) {
			const entries = Object.entries(weights) as [
				keyof typeof weights,
				number,
			][];
			const total = entries.reduce(
				(sum, [, weight]) => sum + Math.max(0, weight),
				0,
			);
			if (total <= 0) throw new Error("Weights must have a positive total");
			let roll = next() * total;
			for (const [key, weight] of entries) {
				roll -= Math.max(0, weight);
				if (roll < 0) return key;
			}
			const last = entries[entries.length - 1];
			if (last === undefined) throw new Error("Weights cannot be empty");
			return last[0];
		},
	};
}

export function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}
