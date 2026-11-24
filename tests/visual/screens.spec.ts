import type { Page } from "@playwright/test";
import {
	advance,
	holdKeys,
	openApp,
	setOptions,
	startMatch,
	tapKey,
} from "../support/app";
import { expect, test } from "../support/fixtures";
import { finishByDeath } from "../support/flows";

const RENDER_SETTLE_MS = 400;

async function settle(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all(
			Array.from(document.images).map((image) =>
				image.complete ? null : image.decode().catch(() => null),
			),
		);
	});
	await page.waitForLoadState("networkidle");
}

test.describe("Visual regression", () => {
	test("main menu", async ({ page }) => {
		await openApp(page);
		await expect(page.getByTestId("ranking-row")).toHaveCount(10);
		await expect(page.getByTestId("ranking-refresh")).toHaveAttribute(
			"data-state",
			"idle",
		);
		await settle(page);

		await expect(page).toHaveScreenshot("menu.png", { fullPage: true });
	});

	test("arena in a stable state", async ({ page }) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);

		await holdKeys(page, ["KeyD"], 0.4);
		await holdKeys(page, ["KeyW"], 1.5);
		await advance(page, 10);
		await tapKey(page, "Space");
		await advance(page, 0.1);

		await expect(page.getByTestId("hud-time")).toHaveAttribute(
			"data-seconds",
			"108",
		);
		await expect(page.getByTestId("hud-score")).toHaveText("0");
		await settle(page);
		await page.waitForTimeout(RENDER_SETTLE_MS);

		await expect(page).toHaveScreenshot("arena.png");
	});

	test("result screen", async ({ page }) => {
		await setOptions(page, { sessionTime: 60, spawnInterval: 1 });
		await openApp(page);
		await finishByDeath(page);
		await expect(page.getByTestId("result-registration")).toHaveAttribute(
			"data-status",
			"confirmed",
			{
				timeout: 20_000,
			},
		);
		await settle(page);

		await expect(page).toHaveScreenshot("result.png", { fullPage: true });
	});
});
