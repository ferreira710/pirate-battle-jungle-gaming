import type { Page } from "@playwright/test";
import type { BridgeState } from "../../src/testing/testBridge";

export type AppRoute = "menu" | "options" | "play" | "result";

export interface AppParams {
	route?: AppRoute;
	seed?: number;
	clock?: "manual" | "realtime";
	scenario?: string;
	latencyScale?: number;
	apiTimeout?: number;
	mockSeed?: number;
}

export const STORAGE_KEYS = {
	options: "pirate-battle:options",
	lastResult: "pirate-battle:last-result",
	outbox: "pirate-battle:registration-outbox",
	player: "pirate-battle:player",
	mockDb: "pirate-battle:mock-db",
	mockSettings: "pirate-battle:mock-settings",
} as const;

export function appUrl(params: AppParams = {}): string {
	const search = new URLSearchParams({ e2e: "1" });
	search.set("seed", String(params.seed ?? 42));
	search.set("clock", params.clock ?? "manual");
	search.set("latencyScale", String(params.latencyScale ?? 0));
	search.set("apiTimeout", String(params.apiTimeout ?? 1500));
	if (params.scenario) search.set("scenario", params.scenario);
	if (params.mockSeed !== undefined)
		search.set("mockSeed", String(params.mockSeed));
	return `/?${search.toString()}#/${params.route ?? "menu"}`;
}

export async function openApp(
	page: Page,
	params: AppParams = {},
): Promise<void> {
	await page.goto(appUrl(params));
	await page.waitForFunction(() => document.querySelector(".app") !== null);
}

export async function seedStorage(
	page: Page,
	entries: Record<string, unknown>,
): Promise<void> {
	await page.addInitScript((values: Record<string, unknown>) => {
		for (const [key, data] of Object.entries(values)) {
			if (window.localStorage.getItem(key) === null) {
				window.localStorage.setItem(key, JSON.stringify({ version: 1, data }));
			}
		}
	}, entries);
}

export async function setOptions(
	page: Page,
	options: { sessionTime: number; spawnInterval: number },
): Promise<void> {
	await seedStorage(page, { [STORAGE_KEYS.options]: options });
}

export async function readStored<T = unknown>(
	page: Page,
	key: string,
): Promise<T | null> {
	return page.evaluate((storageKey) => {
		const raw = window.localStorage.getItem(storageKey);
		if (raw === null) return null;
		const parsed = JSON.parse(raw) as { data?: unknown };
		return (parsed.data ?? null) as never;
	}, key);
}

export async function waitForMatch(page: Page): Promise<void> {
	await page.waitForFunction(
		() => window.__PIRATE_BATTLE__?.isReady() === true,
	);
}

export async function startMatch(page: Page): Promise<void> {
	await page.getByTestId("menu-play").click();
	await waitForMatch(page);
}

export async function advance(page: Page, seconds: number): Promise<number> {
	return page.evaluate(
		(value) => window.__PIRATE_BATTLE__?.advance(value) ?? 0,
		seconds,
	);
}

export async function readState(page: Page): Promise<BridgeState> {
	const state = await page.evaluate(
		() => window.__PIRATE_BATTLE__?.state() ?? null,
	);
	if (!state) throw new Error("No active match");
	return state;
}

export async function step(page: Page, seconds: number): Promise<BridgeState> {
	const state = await page.evaluate(
		(value) => window.__PIRATE_BATTLE__?.step(value) ?? null,
		seconds,
	);
	if (!state) throw new Error("No active match");
	return state;
}

export async function run(
	page: Page,
	seconds: number,
	chunk: number,
): Promise<BridgeState[]> {
	return page.evaluate(
		([total, size]) => window.__PIRATE_BATTLE__?.run(total, size) ?? [],
		[seconds, chunk] as const,
	);
}

export async function holdKeys(
	page: Page,
	keys: readonly string[],
	seconds: number,
): Promise<void> {
	for (const key of keys) await page.keyboard.down(key);
	await advance(page, seconds);
	for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

export async function tapKey(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await advance(page, 1 / 60);
	await page.keyboard.up(key);
}
