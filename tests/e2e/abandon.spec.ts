import type { Page } from "@playwright/test";
import {
	advance,
	openApp,
	readStored,
	run,
	STORAGE_KEYS,
	setOptions,
	startMatch,
} from "../support/app";
import { expect, test } from "../support/fixtures";

async function expectNothingRecorded(page: Page): Promise<void> {
	expect(await readStored(page, STORAGE_KEYS.lastResult)).toBeNull();
	expect(await readStored(page, STORAGE_KEYS.outbox)).toBeNull();
	await page.getByTestId("tab-history").click();
	await expect(page.getByTestId("history-empty")).toBeVisible();
}

test.describe("Abandoning a match", () => {
	test.beforeEach(async ({ page }) => {
		await setOptions(page, { sessionTime: 60, spawnInterval: 1 });
		await openApp(page);
	});

	test("leaving through the pause menu does not record the match", async ({
		page,
	}) => {
		await startMatch(page);
		await advance(page, 3);

		await page.keyboard.press("Escape");
		await page.getByTestId("pause-exit").click();

		await expect(page.getByTestId("menu-play")).toBeVisible();
		expect(await page.evaluate(() => window.__PIRATE_BATTLE__?.isReady())).toBe(
			false,
		);
		await expectNothingRecorded(page);
	});

	test("the browser back button abandons the match", async ({ page }) => {
		await startMatch(page);
		await advance(page, 3);

		await page.goBack();

		await expect(page).toHaveURL(/#\/menu$/);
		await expect(page.getByTestId("menu-play")).toBeVisible();
		expect(await page.evaluate(() => window.__PIRATE_BATTLE__?.isReady())).toBe(
			false,
		);
		await expectNothingRecorded(page);
	});

	test("reloading during a match abandons it and returns to the menu", async ({
		page,
	}) => {
		await startMatch(page);
		await advance(page, 3);

		await page.reload();

		await expect(page).toHaveURL(/#\/menu$/);
		await expect(page.getByTestId("menu-play")).toBeVisible();
		await expectNothingRecorded(page);
	});

	test("an abandoned match does not replace the last finished result", async ({
		page,
	}) => {
		await startMatch(page);
		await run(page, 90, 0.5);
		await expect(page).toHaveURL(/#\/result$/);
		const finished = await readStored<{ matchId: string; score: number }>(
			page,
			STORAGE_KEYS.lastResult,
		);
		expect(finished).not.toBeNull();

		await page.getByTestId("result-menu").click();
		await startMatch(page);
		await advance(page, 2);
		await page.keyboard.press("Escape");
		await page.getByTestId("pause-exit").click();

		const after = await readStored<{ matchId: string }>(
			page,
			STORAGE_KEYS.lastResult,
		);
		expect(after?.matchId).toBe(finished?.matchId);
		expect(await readStored<unknown[]>(page, STORAGE_KEYS.outbox)).toHaveLength(
			1,
		);

		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-row")).toHaveCount(1);
	});
});
