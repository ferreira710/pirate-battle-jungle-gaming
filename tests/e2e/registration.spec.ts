import { openApp, readStored, STORAGE_KEYS, setOptions } from "../support/app";
import { expect, test } from "../support/fixtures";
import {
	countMatchPuts,
	finishByDeath,
	lastMatchId,
	setScenario,
	storedRecords,
	waitForFreshMatch,
} from "../support/flows";

const SLOW = { timeout: 20_000 };

test.describe("Match registration", () => {
	test.beforeEach(async ({ page }) => {
		await setOptions(page, { sessionTime: 60, spawnInterval: 1 });
	});

	test("a finished match appears once in the ranking and in the history", async ({
		page,
	}) => {
		await openApp(page);
		const ended = await finishByDeath(page);

		const registration = page.getByTestId("result-registration");
		await expect(registration).toHaveAttribute(
			"data-status",
			"confirmed",
			SLOW,
		);
		const matchId = await lastMatchId(page);

		await page.getByTestId("result-menu").click();
		await expect(page.getByTestId("ranking-settings")).toHaveText(
			"60 s matches · enemy every 1 s",
		);
		const rankingRow = page.getByTestId("ranking-row");
		await expect(rankingRow).toHaveCount(1);
		await expect(rankingRow).toHaveAttribute("data-current", "true");
		await expect(rankingRow).toContainText("You");
		await expect(rankingRow.locator("td:nth-of-type(2)")).toHaveText(
			String(ended.score),
		);

		await page.getByTestId("tab-history").click();
		const historyRow = page.getByTestId("history-row");
		await expect(historyRow).toHaveCount(1);
		await expect(historyRow).toHaveAttribute("data-match-id", matchId);

		expect(await storedRecords(page, matchId)).toHaveLength(1);
	});

	test("a failed registration is kept, survives a refresh and is sent after recovery", async ({
		page,
	}) => {
		await openApp(page, { scenario: "register-unavailable" });
		await finishByDeath(page);
		const matchId = await lastMatchId(page);

		const registration = page.getByTestId("result-registration");
		await expect(registration).toHaveAttribute("data-status", "failed", SLOW);
		await expect(registration).toContainText("Could not save your match yet.");
		await expect(page.getByTestId("result-retry")).toBeVisible();

		await page.reload();
		await expect(registration).toHaveAttribute("data-status", "failed", SLOW);
		const outbox = await readStored<{ matchId: string; status: string }[]>(
			page,
			STORAGE_KEYS.outbox,
		);
		expect(outbox).toHaveLength(1);
		expect(outbox?.[0]?.matchId).toBe(matchId);

		await page.getByTestId("result-play-again").click();
		await waitForFreshMatch(page);
		await page.keyboard.press("Escape");
		await page.getByTestId("pause-exit").click();

		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-pending")).toContainText(
			"1 match is waiting to be saved.",
		);
		await expect(page.getByTestId("history-empty")).toBeVisible();

		await setScenario(page, "success");
		await page.getByTestId("history-pending-retry").click();

		await expect(page.getByTestId("history-pending")).toHaveCount(0, SLOW);
		await expect(page.getByTestId("history-row")).toHaveCount(1);
		await page.getByTestId("tab-ranking").click();
		await expect(page.getByTestId("ranking-row")).toHaveCount(1);
		expect(await storedRecords(page, matchId)).toHaveLength(1);
	});

	test("a timeout after the server saved the match does not duplicate it", async ({
		page,
	}) => {
		const puts = countMatchPuts(page);
		await openApp(page, { scenario: "register-timeout-after-commit" });
		await finishByDeath(page);
		const matchId = await lastMatchId(page);

		await expect(page.getByTestId("result-registration")).toHaveAttribute(
			"data-status",
			"confirmed",
			SLOW,
		);
		expect(puts.count()).toBeGreaterThanOrEqual(2);
		expect(await storedRecords(page, matchId)).toHaveLength(1);

		await page.getByTestId("result-menu").click();
		await expect(page.getByTestId("ranking-row")).toHaveCount(1);
		await page.getByTestId("tab-history").click();
		await expect(page.getByTestId("history-row")).toHaveCount(1);
	});

	test("several retry triggers at once send the pending match only once", async ({
		page,
	}) => {
		const puts = countMatchPuts(page);
		await openApp(page, { scenario: "register-unavailable" });
		await finishByDeath(page);
		const matchId = await lastMatchId(page);
		await expect(page.getByTestId("result-registration")).toHaveAttribute(
			"data-status",
			"failed",
			SLOW,
		);

		await setScenario(page, "success");
		puts.reset();
		await page.evaluate(() => {
			document
				.querySelector<HTMLButtonElement>('[data-testid="result-retry"]')
				?.click();
			window.dispatchEvent(new Event("online"));
			window.dispatchEvent(new Event("online"));
			document.dispatchEvent(new Event("visibilitychange"));
		});

		await expect(page.getByTestId("result-registration")).toHaveAttribute(
			"data-status",
			"confirmed",
			SLOW,
		);
		await page.waitForTimeout(1000);
		expect(puts.count()).toBe(1);
		expect(await storedRecords(page, matchId)).toHaveLength(1);
	});
});
