import type { Page } from "@playwright/test";
import { openApp, setOptions, startMatch, waitForMatch } from "../support/app";
import { expect, test } from "../support/fixtures";
import { setScenario } from "../support/flows";

const SLOW = { timeout: 20_000 };
const LONG_API_TIMEOUT = 8000;

async function readRanks(page: Page): Promise<number[]> {
	const cells = await page
		.getByTestId("ranking-row")
		.locator("td.data-table__rank")
		.allTextContents();
	return cells.map(Number);
}

async function readScores(page: Page): Promise<number[]> {
	const cells = await page
		.getByTestId("ranking-row")
		.locator("td:nth-of-type(2)")
		.allTextContents();
	return cells.map(Number);
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

test.describe("Ranking", () => {
	test("lists the matches of the current settings with pagination", async ({
		page,
	}) => {
		await openApp(page);

		await expect(page.getByTestId("ranking-table")).toBeVisible();
		await expect(page.getByTestId("ranking-settings")).toHaveText(
			"120 s matches · enemy every 3 s",
		);
		await expect(page.getByTestId("ranking-row")).toHaveCount(10);
		expect(await readRanks(page)).toEqual(range(1, 10));

		const scores = await readScores(page);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));

		const pagination = page.getByTestId("ranking-pagination");
		await expect(pagination).toContainText("of 4");
		await expect(page.getByTestId("ranking-pagination-page")).toHaveText("1");
		await expect(page.getByTestId("ranking-pagination-prev")).toBeDisabled();

		await page.getByTestId("ranking-pagination-next").click();
		await expect(page.getByTestId("ranking-pagination-page")).toHaveText("2");
		await expect.poll(() => readRanks(page)).toEqual(range(11, 20));

		await page.getByTestId("ranking-pagination-next").click();
		await page.getByTestId("ranking-pagination-next").click();
		await expect(page.getByTestId("ranking-pagination-page")).toHaveText("4");
		await expect(page.getByTestId("ranking-row")).toHaveCount(4);
		await expect(page.getByTestId("ranking-pagination-next")).toBeDisabled();

		await page.getByTestId("ranking-pagination-prev").click();
		await expect(page.getByTestId("ranking-pagination-page")).toHaveText("3");
	});

	test("compares only matches played with the same settings", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 60, spawnInterval: 3 });
		await openApp(page);

		await expect(page.getByTestId("ranking-settings")).toHaveText(
			"60 s matches · enemy every 3 s",
		);
		await expect(page.getByTestId("ranking-row")).toHaveCount(8);
		await expect(page.getByTestId("ranking-pagination")).toHaveCount(0);
	});

	test("shows an empty state when no match uses the settings", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 90, spawnInterval: 5 });
		await openApp(page);
		await expect(page.getByTestId("ranking-empty")).toBeVisible();
	});

	test("shows empty lists in the empty scenario", async ({ page }) => {
		await openApp(page, { scenario: "empty" });
		await expect(page.getByTestId("ranking-empty")).toBeVisible();
		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-empty")).toBeVisible();
	});

	test("shows a loading state while the ranking is requested", async ({
		page,
	}) => {
		await openApp(page, {
			scenario: "slow",
			latencyScale: 1,
			apiTimeout: LONG_API_TIMEOUT,
		});
		await expect(page.getByTestId("ranking-loading")).toBeVisible();
		await expect(page.getByTestId("ranking-table")).toBeVisible(SLOW);
		await expect(page.getByTestId("ranking-loading")).toHaveCount(0);
	});

	test("shows an error with retry when the ranking fails", async ({ page }) => {
		await openApp(page, { scenario: "ranking-failure" });

		const error = page.getByTestId("ranking-error");
		await expect(error).toBeVisible(SLOW);
		await expect(error).toHaveAttribute("role", "alert");
		await expect(error).toContainText("The ranking could not be loaded.");

		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-empty")).toBeVisible();
		await page.getByTestId("tab-ranking").click();
		await expect(error).toBeVisible(SLOW);

		await setScenario(page, "success");
		await page.getByTestId("ranking-error-retry").click();
		await expect(page.getByTestId("ranking-table")).toBeVisible(SLOW);
	});

	test("keeps cached rows visible while refreshing in the background", async ({
		page,
	}) => {
		await openApp(page, {
			scenario: "slow",
			latencyScale: 1,
			apiTimeout: LONG_API_TIMEOUT,
		});
		await expect(page.getByTestId("ranking-table")).toBeVisible(SLOW);

		await page.getByTestId("tab-history").click();
		await page.getByTestId("tab-ranking").click();

		await expect(page.getByTestId("ranking-table")).toBeVisible();
		await expect(page.getByTestId("ranking-refresh")).toHaveAttribute(
			"data-state",
			"fetching",
		);
		await expect(page.getByTestId("ranking-refresh")).toHaveAttribute(
			"data-state",
			"idle",
			SLOW,
		);
		await expect(page.getByTestId("ranking-table")).toBeVisible();
	});

	test("keeps showing saved rows when a background refresh fails", async ({
		page,
	}) => {
		await openApp(page);
		await expect(page.getByTestId("ranking-table")).toBeVisible();

		await setScenario(page, "ranking-failure");
		await page.getByTestId("tab-history").click();
		await page.getByTestId("tab-ranking").click();

		await expect(page.getByTestId("ranking-refresh")).toHaveAttribute(
			"data-state",
			"stale",
			SLOW,
		);
		await expect(page.getByTestId("ranking-refresh")).toContainText(
			"Could not refresh.",
		);
		await expect(page.getByTestId("ranking-row")).toHaveCount(10);
	});

	test("a late response does not replace the page the player is viewing", async ({
		page,
	}) => {
		await openApp(page, {
			scenario: "out-of-order",
			latencyScale: 1,
			apiTimeout: LONG_API_TIMEOUT,
		});
		await expect(page.getByTestId("ranking-table")).toBeVisible(SLOW);

		await page.getByTestId("ranking-pagination-next").click();
		await expect.poll(() => readRanks(page), SLOW).toEqual(range(11, 20));

		await page.getByTestId("ranking-pagination-next").click();
		await expect(page.getByTestId("ranking-table")).toHaveAttribute(
			"aria-busy",
			"true",
		);
		await page.getByTestId("ranking-pagination-prev").click();

		await expect.poll(() => readRanks(page)).toEqual(range(1, 10));
		await page.waitForTimeout(2500);

		await expect(page.getByTestId("ranking-pagination-page")).toHaveText("1");
		expect(await readRanks(page)).toEqual(range(1, 10));
		await expect(page.getByTestId("ranking-table")).not.toHaveAttribute(
			"aria-busy",
			"true",
		);
	});
});

