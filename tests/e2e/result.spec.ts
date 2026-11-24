import type { Page } from "@playwright/test";
import type { BridgeState } from "../../src/testing/testBridge";
import {
	openApp,
	readStored,
	run,
	STORAGE_KEYS,
	setOptions,
	startMatch,
} from "../support/app";
import { expect, test } from "../support/fixtures";

function formatClock(totalSeconds: number): string {
	const safe = Math.max(0, Math.floor(totalSeconds));
	return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

async function finishByDeath(page: Page): Promise<BridgeState> {
	await setOptions(page, { sessionTime: 60, spawnInterval: 1 });
	await openApp(page);
	await startMatch(page);
	const samples = await run(page, 90, 0.5);
	const ended = samples[samples.length - 1];
	if (ended?.phase !== "ended") throw new Error("The match did not end");
	await expect(page).toHaveURL(/#\/result$/);
	return ended;
}

async function expectResult(page: Page, ended: BridgeState): Promise<void> {
	await expect(page.getByTestId("result-score")).toHaveText(
		String(ended.score),
	);
	await expect(page.getByTestId("result-duration")).toHaveText(
		formatClock(ended.elapsed),
	);
	await expect(page.getByTestId("result-reason")).toHaveText("Ship destroyed");
	await expect(page.getByTestId("result-settings")).toHaveText(
		"60 s match · enemy every 1 s",
	);
	await expect(page.getByTestId("result-registration")).toHaveAttribute(
		"data-status",
		"confirmed",
	);
	await expect(page.getByTestId("result-registration")).toContainText(
		"Saved to ranking and match history.",
	);
}

test.describe("Result screen", () => {
	test("shows the outcome of the finished match and its registration", async ({
		page,
	}) => {
		const ended = await finishByDeath(page);

		await expect(
			page.getByRole("heading", { level: 1, name: "Your ship has sunk" }),
		).toBeFocused();
		await expectResult(page, ended);
		await expect(page.getByTestId("result-play-again")).toBeVisible();
		await expect(page.getByTestId("result-menu")).toBeVisible();

		const stored = await readStored<{
			matchId: string;
			score: number;
			reason: string;
			duration: number;
		}>(page, STORAGE_KEYS.lastResult);
		expect(stored?.score).toBe(ended.score);
		expect(stored?.reason).toBe("death");
		expect(stored?.duration).toBeCloseTo(ended.elapsed, 3);
		expect(stored?.matchId).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("keeps the result after a refresh", async ({ page }) => {
		const ended = await finishByDeath(page);
		await expectResult(page, ended);
		const before = await readStored<{ matchId: string }>(
			page,
			STORAGE_KEYS.lastResult,
		);

		await page.reload();
		await expect(page).toHaveURL(/#\/result$/);
		await expectResult(page, ended);

		const after = await readStored<{ matchId: string }>(
			page,
			STORAGE_KEYS.lastResult,
		);
		expect(after?.matchId).toBe(before?.matchId);
		const outbox = await readStored<{ status: string }[]>(
			page,
			STORAGE_KEYS.outbox,
		);
		expect(outbox).toHaveLength(1);
		expect(outbox?.[0]?.status).toBe("confirmed");
	});

	test("Play Again starts a new match and Main Menu returns to the menu", async ({
		page,
	}) => {
		await finishByDeath(page);

		await page.getByTestId("result-play-again").click();
		await page.waitForFunction(() => {
			const state = window.__PIRATE_BATTLE__?.state();
			return (
				state !== null &&
				state !== undefined &&
				state.phase === "running" &&
				state.elapsed === 0
			);
		});
		await expect(page.getByTestId("hud-score")).toHaveText("0");

		await page.keyboard.press("Escape");
		await page.getByTestId("pause-exit").click();
		await page.goto("/?e2e=1#/result");
		await page.getByTestId("result-menu").click();
		await expect(page.getByTestId("menu-play")).toBeVisible();
	});

	test("shows an empty state when no match was finished yet", async ({
		page,
	}) => {
		await openApp(page, { route: "result" });
		await expect(
			page.getByRole("heading", { level: 1, name: "No results yet" }),
		).toBeVisible();
		await page.getByTestId("result-menu").click();
		await expect(page.getByTestId("menu-play")).toBeVisible();
	});
});
