import {
	openApp,
	readState,
	readStored,
	STORAGE_KEYS,
	waitForMatch,
} from "../support/app";
import { expect, test } from "../support/fixtures";

test.describe("Options", () => {
	test("opens from the menu with the default values", async ({ page }) => {
		await openApp(page);
		await page.getByTestId("menu-options").click();

		await expect(
			page.getByRole("heading", { name: "Options", level: 1 }),
		).toBeFocused();
		await expect(page.getByTestId("option-sessionTime")).toHaveValue("120");
		await expect(page.getByTestId("option-spawnInterval")).toHaveValue("3");

		await page.getByTestId("options-back").click();
		await expect(page.getByTestId("menu-play")).toBeVisible();
	});

	test("rejects out-of-range values with accessible errors", async ({
		page,
	}) => {
		await openApp(page, { route: "options" });
		const session = page.getByTestId("option-sessionTime");
		const spawn = page.getByTestId("option-spawnInterval");

		await session.fill("200");
		await spawn.fill("0");
		await page.getByTestId("options-save").click();

		const alert = page.getByTestId("options-errors");
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute("role", "alert");
		await expect(alert).toContainText(
			"Game session time must be between 60 and 180 seconds.",
		);
		await expect(alert).toContainText(
			"Enemy spawn time must be between 1 and 10 seconds.",
		);
		await expect(session).toHaveAttribute("aria-invalid", "true");
		await expect(spawn).toHaveAttribute("aria-invalid", "true");
		await expect(session).toBeFocused();
		expect(await readStored(page, STORAGE_KEYS.options)).toBeNull();

		await session.fill("90");
		await expect(session).not.toHaveAttribute("aria-invalid", "true");
	});

	for (const [value, message] of [
		["", "Game session time is required."],
		["abc", "Game session time must be a number."],
		["65", "Game session time must use steps of 10 seconds."],
	] as const) {
		test(`rejects "${value}" as session time`, async ({ page }) => {
			await openApp(page, { route: "options" });
			await page.getByTestId("option-sessionTime").fill(value);
			await page.getByTestId("options-save").click();
			await expect(page.getByTestId("options-errors")).toContainText(message);
		});
	}

	test("saves valid values and keeps them after a refresh", async ({
		page,
	}) => {
		await openApp(page, { route: "options" });
		await page.getByTestId("option-sessionTime").fill("90");
		await page.getByTestId("option-spawnInterval").fill("2,5");
		await page.getByTestId("options-save").click();

		await expect(page.getByTestId("options-status")).toHaveText(
			"Options saved. They apply to your next match.",
		);
		expect(await readStored(page, STORAGE_KEYS.options)).toEqual({
			sessionTime: 90,
			spawnInterval: 2.5,
		});

		await page.reload();
		await expect(page.getByTestId("option-sessionTime")).toHaveValue("90");
		await expect(page.getByTestId("option-spawnInterval")).toHaveValue("2.5");
	});

	test("steps values with the buttons and restores defaults only after saving", async ({
		page,
	}) => {
		await openApp(page, { route: "options" });

		await page
			.getByRole("button", { name: "Increase Enemy spawn time" })
			.click();
		await page
			.getByRole("button", { name: "Decrease Game session time" })
			.click();
		await expect(page.getByTestId("option-spawnInterval")).toHaveValue("3.5");
		await expect(page.getByTestId("option-sessionTime")).toHaveValue("110");

		await page.getByTestId("options-defaults").click();
		await expect(page.getByTestId("option-spawnInterval")).toHaveValue("3");
		await expect(page.getByTestId("option-sessionTime")).toHaveValue("120");
		expect(await readStored(page, STORAGE_KEYS.options)).toBeNull();
	});

	test("each match uses a snapshot of the options saved before it starts", async ({
		page,
	}) => {
		await openApp(page, { route: "options" });
		await page.getByTestId("option-sessionTime").fill("90");
		await page.getByTestId("option-spawnInterval").fill("2.5");
		await page.getByTestId("options-save").click();
		await page.getByTestId("options-back").click();

		await page.getByTestId("menu-play").click();
		await waitForMatch(page);
		const first = await readState(page);
		expect(first.config).toMatchObject({ sessionTime: 90, spawnInterval: 2.5 });
		expect(first.remaining).toBe(90);

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("pause-dialog")).toBeVisible();
		await page.getByTestId("pause-exit").click();

		await page.getByTestId("menu-options").click();
		await page.getByTestId("option-sessionTime").fill("60");
		await page.getByTestId("options-save").click();
		await page.getByTestId("options-back").click();

		await page.getByTestId("menu-play").click();
		await waitForMatch(page);
		const second = await readState(page);
		expect(second.config).toMatchObject({
			sessionTime: 60,
			spawnInterval: 2.5,
		});
	});
});