test.describe("Match history", () => {
	test("starts empty for a new player", async ({ page }) => {
		await openApp(page);
		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-empty")).toContainText(
			"No battles yet",
		);
	});

	test("shows an error with retry while the ranking keeps working", async ({
		page,
	}) => {
		await openApp(page, { scenario: "history-failure" });
		await expect(page.getByTestId("ranking-table")).toBeVisible();

		await page.getByTestId("tab-history").click();
		const error = page.getByTestId("history-error");
		await expect(error).toBeVisible(SLOW);
		await expect(error).toContainText("The match history could not be loaded.");

		await setScenario(page, "success");
		await page.getByTestId("history-error-retry").click();
		await expect(page.getByTestId("history-empty")).toBeVisible(SLOW);
	});
});

test.describe("Network failures", () => {
	for (const [scenario, message] of [
		["timeout", "The server took too long to respond."],
		["offline", "Could not reach the server."],
		["client-error", "The request was rejected."],
		["server-error", "The service is temporarily unavailable."],
	] as const) {
		test(`shows "${message}" for the ${scenario} scenario`, async ({
			page,
		}) => {
			await openApp(page, { scenario });
			await expect(page.getByTestId("ranking-error")).toContainText(
				message,
				SLOW,
			);
		});
	}

	test("the game and the options keep working while the API is down", async ({
		page,
	}) => {
		await openApp(page, { scenario: "offline" });

		await page.getByTestId("menu-options").click();
		await page.getByTestId("option-sessionTime").fill("90");
		await page.getByTestId("options-save").click();
		await expect(page.getByTestId("options-status")).toHaveText(
			"Options saved. They apply to your next match.",
		);
		await page.getByTestId("options-back").click();

		await page.getByTestId("menu-play").click();
		await waitForMatch(page);
		await expect(page.getByTestId("hud-time")).toHaveAttribute(
			"data-seconds",
			"90",
		);
	});
});

test.describe("Network lab", () => {
	test("selects scenarios, keeps them after a refresh and restores the initial state", async ({
		page,
	}) => {
		await openApp(page);
		await expect(page.getByTestId("ranking-table")).toBeVisible();

		await page.getByTestId("menu-network").click();
		const lab = page.getByTestId("network-lab");
		await expect(lab).toBeVisible();
		await page.getByTestId("lab-scenario").selectOption("empty");
		await expect(page.getByTestId("lab-status")).toHaveText(
			"Scenario set to Empty lists.",
		);
		await page.getByTestId("lab-close").click();
		await expect(lab).toBeHidden();
		await expect(page.getByTestId("menu-network")).toBeFocused();
		await expect(page.getByTestId("ranking-empty")).toBeVisible();

		await page.goto("/?e2e=1&latencyScale=0#/menu");
		await expect(page.getByTestId("ranking-empty")).toBeVisible();

		await page.getByTestId("menu-network").click();
		await page.getByTestId("lab-reset").click();
		await expect(page.getByTestId("lab-status")).toHaveText(
			"Mock server restored to its initial state.",
		);
		await expect(page.getByTestId("lab-scenario")).toHaveValue("success");
		await page.getByTestId("lab-close").click();
		await expect(page.getByTestId("ranking-table")).toBeVisible();
	});

	test("reset removes matches registered during the session", async ({
		page,
	}) => {
		await setOptions(page, { sessionTime: 60, spawnInterval: 1 });
		await openApp(page);
		await startMatch(page);
		await page.evaluate(() => window.__PIRATE_BATTLE__?.run(90, 0.5));
		await expect(page.getByTestId("result-registration")).toHaveAttribute(
			"data-status",
			"confirmed",
			SLOW,
		);
		await page.getByTestId("result-menu").click();

		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-row")).toHaveCount(1);

		await page.getByTestId("menu-network").click();
		await page.getByTestId("lab-reset").click();
		await page.getByTestId("lab-close").click();
		await expect(page.getByTestId("history-empty")).toBeVisible(SLOW);
	});
});
