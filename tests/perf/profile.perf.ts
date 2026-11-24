import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type CDPSession, expect, type Page, test } from "@playwright/test";
import type { TestBridge } from "../../src/testing/testBridge";
import { openApp, setOptions } from "../support/app";

interface PerfSample {
	t: number;
	enemies: number;
	projectiles: number;
}

interface PerfProbe {
	frames: number[];
	samples: PerfSample[];
	running: boolean;
	last: number;
	end: { reason: string | null; elapsed: number; score: number } | null;
	autopilot: number | null;
	release: (() => void) | null;
}

declare global {
	interface Window {
		__PERF__?: PerfProbe;
	}
}

interface MemorySample {
	label: string;
	heapMb: number;
	listeners: number;
	nodes: number;
	canvases: number;
}

const MATCH = { sessionTime: 180, spawnInterval: 3, seed: 7 };
const WARMUP_FRAMES = 30;
const FRAME_BUDGET_MS = 1000 / 60;
const CYCLES = 5;
const CYCLE_PLAY_MS = 10_000;
const LEAK_THRESHOLD_MB = 2;
const REPORT_DIR = path.resolve("reports/performance");

type Bridge = TestBridge;

async function installProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		const probe: PerfProbe = {
			frames: [],
			samples: [],
			running: true,
			last: performance.now(),
			end: null,
			autopilot: null,
			release: null,
		};
		const loop = (now: number) => {
			probe.frames.push(now - probe.last);
			probe.last = now;
			if (probe.running) requestAnimationFrame(loop);
		};
		requestAnimationFrame((now) => {
			probe.last = now;
			requestAnimationFrame(loop);
		});
		window.__PERF__ = probe;
	});
}

async function startAutopilot(page: Page): Promise<void> {
	await page.evaluate(() => {
		const probe = window.__PERF__;
		if (!probe) return;
		const held = new Set<string>();

		const send = (code: string, down: boolean) =>
			window.dispatchEvent(
				new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
			);

		const apply = (codes: readonly string[]) => {
			for (const code of [...held]) {
				if (!codes.includes(code)) {
					send(code, false);
					held.delete(code);
				}
			}
			for (const code of codes) {
				if (!held.has(code)) {
					send(code, true);
					held.add(code);
				}
			}
		};

		probe.release = () => apply([]);

		const tick = () => {
			const bridge: Bridge | undefined = window.__PIRATE_BATTLE__;
			const state = bridge?.state();
			if (!state) return;

			if (state.phase === "paused") {
				document
					.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')
					?.click();
				return;
			}

			if (state.phase === "ended") {
				probe.end = {
					reason: state.endReason,
					elapsed: state.elapsed,
					score: state.score,
				};
				probe.running = false;
				apply([]);
				if (probe.autopilot !== null) window.clearInterval(probe.autopilot);
				probe.autopilot = null;
				return;
			}

			probe.samples.push({
				t: state.elapsed,
				enemies: state.enemies.length,
				projectiles: state.projectiles.length,
			});

			const { player } = state;
			let target: (typeof state.enemies)[number] | null = null;
			let best = Infinity;
			for (const enemy of state.enemies) {
				const gap = Math.hypot(enemy.x - player.x, enemy.y - player.y);
				if (gap < best) {
					best = gap;
					target = enemy;
				}
			}

			if (!target) {
				apply([]);
				return;
			}

			let diff =
				(Math.atan2(target.y - player.y, target.x - player.x) -
					player.rotation) %
				(Math.PI * 2);
			if (diff > Math.PI) diff -= Math.PI * 2;
			if (diff < -Math.PI) diff += Math.PI * 2;

			const codes = ["Space"];
			if (diff > 0.06) codes.push("KeyD");
			else if (diff < -0.06) codes.push("KeyA");
			if (target.kind === "shooter" && best > 300) codes.push("KeyW");
			apply(codes);
		};

		probe.autopilot = window.setInterval(tick, 50);
	});
}

async function stopAutopilot(page: Page): Promise<void> {
	await page.evaluate(() => {
		const probe = window.__PERF__;
		if (!probe) return;
		if (probe.autopilot !== null) window.clearInterval(probe.autopilot);
		probe.autopilot = null;
		probe.release?.();
		probe.running = false;
	});
}

async function readMemory(
	page: Page,
	cdp: CDPSession,
	label: string,
): Promise<MemorySample> {
	await cdp.send("HeapProfiler.collectGarbage");
	await cdp.send("HeapProfiler.collectGarbage");
	const { metrics } = await cdp.send("Performance.getMetrics");
	const get = (name: string) =>
		metrics.find((metric) => metric.name === name)?.value ?? 0;
	const canvases = await page.evaluate(
		() => document.querySelectorAll("canvas").length,
	);

	return {
		label,
		heapMb: get("JSHeapUsedSize") / 1_048_576,
		listeners: get("JSEventListeners"),
		nodes: get("Nodes"),
		canvases,
	};
}

