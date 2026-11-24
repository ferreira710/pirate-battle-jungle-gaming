import type { Page } from "@playwright/test";
import { openApp, readState, waitForMatch } from "../support/app";
import { expect, test } from "../support/fixtures";

const PLAYER_SHIP_TEXTURE =
	/\/assets\/png\/(default|retina)\/ships\/ship_5\.png/;
const ALL_GAME_TEXTURES = /\/assets\/png\//;

async function isMatchReady(page: Page): Promise<boolean> {
	return page.evaluate(() => window.__PIRATE_BATTLE__?.isReady() ?? false);
}

test.describe("Asset loading", () => {
	test("shows progress before the battle starts", async ({ page, context }) => {
		let delayed = 0;
		await context.route(ALL_GAME_TEXTURES, async (route) => {
			delayed += 1;
			await new Promise((resolve) => setTimeout(resolve, 150));
			await route.continue();
		});

		await openApp(page);
		await page.getByTestId("menu-play").click();

		await expect(
			page.getByRole("heading", { name: "Preparing the fleet" }),
		).toBeVisible();
		await expect(page.getByTestId("loading-progress")).toBeVisible();
		expect(await isMatchReady(page)).toBe(false);

		await waitForMatch(page);
		expect(delayed).toBeGreaterThan(0);
		await expect(page.getByTestId("game-canvas")).toBeVisible();
		await expect(page.getByTestId("loading")).toHaveCount(0);
	});

	test("reports a failed texture and starts after a retry", async ({
		page,
		context,
	}) => {
		await context.route(PLAYER_SHIP_TEXTURE, (route) => route.abort());

		await openApp(page);
		await page.getByTestId("menu-play").click();

		const error = page.getByTestId("loading-error");
		await expect(error).toBeVisible();
		await expect(error).toHaveAttribute("role", "alert");
		await expect(error).toContainText("Could not load 1 game asset(s).");
		expect(await isMatchReady(page)).toBe(false);
		await expect(page.getByTestId("game-canvas")).toHaveCount(0);

		await context.unroute(PLAYER_SHIP_TEXTURE);
		await page.getByTestId("loading-retry").click();

		await waitForMatch(page);
		const state = await readState(page);
		expect(state.phase).toBe("running");
		expect(state.elapsed).toBe(0);
	});

	test("lets the player return to the menu when loading fails", async ({
		page,
		context,
	}) => {
		await context.route(ALL_GAME_TEXTURES, (route) => route.abort());

		await openApp(page);
		await page.getByTestId("menu-play").click();
		await expect(page.getByTestId("loading-error")).toBeVisible();

		await page.getByTestId("loading-back").click();
		await expect(page.getByTestId("menu-play")).toBeVisible();
		await expect(page).toHaveURL(/#\/menu$/);
	});
});
