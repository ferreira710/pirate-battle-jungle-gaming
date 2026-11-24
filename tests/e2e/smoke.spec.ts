import { holdKeys, openApp, readState, startMatch } from "../support/app";
import { expect, test } from "../support/fixtures";

test("opens the menu, starts a match and moves the ship", async ({ page }) => {
	await openApp(page);

	await expect(page.getByTestId("menu-play")).toBeVisible();
	await expect(page.getByTestId("ranking-table")).toBeVisible();

	await startMatch(page);
	const before = await readState(page);
	expect(before.phase).toBe("running");

	await holdKeys(page, ["KeyW"], 1);
	const after = await readState(page);

	expect(after.elapsed).toBeCloseTo(1, 5);
	expect(
		Math.hypot(
			after.player.x - before.player.x,
			after.player.y - before.player.y,
		),
	).toBeGreaterThan(100);
	await expect(page.getByTestId("hud-time")).toHaveAttribute(
		"data-seconds",
		String(after.config.sessionTime - 1),
	);
});
