import {
	advance,
	openApp,
	readState,
	setOptions,
	startMatch,
} from "../support/app";
import { angleDiff, playerProjectiles } from "../support/combat";
import { expect, test } from "../support/fixtures";
import { touchHold } from "../support/touch";

test.describe("Touch controls", () => {
	test("are hidden on desktop", async ({ page, isMobile }) => {
		test.skip(isMobile, "Desktop only");
		await openApp(page);
		await startMatch(page);
		await expect(page.getByTestId("touch-controls")).toBeHidden();
	});

	test.describe("on touch devices", () => {
		test.skip(({ isMobile }) => !isMobile, "Touch devices only");

		test.beforeEach(async ({ page }) => {
			await setOptions(page, { sessionTime: 120, spawnInterval: 10 });
			await openApp(page);
			await startMatch(page);
		});

		test("show labelled buttons for every action", async ({ page }) => {
			await expect(page.getByTestId("touch-controls")).toBeVisible();
			for (const name of [
				"Sail forward",
				"Turn left",
				"Turn right",
				"Fire bow cannon",
				"Fire left broadside",
				"Fire right broadside",
			]) {
				await expect(page.getByRole("button", { name })).toBeVisible();
			}
		});

		test("holding forward sails the ship and releasing stops it", async ({
			page,
		}) => {
			const before = await readState(page);
			await touchHold(page, ["touch-forward"], 1);
			const moved = await readState(page);
			expect(
				Math.hypot(
					moved.player.x - before.player.x,
					moved.player.y - before.player.y,
				),
			).toBeGreaterThan(50);

			await advance(page, 0.5);
			const stopped = await readState(page);
			expect(stopped.player.x).toBe(moved.player.x);
			expect(stopped.player.y).toBe(moved.player.y);
		});

		test("turn buttons rotate the ship to both sides", async ({ page }) => {
			const before = await readState(page);

			await touchHold(page, ["touch-turnRight"], 0.5);
			const right = await readState(page);
			expect(
				angleDiff(right.player.rotation, before.player.rotation),
			).toBeGreaterThan(0.5);

			await touchHold(page, ["touch-turnLeft"], 1);
			const left = await readState(page);
			expect(
				angleDiff(left.player.rotation, before.player.rotation),
			).toBeLessThan(-0.5);
		});

		test("cannon buttons fire the bow cannon and the broadsides", async ({
			page,
		}) => {
			await touchHold(page, ["touch-fireFront"], 1 / 60);
			let state = await readState(page);
			expect(playerProjectiles(state)).toHaveLength(state.config.front.count);

			await touchHold(page, ["touch-fireLeft"], 1 / 60);
			state = await readState(page);
			expect(playerProjectiles(state)).toHaveLength(
				state.config.front.count + state.config.side.count,
			);

			await touchHold(page, ["touch-fireRight"], 1 / 60);
			state = await readState(page);
			expect(playerProjectiles(state)).toHaveLength(
				state.config.front.count + state.config.side.count * 2,
			);
		});

		test("moving and firing work at the same time", async ({ page }) => {
			const before = await readState(page);
			await touchHold(page, ["touch-forward", "touch-fireFront"], 1);
			const after = await readState(page);

			expect(
				Math.hypot(
					after.player.x - before.player.x,
					after.player.y - before.player.y,
				),
			).toBeGreaterThan(50);
			expect(playerProjectiles(after).length).toBeGreaterThanOrEqual(2);
		});
	});
});
