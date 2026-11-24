import { defineConfig } from "@playwright/test";

const HOST = "127.0.0.1";
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
	testDir: "./tests/perf",
	testMatch: /.*\.perf\.ts$/,
	timeout: 15 * 60_000,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: BASE_URL,
		viewport: { width: 1280, height: 720 },
		headless:
			(
				globalThis as typeof globalThis & {
					process?: { env?: Record<string, string | undefined> };
				}
			).process?.env?.PERF_HEADLESS === "1",
		locale: "en-US",
		timezoneId: "UTC",
		serviceWorkers: "allow",
	},
	webServer: {
		command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: true,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
