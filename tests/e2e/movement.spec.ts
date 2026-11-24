import type { Page } from "@playwright/test";
import type { BridgeState } from "../../src/testing/testBridge";
import {
	advance,
	holdKeys,
	openApp,
	readState,
	setOptions,
	startMatch,
} from "../support/app";
import { expect, test } from "../support/fixtures";

const STEP = 1 / 60;

function angleDiff(a: number, b: number): number {
	let delta = (a - b) % (Math.PI * 2);
	if (delta > Math.PI) delta -= Math.PI * 2;
	if (delta < -Math.PI) delta += Math.PI * 2;
	return delta;
}

function overlapsIsland(state: BridgeState): boolean {
	const { x, y, radius } = state.player;
	return state.colliders.some((rect) => {
		const closestX = Math.min(Math.max(x, rect.x), rect.x + rect.width);
		const closestY = Math.min(Math.max(y, rect.y), rect.y + rect.height);
		return Math.hypot(x - closestX, y - closestY) < radius - 0.5;
	});
}

async function turnTo(page: Page, target: number): Promise<void> {
	const start = await readState(page);
	const key = angleDiff(target, start.player.rotation) > 0 ? "KeyD" : "KeyA";

	await holdKeys(page, [key], STEP);
	const probe = await readState(page);
	const perStep = Math.abs(
		angleDiff(probe.player.rotation, start.player.rotation),
	);
	const steps = Math.round(
		Math.abs(angleDiff(target, probe.player.rotation)) / perStep,
	);

	if (steps > 0) await holdKeys(page, [key], steps * STEP);
}

test.describe("Player movement", () => {
	test.beforeEach(async ({ page }) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);
	});

	test("stays still without input", async ({ page }) => {
		const before = await readState(page);
		await advance(page, 1);
		const after = await readState(page);

		expect(after.elapsed).toBeCloseTo(1, 5);
		expect(after.player.x).toBe(before.player.x);
		expect(after.player.y).toBe(before.player.y);
		expect(after.player.rotation).toBe(before.player.rotation);
	});

	test("sails forward in the direction of the bow", async ({ page }) => {
		const before = await readState(page);
		await holdKeys(page, ["KeyW"], 1);
		const after = await readState(page);

		const dx = after.player.x - before.player.x;
		const dy = after.player.y - before.player.y;
		const distance = Math.hypot(dx, dy);

		expect(distance).toBeGreaterThan(50);
		expect(dx / distance).toBeCloseTo(Math.cos(before.player.rotation), 3);
		expect(dy / distance).toBeCloseTo(Math.sin(before.player.rotation), 3);
		expect(after.player.rotation).toBe(before.player.rotation);
	});

	test("moves the same distance for the same simulated time", async ({
		page,
	}) => {
		const start = await readState(page);
		await holdKeys(page, ["KeyW"], 0.5);
		const middle = await readState(page);

		await page.keyboard.down("KeyW");
		for (let index = 0; index < 30; index += 1) await advance(page, STEP);
		await page.keyboard.up("KeyW");
		const end = await readState(page);

		const first = Math.hypot(
			middle.player.x - start.player.x,
			middle.player.y - start.player.y,
		);
		const second = Math.hypot(
			end.player.x - middle.player.x,
			end.player.y - middle.player.y,
		);
		expect(second).toBeCloseTo(first, 6);
	});

	test("rotates to both sides without moving", async ({ page }) => {
		const before = await readState(page);

		await holdKeys(page, ["KeyD"], 0.5);
		const right = await readState(page);
		expect(
			angleDiff(right.player.rotation, before.player.rotation),
		).toBeGreaterThan(0.5);
		expect(right.player.x).toBe(before.player.x);
		expect(right.player.y).toBe(before.player.y);

		await holdKeys(page, ["KeyA"], 1);
		const left = await readState(page);
		expect(
			angleDiff(left.player.rotation, before.player.rotation),
		).toBeLessThan(-0.5);

		await holdKeys(page, ["ArrowRight"], 0.5);
		const arrows = await readState(page);
		expect(
			angleDiff(arrows.player.rotation, before.player.rotation),
		).toBeCloseTo(0, 5);
	});

	test("cannot leave the visible arena", async ({ page }) => {
		await holdKeys(page, ["KeyW"], 6);
		const state = await readState(page);

		expect(state.player.y).toBeCloseTo(state.player.radius, 5);
		expect(state.player.x - state.player.radius).toBeGreaterThanOrEqual(0);
		expect(state.player.x + state.player.radius).toBeLessThanOrEqual(
			state.world.width,
		);
	});

	test("cannot sail through an island", async ({ page }) => {
		const start = await readState(page);
		const island = start.colliders.find(
			(rect) =>
				rect.x + rect.width < start.player.x &&
				start.player.y >= rect.y - start.player.radius &&
				start.player.y <= rect.y + rect.height + start.player.radius,
		);
		expect(island, "an island must lie west of the spawn point").toBeDefined();
		if (!island) return;

		await turnTo(page, Math.PI);
		await holdKeys(page, ["KeyW"], 4);
		const state = await readState(page);

		expect(state.player.x).toBeLessThan(start.player.x);
		expect(state.player.x - state.player.radius).toBeGreaterThanOrEqual(
			island.x + island.width - 0.5,
		);
		expect(overlapsIsland(state)).toBe(false);
	});
});
