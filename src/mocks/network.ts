import { delay, HttpResponse } from "msw";
import { createRng, type Rng } from "../game/sim/rng";
import {
	type Failure,
	getMockSettings,
	getScenarioDefinition,
	type Latency,
	type MockRoute,
	type RouteRule,
	subscribeMockSettings,
} from "./scenarios";

export type { MockRoute } from "./scenarios";

export interface RequestTicket {
	readonly route: MockRoute;
	readonly count: number;
	readonly response: Response | null;
}

const ALTERNATE_SLOW = 1800;
const ALTERNATE_FAST = 200;

const counters = new Map<MockRoute, number>();
let rng: Rng = createRng(getMockSettings().seed);

subscribeMockSettings(() => {
	counters.clear();
	rng = createRng(getMockSettings().seed);
});

function ruleFor(route: MockRoute): RouteRule {
	return getScenarioDefinition().routes[route];
}

function latencyFor(latency: Latency | undefined, count: number): number {
	let value = 0;
	if (typeof latency === "number") value = latency;
	else if (latency === "alternate")
		value = count % 2 === 1 ? ALTERNATE_SLOW : ALTERNATE_FAST;
	else if (latency) value = rng.range(latency[0], latency[1]);
	return Math.round(value * getMockSettings().latencyScale);
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
