import {
	advance,
	holdKeys,
	openApp,
	readState,
	setOptions,
	startMatch,
	tapKey,
} from "../support/app";
import {
	angleDiff,
	playerProjectiles,
	STEP,
	sample,
	turnTo,
} from "../support/combat";
import { expect, test } from "../support/fixtures";

test.describe("Player weapons", () => {
	test.beforeEach(async ({ page }) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);
	});

	test("the bow cannon fires one projectile forward", async ({ page }) => {
		const before = await readState(page);
		await tapKey(page, "Space");
		const state = await readState(page);
		const shots = playerProjectiles(state);

		expect(shots).toHaveLength(before.config.front.count);
		const [shot] = shots;
		if (!shot) return;
		expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(state.player.rotation, 5);
		expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(
			state.config.front.speed,
			5,
		);
		expect(state.player.cooldowns.front).toBeCloseTo(
			state.config.front.cooldown,
			5,
		);
	});

	test("the bow cannon respects its cooldown while held", async ({ page }) => {
		const { config } = await readState(page);
		const seen = new Set<number>();
		const holdFor = 1;

		await page.keyboard.down("Space");
		await sample(page, holdFor, STEP, (state) => {
			for (const shot of playerProjectiles(state)) seen.add(shot.id);
		});
		await page.keyboard.up("Space");

		const expected =
			Math.floor((holdFor - STEP) / config.front.cooldown + 1e-9) + 1;
		expect(seen.size).toBe(expected);
	});

	for (const [key, side, offset] of [
		["KeyQ", "left", -Math.PI / 2],
		["KeyE", "right", Math.PI / 2],
	] as const) {
		test(`the ${side} broadside fires three parallel projectiles`, async ({
			page,
		}) => {
			await tapKey(page, key);
			const state = await readState(page);
			const shots = playerProjectiles(state);

			expect(shots).toHaveLength(state.config.side.count);
			for (const shot of shots) {
				expect(
					angleDiff(
						Math.atan2(shot.vy, shot.vx),
						state.player.rotation + offset,
					),
				).toBeCloseTo(0, 5);
				expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(
					state.config.side.speed,
					5,
				);
			}

			const along = shots
				.map(
					(shot) =>
						shot.x * Math.cos(state.player.rotation) +
						shot.y * Math.sin(state.player.rotation),
				)
				.sort((a, b) => a - b);
			for (let index = 1; index < along.length; index += 1) {
				expect((along[index] ?? 0) - (along[index - 1] ?? 0)).toBeCloseTo(
					state.config.side.spacing,
					5,
				);
			}
		});
	}

	test("each weapon has its own cooldown", async ({ page }) => {
		await tapKey(page, "KeyQ");
		await tapKey(page, "KeyQ");
		let state = await readState(page);
		expect(playerProjectiles(state)).toHaveLength(state.config.side.count);

		await tapKey(page, "KeyE");
		await tapKey(page, "Space");
		state = await readState(page);
		expect(playerProjectiles(state)).toHaveLength(
			state.config.side.count * 2 + state.config.front.count,
		);

		await advance(page, state.config.side.cooldown);
		await tapKey(page, "KeyQ");
		state = await readState(page);
		expect(state.player.cooldowns.left).toBeCloseTo(
			state.config.side.cooldown,
			5,
		);
	});

	test("projectiles expire after their range", async ({ page }) => {
		await tapKey(page, "Space");
		const { config } = await readState(page);
		const lifetime = config.front.range / config.front.speed;

		await advance(page, lifetime - 0.1);
		expect(playerProjectiles(await readState(page))).toHaveLength(1);

		await advance(page, 0.15);
		expect(playerProjectiles(await readState(page))).toHaveLength(0);
	});

	test("projectiles are removed when they leave the arena", async ({
		page,
	}) => {
		await holdKeys(page, ["KeyW"], 6);
		await tapKey(page, "Space");
		const { config } = await readState(page);

		await advance(page, 0.2);
		const state = await readState(page);
		expect(0.2).toBeLessThan(config.front.range / config.front.speed);
		expect(playerProjectiles(state)).toHaveLength(0);
	});

	test("islands block projectiles", async ({ page }) => {
		const start = await readState(page);
		const island = start.colliders.find(
			(rect) =>
				rect.x + rect.width < start.player.x &&
				start.player.y >= rect.y &&
				start.player.y <= rect.y + rect.height,
		);
		expect(island).toBeDefined();
		if (!island) return;

		await turnTo(page, Math.PI);
		await tapKey(page, "Space");

		let minX = Infinity;
		const state = await sample(page, 0.6, STEP * 2, (current) => {
			for (const shot of playerProjectiles(current))
				minX = Math.min(minX, shot.x);
		});

		expect(minX).toBeGreaterThanOrEqual(island.x + island.width - 1);
		expect(playerProjectiles(state)).toHaveLength(0);
		expect(0.6).toBeLessThan(
			state.config.front.range / state.config.front.speed,
		);
	});
});
