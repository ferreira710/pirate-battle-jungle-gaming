import type { Page } from "@playwright/test";
import type { BridgeState } from "../../src/testing/testBridge";
import {
	advance,
	holdKeys,
	openApp,
	readState,
	run,
	setOptions,
	startMatch,
	step,
} from "../support/app";
import { defendUntil, STEP } from "../support/combat";
import { expect, test } from "../support/fixtures";

function frozenParts(state: BridgeState) {
	return {
		elapsed: state.elapsed,
		remaining: state.remaining,
		score: state.score,
		spawnCount: state.spawnCount,
		player: state.player,
		enemies: state.enemies,
		projectiles: state.projectiles,
	};
}

async function releaseKeys(page: Page, keys: readonly string[]): Promise<void> {
	for (const key of keys) await page.keyboard.up(key);
}

async function waitForFreshMatch(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const state = window.__PIRATE_BATTLE__?.state();
		return (
			state !== null &&
			state !== undefined &&
			state.phase === "running" &&
			state.elapsed === 0
		);
	});
}

test.describe("Match end", () => {
	test("ends when the time runs out and freezes the simulation", async ({
		page,
	}) => {
		test.setTimeout(150_000);
		await setOptions(page, { sessionTime: 60, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);

		const lastStep = await defendUntil(page, 60 - STEP);
		expect(lastStep.phase).toBe("running");
		expect(lastStep.player.health).toBeGreaterThan(0);

		const held = ["KeyW", "Space"] as const;
		for (const key of held) await page.keyboard.down(key);

		const ended = await step(page, STEP);
		const frozen = await step(page, 2);
		await expect(page.getByTestId("end-banner")).toHaveText("Time's up!");
		await releaseKeys(page, held);

		expect(ended.phase).toBe("ended");
		expect(ended.endReason).toBe("time");
		expect(ended.remaining).toBe(0);
		expect(ended.elapsed).toBe(60);
		expect(frozenParts(frozen)).toEqual(frozenParts(ended));

		await expect(page).toHaveURL(/#\/result$/);
		await expect(page.getByTestId("result-reason")).toHaveAttribute(
			"data-reason",
			"time",
		);
		await expect(page.getByTestId("result-score")).toHaveText(
			String(ended.score),
		);
	});

	test("ends when the ship is destroyed and freezes the simulation", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 180, spawnInterval: 1 });
		await openApp(page);
		await startMatch(page);

		await page.keyboard.down("KeyW");
		const samples = await run(page, 90, 0.5);
		const frozen = await step(page, 2);
		await expect(page.getByTestId("end-banner")).toHaveText(
			"Your ship has sunk!",
		);
		await releaseKeys(page, ["KeyW"]);

		const ended = samples[samples.length - 1];
		expect(ended).toBeDefined();
		if (!ended) return;

		expect(ended.phase).toBe("ended");
		expect(ended.endReason).toBe("death");
		expect(ended.player.health).toBe(0);
		expect(ended.elapsed).toBeLessThan(180);
		expect(ended.score).toBe(0);
		expect(frozenParts(frozen)).toEqual(frozenParts(ended));

		await expect(page).toHaveURL(/#\/result$/);
		await expect(page.getByTestId("result-reason")).toHaveAttribute(
			"data-reason",
			"death",
		);
	});

	test("restarting creates a clean match", async ({ page }) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 2 });
		await openApp(page);
		await startMatch(page);
		const initial = await readState(page);

		await holdKeys(page, ["KeyW", "Space"], 1);
		await advance(page, 4);
		const played = await readState(page);
		expect(played.elapsed).toBeGreaterThan(4);
		expect(played.spawnCount).toBeGreaterThan(0);
		expect(played.player.y).not.toBe(initial.player.y);

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-dialog")).toBeVisible();
		await page.getByTestId("pause-restart").click();
		await waitForFreshMatch(page);

		const fresh = await readState(page);
		expect(fresh.phase).toBe("running");
		expect(fresh.remaining).toBe(120);
		expect(fresh.score).toBe(0);
		expect(fresh.spawnCount).toBe(0);
		expect(fresh.enemies).toEqual([]);
		expect(fresh.projectiles).toEqual([]);
		expect(fresh.player).toEqual(initial.player);

		await expect(page.getByTestId("pause-dialog")).toBeHidden();
		await expect(page.getByTestId("hud-score")).toHaveText("0");
		await expect(page.getByTestId("hud-time")).toHaveAttribute(
			"data-seconds",
			"120",
		);
		await expect(page.getByTestId("game-canvas")).toHaveCount(1);

		await holdKeys(page, ["KeyW"], 0.5);
		const moving = await readState(page);
		expect(moving.player.y).toBeLessThan(fresh.player.y);
	});
});
