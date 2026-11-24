import {
	advance,
	openApp,
	readState,
	setOptions,
	startMatch,
} from "../support/app";
import {
	distance,
	enemyProjectiles,
	fightNearest,
	overlapsIsland,
	STEP,
	sample,
} from "../support/combat";
import { expect, test } from "../support/fixtures";

test.describe("Enemies and scoring", () => {
	test("a destroyed enemy scores exactly one point and each hit deals damage once", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);

		await advance(page, 10);
		const spawned = await readState(page);
		const target = spawned.enemies[0];
		expect(target?.kind).toBe("chaser");
		if (!target) return;

		const healthHistory: number[] = [target.health];
		const final = await fightNearest(page, 8, (state) => {
			const current = state.enemies.find((enemy) => enemy.id === target.id);
			if (!current) return true;
			if (current.health !== healthHistory[healthHistory.length - 1])
				healthHistory.push(current.health);
			return false;
		});

		expect(
			final.enemies.find((enemy) => enemy.id === target.id),
		).toBeUndefined();
		expect(final.score).toBe(1);
		expect(final.player.health).toBe(final.player.maxHealth);

		for (let index = 1; index < healthHistory.length; index += 1) {
			const drop =
				(healthHistory[index - 1] ?? 0) - (healthHistory[index] ?? 0);
			expect(drop % final.config.front.damage).toBe(0);
			expect(drop).toBeGreaterThan(0);
		}

		await advance(page, 1);
		const later = await readState(page);
		expect(later.score).toBe(1);
		await expect(page.getByTestId("hud-score")).toHaveText("1");
	});

	test("the chaser hunts the player and explodes on impact without scoring", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);

		await advance(page, 10);
		const spawned = await readState(page);
		const chaser = spawned.enemies.find((enemy) => enemy.kind === "chaser");
		expect(chaser).toBeDefined();
		if (!chaser) return;

		let lastDistance = distance(chaser, spawned.player);
		let shrinking = 0;
		let impactHealth: number | null = null;
		let healthBefore = spawned.player.health;

		await sample(page, 9, STEP * 3, (state) => {
			const current = state.enemies.find((enemy) => enemy.id === chaser.id);
			if (!current) {
				impactHealth = state.player.health;
				return true;
			}
			expect(overlapsIsland(state, current)).toBe(false);
			const gap = distance(current, state.player);
			if (gap < lastDistance) shrinking += 1;
			lastDistance = gap;
			healthBefore = state.player.health;
			return false;
		});

		const state = await readState(page);
		expect(impactHealth).not.toBeNull();
		expect(shrinking).toBeGreaterThan(10);
		expect(healthBefore - (impactHealth ?? healthBefore)).toBe(
			state.config.chaser.contactDamage,
		);
		expect(state.score).toBe(0);
	});

	test("the shooter keeps its distance and fires only within range", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 180, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);

		await advance(page, 10);
		await sample(
			page,
			10,
			STEP * 6,
			(state) => !state.enemies.some((enemy) => enemy.kind === "chaser"),
		);
		const beforeShooter = await readState(page);
		expect(beforeShooter.enemies.some((enemy) => enemy.kind === "chaser")).toBe(
			false,
		);

		const untilSpawn = 20 - beforeShooter.elapsed;
		if (untilSpawn > 0) await advance(page, untilSpawn);

		const spawned = await readState(page);
		const shooter = spawned.enemies.find((enemy) => enemy.kind === "shooter");
		expect(shooter).toBeDefined();
		if (!shooter) return;

		const { attackRange, preferredDistance, cannon } = spawned.config.shooter;
		let firstShotDistance: number | null = null;
		let healthBefore = spawned.player.health;
		const healthDrops: number[] = [];

		const final = await sample(page, 10, STEP * 2, (state) => {
			const current = state.enemies.find((enemy) => enemy.id === shooter.id);
			if (!current) return true;
			expect(overlapsIsland(state, current)).toBe(false);
			if (firstShotDistance === null && enemyProjectiles(state).length > 0) {
				firstShotDistance = distance(current, state.player);
			}
			if (state.player.health < healthBefore)
				healthDrops.push(healthBefore - state.player.health);
			healthBefore = state.player.health;
			return false;
		});

		const current = final.enemies.find((enemy) => enemy.id === shooter.id);
		expect(current).toBeDefined();
		if (!current) return;

		expect(firstShotDistance).not.toBeNull();
		expect(firstShotDistance ?? Infinity).toBeLessThanOrEqual(
			attackRange + cannon.speed * STEP * 2,
		);
		expect(distance(current, final.player)).toBeLessThanOrEqual(attackRange);
		expect(distance(current, final.player)).toBeGreaterThan(
			preferredDistance - 60,
		);
		expect(healthDrops.length).toBeGreaterThan(0);
		for (const drop of healthDrops) expect(drop % cannon.damage).toBe(0);
		expect(final.score).toBe(0);
	});
});
