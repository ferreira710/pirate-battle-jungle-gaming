import {
	advance,
	openApp,
	readState,
	setOptions,
	startMatch,
} from "../support/app";
import { distance, overlapsIsland, STEP } from "../support/combat";
import { expect, test } from "../support/fixtures";

test.describe("Enemy spawning", () => {
	for (const interval of [2, 5]) {
		test(`spawns one enemy every ${interval} seconds at a safe point`, async ({
			page,
		}) => {
			await setOptions(page, { sessionTime: 120, spawnInterval: interval });
			await openApp(page);
			await startMatch(page);

			await advance(page, interval - STEP);
			expect((await readState(page)).spawnCount).toBe(0);

			await advance(page, STEP);
			const first = await readState(page);
			expect(first.spawnCount).toBe(1);
			const firstEnemy = first.enemies[0];
			expect(firstEnemy?.kind).toBe(first.config.openingSequence[0]);
			if (firstEnemy) {
				expect(distance(firstEnemy, first.player)).toBeGreaterThanOrEqual(
					first.config.minSpawnDistance,
				);
				expect(overlapsIsland(first, firstEnemy)).toBe(false);
			}

			await advance(page, interval - STEP);
			expect((await readState(page)).spawnCount).toBe(1);

			await advance(page, STEP);
			const second = await readState(page);
			expect(second.spawnCount).toBe(2);
			const newest = second.enemies.reduce((a, b) => (b.id > a.id ? b : a));
			expect(newest.kind).toBe(second.config.openingSequence[1]);
			expect(distance(newest, second.player)).toBeGreaterThanOrEqual(
				second.config.minSpawnDistance,
			);
			expect(overlapsIsland(second, newest)).toBe(false);
		});
	}

	test("both enemy types appear in a standard match", async ({ page }) => {
		await openApp(page);
		await startMatch(page);

		const { config } = await readState(page);
		expect(config.spawnInterval).toBe(3);

		await advance(page, config.spawnInterval * 2);
		const state = await readState(page);
		const kinds = new Set(state.enemies.map((enemy) => enemy.kind));

		expect(state.spawnCount).toBe(2);
		expect(kinds).toEqual(new Set(["chaser", "shooter"]));
	});

	test("spawns are reproducible with the same seed", async ({ browser }) => {
		const positions: string[] = [];

		for (let run = 0; run < 2; run += 1) {
			const context = await browser.newContext();
			const page = await context.newPage();
			await openApp(page, { seed: 1234 });
			await startMatch(page);
			await advance(page, 9);
			const state = await readState(page);
			positions.push(
				JSON.stringify(
					state.enemies.map((enemy) => [
						enemy.kind,
						enemy.x.toFixed(3),
						enemy.y.toFixed(3),
					]),
				),
			);
			await context.close();
		}

		expect(positions[0]).toBe(positions[1]);
	});
});