function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
	);
	return sorted[index] ?? 0;
}

function mean(values: readonly number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

async function describeEnvironment(page: Page, headless: boolean) {
	const cpus = os.cpus();
	const gpu = await page.evaluate(() => {
		const gl = document.createElement("canvas").getContext("webgl");
		const ext = gl?.getExtension("WEBGL_debug_renderer_info");
		return gl && ext
			? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
			: "unknown";
	});
	const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);

	return {
		cpu: cpus[0]?.model ?? "unknown",
		cores: cpus.length,
		memoryGb: round(os.totalmem() / 1_073_741_824, 1),
		os: `${os.type()} ${os.release()} (${os.arch()})`,
		browser: `Chromium ${page.context().browser()?.version() ?? "unknown"}`,
		headless,
		gpu,
		viewport: page.viewportSize(),
		devicePixelRatio,
	};
}

function buildMarkdown(
	report: Record<string, unknown> & {
		environment: Awaited<ReturnType<typeof describeEnvironment>>;
		frames: Record<string, number>;
		entities: Record<string, number>;
		match: Record<string, unknown>;
		memory: MemorySample[];
		memoryVerdict: string;
	},
): string {
	const env = report.environment;
	const lines = [
		"# Performance profile",
		"",
		`Generated at ${String(report.generatedAt)}.`,
		"",
		"## Environment",
		"",
		"| Item | Value |",
		"| --- | --- |",
		`| CPU | ${env.cpu} (${env.cores} threads) |`,
		`| Memory | ${env.memoryGb} GB |`,
		`| OS | ${env.os} |`,
		`| Browser | ${env.browser}${env.headless ? " (headless)" : ""} |`,
		`| GPU renderer | ${env.gpu} |`,
		`| Viewport | ${env.viewport?.width ?? "?"}×${env.viewport?.height ?? "?"} @ ${env.devicePixelRatio}x |`,
		"",
		"## Match",
		"",
		"| Item | Value |",
		"| --- | --- |",
		...Object.entries(report.match).map(
			([key, value]) => `| ${key} | ${String(value)} |`,
		),
		"",
		"## Frame timing",
		"",
		"| Metric | Value |",
		"| --- | --- |",
		...Object.entries(report.frames).map(
			([key, value]) => `| ${key} | ${value} |`,
		),
		"",
		"## Entities",
		"",
		"| Metric | Value |",
		"| --- | --- |",
		...Object.entries(report.entities).map(
			([key, value]) => `| ${key} | ${value} |`,
		),
		"",
		"## Memory after start, play and exit cycles",
		"",
		"| Sample | JS heap (MB) | Event listeners | DOM nodes | Canvases |",
		"| --- | --- | --- | --- | --- |",
		...report.memory.map(
			(sample) =>
				`| ${sample.label} | ${round(sample.heapMb)} | ${sample.listeners} | ${sample.nodes} | ${sample.canvases} |`,
		),
		"",
		`**Verdict:** ${report.memoryVerdict}`,
		"",
		"## Notes",
		"",
		"- Built with `vite build` and served by `vite preview`.",
		"- The player is driven by an in-page autopilot that dispatches keyboard events every 50 ms and reads the simulation state; this adds a small, constant overhead.",
		"- Frame times come from `requestAnimationFrame`, so the frame rate is capped by the display refresh rate.",
		"- Headless runs use software WebGL and are not representative of real devices.",
		"",
	];
	return lines.join("\n");
}

