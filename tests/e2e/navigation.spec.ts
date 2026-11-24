import type { Page } from "@playwright/test";
import { holdKeys, openApp, setOptions, startMatch } from "../support/app";
import { expect, test } from "../support/fixtures";

async function tabTo(
	page: Page,
	testId: string,
	maxPresses = 25,
): Promise<void> {
	for (let press = 0; press < maxPresses; press += 1) {
		const focused = await page.evaluate(
			() => document.activeElement?.getAttribute("data-testid") ?? null,
		);
		if (focused === testId) return;
		await page.keyboard.press("Tab");
	}
	throw new Error(`Could not reach ${testId} with Tab`);
}

test.describe("Navigation", () => {
	test("entering and leaving combat repeatedly leaves nothing behind", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);

		for (let round = 0; round < 5; round += 1) {
			await startMatch(page);
			await expect(page.locator("canvas")).toHaveCount(1);
			await holdKeys(page, ["KeyW"], 0.5);

			await page.keyboard.press("Escape");
			await page.getByTestId("pause-exit").click();

			await expect(page.getByTestId("menu-play")).toBeVisible();
			await expect(page.locator("canvas")).toHaveCount(0);
			expect(
				await page.evaluate(() => window.__PIRATE_BATTLE__?.isReady()),
			).toBe(false);
		}

		await page.getByTestId("menu-options").focus();
		await page.keyboard.press("Space");
		await expect(page).toHaveURL(/#\/options$/);
	});

	test("menus can be used with the keyboard only", async ({ page }) => {
		await openApp(page);

		await tabTo(page, "menu-options");
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/#\/options$/);
		await expect(
			page.getByRole("heading", { level: 1, name: "Options" }),
		).toBeFocused();

		await tabTo(page, "options-back");
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/#\/menu$/);

		await tabTo(page, "tab-ranking");
		await page.keyboard.press("ArrowRight");
		await expect(page.getByTestId("tab-history")).toBeFocused();
		await expect(page.getByTestId("tab-history")).toHaveAttribute(
			"aria-selected",
			"true",
		);

		await tabTo(page, "menu-play");
		await page.keyboard.press("Enter");
		await page.waitForFunction(
			() => window.__PIRATE_BATTLE__?.isReady() === true,
		);
	});
});
