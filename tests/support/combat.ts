import type { Page } from "@playwright/test";
import type { BridgeShip, BridgeState } from "../../src/testing/testBridge";
import { holdKeys, readState, run, step } from "./app";

export const STEP = 1 / 60;
const AIM_TOLERANCE = 0.03;
const MAX_TURN_STEPS = 3;
const ALIGNED_STEPS = 6;

export function angleDiff(a: number, b: number): number {
	let delta = (a - b) % (Math.PI * 2);
	if (delta > Math.PI) delta -= Math.PI * 2;
	if (delta < -Math.PI) delta += Math.PI * 2;
	return delta;
}

export function distance(
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function overlapsIsland(
	state: BridgeState,
	ship: Pick<BridgeShip, "x" | "y" | "radius">,
): boolean {
	return state.colliders.some((rect) => {
		const closestX = Math.min(Math.max(ship.x, rect.x), rect.x + rect.width);
		const closestY = Math.min(Math.max(ship.y, rect.y), rect.y + rect.height);
		return Math.hypot(ship.x - closestX, ship.y - closestY) < ship.radius - 0.5;
	});
}

export function playerProjectiles(state: BridgeState) {
	return state.projectiles.filter(
		(projectile) => projectile.owner === "player",
	);
}

export function enemyProjectiles(state: BridgeState) {
	return state.projectiles.filter((projectile) => projectile.owner === "enemy");
}

export async function turnTo(page: Page, target: number): Promise<void> {
	const start = await readState(page);
	const key = angleDiff(target, start.player.rotation) > 0 ? "KeyD" : "KeyA";

	await holdKeys(page, [key], STEP);
	const probe = await readState(page);
	const perStep = Math.abs(
		angleDiff(probe.player.rotation, start.player.rotation),
	);
	const steps = Math.round(
		Math.abs(angleDiff(target, probe.player.rotation)) / perStep,
	);

	if (steps > 0) await holdKeys(page, [key], steps * STEP);
}

export async function sample(
	page: Page,
	seconds: number,
	chunk: number,
	onSample: (state: BridgeState) => boolean | void,
): Promise<BridgeState> {
	const samples = await run(page, seconds, chunk);
	let last = samples[samples.length - 1] ?? (await readState(page));

	for (const state of samples) {
		last = state;
		if (onSample(state) === true) break;
	}

	return last;
}

interface Pilot {
	readonly turnPerStep: number;
	setKeys(next: Set<string>): Promise<void>;
	release(): Promise<void>;
}

async function createPilot(
	page: Page,
): Promise<{ pilot: Pilot; state: BridgeState }> {
	let held = new Set<string>();

	async function setKeys(next: Set<string>) {
		for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
		for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
		held = next;
	}

	const start = await readState(page);
	await setKeys(new Set(["KeyD"]));
	const state = await step(page, STEP);
	await setKeys(new Set());
	const turnPerStep = Math.max(
		1e-6,
		Math.abs(angleDiff(state.player.rotation, start.player.rotation)),
	);

	return {
		pilot: { turnPerStep, setKeys, release: () => setKeys(new Set()) },
		state,
	};
}

function planAttack(
	state: BridgeState,
	turnPerStep: number,
): { keys: Set<string>; steps: number } | null {
	const target = [...state.enemies].sort(
		(a, b) => distance(a, state.player) - distance(b, state.player),
	)[0];
	if (!target) return null;

	const desired = Math.atan2(
		target.y - state.player.y,
		target.x - state.player.x,
	);
	const diff = angleDiff(desired, state.player.rotation);
	const keys = new Set<string>(["Space"]);

	if (Math.abs(diff) <= AIM_TOLERANCE) return { keys, steps: ALIGNED_STEPS };

	keys.add(diff > 0 ? "KeyD" : "KeyA");
	const steps = Math.min(
		MAX_TURN_STEPS,
		Math.max(1, Math.round(Math.abs(diff) / turnPerStep)),
	);
	return { keys, steps };
}

export async function fightNearest(
	page: Page,
	seconds: number,
	onSample: (state: BridgeState) => boolean | void,
): Promise<BridgeState> {
	const { pilot, state: initial } = await createPilot(page);
	let state = initial;

	try {
		let elapsed = 0;
		while (elapsed < seconds) {
			const plan = planAttack(state, pilot.turnPerStep) ?? {
				keys: new Set<string>(),
				steps: MAX_TURN_STEPS,
			};
			await pilot.setKeys(plan.keys);
			state = await step(page, plan.steps * STEP);
			elapsed += plan.steps * STEP;
			if (onSample(state) === true || state.phase !== "running") break;
		}
		return state;
	} finally {
		await pilot.release();
	}
}

export async function defendUntil(
	page: Page,
	targetElapsed: number,
): Promise<BridgeState> {
	const { pilot, state: initial } = await createPilot(page);
	let state = initial;

	try {
		while (state.phase === "running") {
			const remainingSteps = Math.round((targetElapsed - state.elapsed) / STEP);
			if (remainingSteps <= 0) break;

			const plan = planAttack(state, pilot.turnPerStep);
			if (!plan) {
				await pilot.setKeys(new Set());
				const nextSpawn = (state.spawnCount + 1) * state.config.spawnInterval;
				const idleSteps = Math.max(
					1,
					Math.round((nextSpawn - state.elapsed) / STEP),
				);
				state = await step(page, Math.min(idleSteps, remainingSteps) * STEP);
				continue;
			}

			await pilot.setKeys(plan.keys);
			state = await step(page, Math.min(plan.steps, remainingSteps) * STEP);
		}
		return state;
	} finally {
		await pilot.release();
	}
}
