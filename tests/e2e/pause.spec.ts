import {
	advance,
	holdKeys,
	openApp,
	readState,
	setOptions,
	startMatch,
	tapKey,
} from "../support/app";
import { playerProjectiles } from "../support/combat";
import { expect, test } from "../support/fixtures";

test.describe("Pause (manual clock)", () => {
	test.beforeEach(async ({ page }) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page);
		await startMatch(page);
	});

	test("Escape pauses, freezes time and cooldowns, and resumes only by player action", async ({
		page,
	}) => {
		await advance(page, 2);
		await tapKey(page, "Space");
		const before = await readState(page);
		expect(before.player.cooldowns.front).toBeGreaterThan(0);

		await page.keyboard.press("Escape");
		const dialog = page.getByTestId("pause-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("The battle is on hold.");
		await expect(page.getByTestId("pause-resume")).toBeFocused();
		await expect(page.getByTestId("hud-pause")).toBeDisabled();
		await expect(page.getByTestId("hud-announcer")).toHaveText("Game paused.");

		expect(await advance(page, 5)).toBe(0);
		const during = await readState(page);
		expect(during.phase).toBe("paused");
		expect(during.elapsed).toBe(before.elapsed);
		expect(during.player.cooldowns).toEqual(before.player.cooldowns);
		expect(during.projectiles).toEqual(before.projectiles);

		await page.getByTestId("pause-resume").click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("hud-announcer")).toHaveText("Game resumed.");
		const resumed = await readState(page);
		expect(resumed.phase).toBe("running");
		expect(resumed.elapsed).toBe(before.elapsed);

		await advance(page, 1);
		expect((await readState(page)).elapsed).toBeCloseTo(before.elapsed + 1, 5);
	});

	test("keys held across a pause do not move or fire after resuming", async ({
		page,
	}) => {
		await page.keyboard.down("KeyW");
		await page.keyboard.down("Space");
		await advance(page, 0.5);

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-dialog")).toBeVisible();
		await page.getByTestId("pause-resume").click();
		await expect(page.getByTestId("pause-dialog")).toBeHidden();

		const resumed = await readState(page);
		const knownShots = new Set(
			playerProjectiles(resumed).map((shot) => shot.id),
		);
		await advance(page, 1);
		const after = await readState(page);

		expect(after.player.x).toBe(resumed.player.x);
		expect(after.player.y).toBe(resumed.player.y);
		expect(
			playerProjectiles(after).filter((shot) => !knownShots.has(shot.id)),
		).toHaveLength(0);

		await page.keyboard.up("Space");
		await page.keyboard.up("KeyW");
		await holdKeys(page, ["KeyW"], 0.5);
		expect((await readState(page)).player.y).toBeLessThan(after.player.y);
	});

	test("the HUD button and the P key pause, and Escape in the dialog resumes", async ({
		page,
	}) => {
		const dialog = page.getByTestId("pause-dialog");

		await page.getByTestId("hud-pause").click();
		await expect(dialog).toBeVisible();
		expect((await readState(page)).phase).toBe("paused");

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		expect((await readState(page)).phase).toBe("running");

		await page.keyboard.press("KeyP");
		await expect(dialog).toBeVisible();
		expect((await readState(page)).phase).toBe("paused");
	});

	test("losing window focus pauses until the player resumes", async ({
		page,
	}) => {
		const dialog = page.getByTestId("pause-dialog");
		const before = await readState(page);

		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(
			"Paused because the game window lost focus.",
		);

		await page.evaluate(() => window.dispatchEvent(new Event("focus")));
		expect(await advance(page, 1)).toBe(0);
		const still = await readState(page);
		expect(still.phase).toBe("paused");
		expect(still.elapsed).toBe(before.elapsed);

		await page.getByTestId("pause-resume").click();
		expect((await readState(page)).phase).toBe("running");
	});

	test("hiding the tab pauses until the player resumes", async ({ page }) => {
		const dialog = page.getByTestId("pause-dialog");

		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: () => "hidden",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("Paused because the tab was hidden.");

		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: () => "visible",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect((await readState(page)).phase).toBe("paused");

		await page.getByTestId("pause-resume").click();
		expect((await readState(page)).phase).toBe("running");
	});
});

test.describe("Pause (real-time clock)", () => {
	test("the timer does not advance while paused and does not catch up on resume", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
		await openApp(page, { clock: "realtime" });
		await startMatch(page);

		await page.waitForTimeout(800);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-dialog")).toBeVisible();

		const paused = await readState(page);
		expect(paused.elapsed).toBeGreaterThan(0);

		await page.waitForTimeout(2000);
		const still = await readState(page);
		expect(still.elapsed).toBe(paused.elapsed);
		await expect(page.getByTestId("hud-time")).toHaveAttribute(
			"data-seconds",
			String(Math.ceil(paused.remaining - 1e-9)),
		);

		await page.getByTestId("pause-resume").click();
		await page.waitForTimeout(1000);
		const resumed = await readState(page);
		const gained = resumed.elapsed - paused.elapsed;

		expect(gained).toBeGreaterThan(0.2);
		expect(gained).toBeLessThan(1.8);
	});
});
