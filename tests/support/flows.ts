import { expect, type Page } from "@playwright/test";
import type { MatchRecord } from "../../src/api/contracts";
import type { ScenarioId } from "../../src/mocks/network";
import type { BridgeState } from "../../src/testing/testBridge";
import { readStored, run, STORAGE_KEYS, startMatch } from "./app";

export async function finishByDeath(page: Page): Promise<BridgeState> {
	await startMatch(page);
	const samples = await run(page, 90, 0.5);
	const ended = samples[samples.length - 1];
	if (ended?.phase !== "ended") throw new Error("The match did not end");
	await expect(page).toHaveURL(/#\/result$/);
	return ended;
}

export async function waitForFreshMatch(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const state = window.__PIRATE_BATTLE__?.state();
		return (
			state !== null &&
			state !== undefined &&
			state.phase === "running" &&
			state.elapsed === 0
		);
	});
}

export async function setScenario(
	page: Page,
	scenario: ScenarioId,
): Promise<void> {
	await page.evaluate(
		(id) => window.__PIRATE_MOCKS__?.setScenario(id),
		scenario,
	);
}

export async function storedRecords(
	page: Page,
	matchId: string,
): Promise<MatchRecord[]> {
	const records =
		(await readStored<MatchRecord[]>(page, STORAGE_KEYS.mockDb)) ?? [];
	return records.filter((record) => record.matchId === matchId);
}

export async function lastMatchId(page: Page): Promise<string> {
	const stored = await readStored<{ matchId: string }>(
		page,
		STORAGE_KEYS.lastResult,
	);
	if (!stored) throw new Error("No stored result");
	return stored.matchId;
}

export function countMatchPuts(page: Page): {
	readonly count: () => number;
	reset: () => void;
} {
	let puts = 0;
	page.on("request", (request) => {
		if (request.method() === "PUT" && /\/api\/matches\//.test(request.url()))
			puts += 1;
	});
	return {
		count: () => puts,
		reset: () => {
			puts = 0;
		},
	};
}