test("profiles a three-minute match and five play cycles", async ({
	page,
	headless,
}) => {
	await setOptions(page, {
		sessionTime: MATCH.sessionTime,
		spawnInterval: MATCH.spawnInterval,
	});
	await openApp(page, { clock: "realtime", seed: MATCH.seed });
	const environment = await describeEnvironment(page, headless);

	await page.getByTestId("menu-play").click();
	await page.waitForFunction(
		() => window.__PIRATE_BATTLE__?.isReady() === true,
		null,
		{ timeout: 60_000 },
	);
	await installProbe(page);
	await startAutopilot(page);

	await page.waitForFunction(() => window.__PERF__?.running === false, null, {
		timeout: (MATCH.sessionTime + 30) * 1000,
		polling: 500,
	});

	const run = await page.evaluate(() => ({
		frames: window.__PERF__?.frames ?? [],
		samples: window.__PERF__?.samples ?? [],
		end: window.__PERF__?.end ?? null,
	}));

	const frameTimes = run.frames
		.slice(WARMUP_FRAMES)
		.filter((value) => value > 0);
	const enemyCounts = run.samples.map((sample) => sample.enemies);
	const projectileCounts = run.samples.map((sample) => sample.projectiles);
	const entityCounts = run.samples.map(
		(sample) => sample.enemies + sample.projectiles + 1,
	);

	const frames = {
		"frames measured": frameTimes.length,
		"average FPS": round(1000 / mean(frameTimes), 1),
		"mean frame time (ms)": round(mean(frameTimes)),
		"p95 frame time (ms)": round(percentile(frameTimes, 95)),
		"p99 frame time (ms)": round(percentile(frameTimes, 99)),
		"worst frame (ms)": round(Math.max(0, ...frameTimes)),
		"frames over 16.7 ms (%)": round(
			(frameTimes.filter((value) => value > FRAME_BUDGET_MS + 0.5).length /
				Math.max(1, frameTimes.length)) *
				100,
		),
	};

	const entities = {
		"average entities": round(mean(entityCounts), 1),
		"peak entities": Math.max(0, ...entityCounts),
		"peak enemies": Math.max(0, ...enemyCounts),
		"peak projectiles": Math.max(0, ...projectileCounts),
	};

	const match = {
		"session time (s)": MATCH.sessionTime,
		"enemy spawn time (s)": MATCH.spawnInterval,
		seed: MATCH.seed,
		"ended by": run.end?.reason ?? "unknown",
		"time played (s)": round(run.end?.elapsed ?? 0, 1),
		score: run.end?.score ?? 0,
	};

	await page.getByTestId("result-menu").click({ timeout: 15_000 });
	await expect(page.getByTestId("menu-play")).toBeVisible();

	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");
	const memory: MemorySample[] = [
		await readMemory(page, cdp, "menu (before cycles)"),
	];

	for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
		await page.getByTestId("menu-play").click();
		await page.waitForFunction(
			() => window.__PIRATE_BATTLE__?.isReady() === true,
			null,
			{ timeout: 60_000 },
		);
		await installProbe(page);
		await startAutopilot(page);
		await page.waitForTimeout(CYCLE_PLAY_MS);
		await stopAutopilot(page);

		if (await page.getByTestId("result-menu").isVisible()) {
			await page.getByTestId("result-menu").click();
		} else {
			await page.keyboard.press("Escape");
			await page.getByTestId("pause-exit").click();
		}
		await expect(page.getByTestId("menu-play")).toBeVisible();
		memory.push(await readMemory(page, cdp, `after cycle ${cycle}`));
	}

	const steady = memory.slice(2);
	const steadyGrowth =
		(steady[steady.length - 1]?.heapMb ?? 0) - (steady[0]?.heapMb ?? 0);
	const monotonic = steady.every(
		(sample, index) =>
			index === 0 || sample.heapMb > (steady[index - 1]?.heapMb ?? 0),
	);
	const listenersStable = memory
		.slice(1)
		.every((sample) => sample.listeners <= (memory[1]?.listeners ?? 0) + 5);
	const memoryVerdict =
		monotonic && steadyGrowth > LEAK_THRESHOLD_MB
			? `Heap grew ${round(steadyGrowth)} MB between cycles 2 and ${CYCLES}; investigate a possible leak.`
			: `No continuous growth: heap changed ${round(steadyGrowth)} MB between cycles 2 and ${CYCLES}` +
				`${listenersStable ? " and event listeners stayed stable" : ", but event listeners increased"}.`;

	const report = {
		generatedAt: new Date().toISOString(),
		environment,
		match,
		frames,
		entities,
		memory,
		memoryVerdict,
	};

	mkdirSync(REPORT_DIR, { recursive: true });
	const stamp = report.generatedAt.replace(/[:.]/g, "-");
	writeFileSync(
		path.join(REPORT_DIR, `profile-${stamp}.json`),
		JSON.stringify(report, null, 2),
	);
	writeFileSync(
		path.join(REPORT_DIR, `profile-${stamp}.md`),
		buildMarkdown(report),
	);
	writeFileSync(path.join(REPORT_DIR, "latest.md"), buildMarkdown(report));

	test.info().annotations.push(
		{ type: "average FPS", description: String(frames["average FPS"]) },
		{
			type: "p95 frame time",
			description: `${frames["p95 frame time (ms)"]} ms`,
		},
		{ type: "memory", description: memoryVerdict },
	);

	expect(frameTimes.length).toBeGreaterThan(0);
	expect(memory.every((sample) => sample.canvases === 0)).toBe(true);
});
