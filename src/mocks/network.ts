import { delay, HttpResponse } from "msw";
import { createRng, type Rng } from "../game/sim/rng";
import {
	isRecord,
	readStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "../storage/localStore";
import { isTestMode } from "../testing/testBridge";
import { resetDb } from "./db";

export type MockRoute = "ranking" | "history" | "register";

export const SCENARIO_IDS = [
	"success",
	"empty",
	"slow",
	"variable-latency",
	"out-of-order",
	"timeout",
	"offline",
	"client-error",
	"server-error",
	"ranking-failure",
	"history-failure",
	"register-timeout-after-commit",
	"register-unavailable",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

type Failure =
	| { readonly kind: "timeout" }
	| { readonly kind: "network" }
	| {
			readonly kind: "status";
			readonly status: number;
			readonly code: string;
			readonly message: string;
	  };

type Latency = number | readonly [number, number] | "alternate";

interface RouteRule {
	readonly latency?: Latency;
	readonly before?: Failure;
	readonly after?: Failure;
	readonly failFirst?: number;
	readonly empty?: boolean;
}

export interface ScenarioDefinition {
	readonly id: ScenarioId;
	readonly label: string;
	readonly description: string;
	readonly routes: Readonly<Record<MockRoute, RouteRule>>;
}

export interface MockSettings {
	readonly scenario: ScenarioId;
	readonly seed: number;
	readonly latencyScale: number;
}

export interface RequestTicket {
	readonly route: MockRoute;
	readonly count: number;
	readonly response: Response | null;
}

const BASE_LATENCY = 250;
const SLOW_LATENCY = 2500;
const VARIABLE_LATENCY: readonly [number, number] = [100, 2000];
const ALTERNATE_SLOW = 1800;
const ALTERNATE_FAST = 200;

const TIMEOUT: Failure = { kind: "timeout" };
const NETWORK: Failure = { kind: "network" };

function status(code: number, name: string, message: string): Failure {
	return { kind: "status", status: code, code: name, message };
}

function allRoutes(rule: RouteRule): Record<MockRoute, RouteRule> {
	return { ranking: rule, history: rule, register: rule };
}

const NORMAL: RouteRule = { latency: BASE_LATENCY };

export const SCENARIOS: readonly ScenarioDefinition[] = [
	{
		id: "success",
		label: "Success",
		description: "Normal responses with a short delay.",
		routes: allRoutes(NORMAL),
	},
	{
		id: "empty",
		label: "Empty lists",
		description: "Ranking and history return no entries.",
		routes: {
			ranking: { ...NORMAL, empty: true },
			history: { ...NORMAL, empty: true },
			register: NORMAL,
		},
	},
	{
		id: "slow",
		label: "Slow network",
		description: `Every response takes ${SLOW_LATENCY / 1000} seconds.`,
		routes: allRoutes({ latency: SLOW_LATENCY }),
	},
	{
		id: "variable-latency",
		label: "Variable latency",
		description: "Each response takes between 0.1 and 2 seconds (seeded).",
		routes: allRoutes({ latency: VARIABLE_LATENCY }),
	},
	{
		id: "out-of-order",
		label: "Out-of-order responses",
		description:
			"Odd requests are slow and even requests are fast, so older responses arrive last.",
		routes: {
			ranking: { latency: "alternate" },
			history: { latency: "alternate" },
			register: NORMAL,
		},
	},
	{
		id: "timeout",
		label: "Timeout",
		description: "No request ever receives a response.",
		routes: allRoutes({ before: TIMEOUT }),
	},
	{
		id: "offline",
		label: "Connection failure",
		description: "Every request fails at the network level.",
		routes: allRoutes({ before: NETWORK }),
	},
	{
		id: "client-error",
		label: "HTTP 400",
		description: "Every request is rejected with a client error.",
		routes: allRoutes({
			...NORMAL,
			before: status(400, "BAD_REQUEST", "The request was rejected."),
		}),
	},
	{
		id: "server-error",
		label: "HTTP 503",
		description: "Every request fails with a server error.",
		routes: allRoutes({
			...NORMAL,
			before: status(
				503,
				"SERVICE_UNAVAILABLE",
				"The service is temporarily unavailable.",
			),
		}),
	},
	{
		id: "ranking-failure",
		label: "Ranking failure",
		description: "Only the ranking request fails.",
		routes: {
			ranking: {
				...NORMAL,
				before: status(
					500,
					"INTERNAL_ERROR",
					"The ranking could not be loaded.",
				),
			},
			history: NORMAL,
			register: NORMAL,
		},
	},
	{
		id: "history-failure",
		label: "History failure",
		description: "Only the match history request fails.",
		routes: {
			ranking: NORMAL,
			history: {
				...NORMAL,
				before: status(
					500,
					"INTERNAL_ERROR",
					"The match history could not be loaded.",
				),
			},
			register: NORMAL,
		},
	},
	{
		id: "register-timeout-after-commit",
		label: "Timeout after saving",
		description:
			"The first match registration is stored, but its response never arrives.",
		routes: {
			ranking: NORMAL,
			history: NORMAL,
			register: { ...NORMAL, after: TIMEOUT, failFirst: 1 },
		},
	},
	{
		id: "register-unavailable",
		label: "Registration unavailable",
		description: "Saving matches fails until another scenario is selected.",
		routes: {
			ranking: NORMAL,
			history: NORMAL,
			register: {
				...NORMAL,
				before: status(
					503,
					"SERVICE_UNAVAILABLE",
					"Match registration is unavailable.",
				),
			},
		},
	},
];

const DEFAULT_SETTINGS: MockSettings = Object.freeze({
	scenario: "success",
	seed: 1,
	latencyScale: 1,
});

function isScenarioId(value: unknown): value is ScenarioId {
	return (
		typeof value === "string" &&
		(SCENARIO_IDS as readonly string[]).includes(value)
	);
}

const SETTINGS_CODEC: StorageCodec<MockSettings> = {
	key: `${STORAGE_PREFIX}mock-settings`,
	version: 1,
	parse(data) {
		if (!isRecord(data)) return null;
		const { scenario, seed, latencyScale } = data;
		if (!isScenarioId(scenario)) return null;
		if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0)
			return null;
		if (
			typeof latencyScale !== "number" ||
			!Number.isFinite(latencyScale) ||
			latencyScale < 0
		)
			return null;
		return { scenario, seed, latencyScale };
	},
};

function loadSettings(): MockSettings {
	const stored = readStored(SETTINGS_CODEC) ?? DEFAULT_SETTINGS;
	const params = new URLSearchParams(window.location.search);
	const scenarioParam = params.get("scenario");
	const seedParam = Number(params.get("mockSeed"));
	const scaleParam = Number(params.get("latencyScale"));

	const next: MockSettings = {
		scenario: isScenarioId(scenarioParam) ? scenarioParam : stored.scenario,
		seed:
			params.has("mockSeed") && Number.isInteger(seedParam) && seedParam >= 0
				? seedParam
				: stored.seed,
		latencyScale:
			params.has("latencyScale") &&
			Number.isFinite(scaleParam) &&
			scaleParam >= 0
				? scaleParam
				: stored.latencyScale,
	};

	writeStored(SETTINGS_CODEC, next);
	return Object.freeze(next);
}

const listeners = new Set<() => void>();
const counters = new Map<MockRoute, number>();
let settings: MockSettings = loadSettings();
let rng: Rng = createRng(settings.seed);

function apply(next: MockSettings): void {
	settings = Object.freeze({ ...next });
	writeStored(SETTINGS_CODEC, settings);
	counters.clear();
	rng = createRng(settings.seed);
	for (const listener of listeners) listener();
}

export function getMockSettings(): MockSettings {
	return settings;
}

export function getScenarioDefinition(
	id: ScenarioId = settings.scenario,
): ScenarioDefinition {
	return (
		SCENARIOS.find((scenario) => scenario.id === id) ??
		(SCENARIOS[0] as ScenarioDefinition)
	);
}

export function setScenario(scenario: ScenarioId): void {
	apply({ ...settings, scenario });
}

export function setLatencyScale(latencyScale: number): void {
	apply({ ...settings, latencyScale: Math.max(0, latencyScale) });
}

export function setMockSeed(seed: number): void {
	apply({ ...settings, seed: Math.max(0, Math.floor(seed)) });
}

export function resetMocks(): void {
	resetDb();
	apply(DEFAULT_SETTINGS);
}

export function subscribeMockSettings(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function ruleFor(route: MockRoute): RouteRule {
	return getScenarioDefinition().routes[route];
}

function latencyFor(latency: Latency | undefined, count: number): number {
	let value = 0;
	if (typeof latency === "number") value = latency;
	else if (latency === "alternate")
		value = count % 2 === 1 ? ALTERNATE_SLOW : ALTERNATE_FAST;
	else if (latency) value = rng.range(latency[0], latency[1]);
	return Math.round(value * settings.latencyScale);
}

function applies(rule: RouteRule, count: number): boolean {
	return rule.failFirst === undefined || count <= rule.failFirst;
}

async function respondWith(failure: Failure): Promise<Response> {
	if (failure.kind === "timeout") {
		await delay("infinite");
		return HttpResponse.error();
	}
	if (failure.kind === "network") return HttpResponse.error();
	return HttpResponse.json(
		{ error: { code: failure.code, message: failure.message } },
		{ status: failure.status },
	);
}

export async function beforeHandling(route: MockRoute): Promise<RequestTicket> {
	const count = (counters.get(route) ?? 0) + 1;
	counters.set(route, count);

	const rule = ruleFor(route);
	const wait = latencyFor(rule.latency, count);
	if (wait > 0) await delay(wait);

	const response =
		rule.before && applies(rule, count) ? await respondWith(rule.before) : null;
	return { route, count, response };
}

export async function afterHandling(
	ticket: RequestTicket,
): Promise<Response | null> {
	const rule = ruleFor(ticket.route);
	if (rule.after && applies(rule, ticket.count)) return respondWith(rule.after);
	return null;
}

export function shouldReturnEmpty(route: MockRoute): boolean {
	return ruleFor(route).empty === true;
}

declare global {
	interface Window {
		__PIRATE_MOCKS__?: {
			setScenario: typeof setScenario;
			setLatencyScale: typeof setLatencyScale;
			setMockSeed: typeof setMockSeed;
			resetMocks: typeof resetMocks;
			getMockSettings: typeof getMockSettings;
		};
	}
}

if (isTestMode()) {
	window.__PIRATE_MOCKS__ = {
		setScenario,
		setLatencyScale,
		setMockSeed,
		resetMocks,
		getMockSettings,
	};
}
