import { defineConfig, devices } from "@playwright/test";

const HOST = "127.0.0.1";
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
	testDir: "./tests",
	testMatch: /.*\.spec\.ts$/,
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 1 : 0,
	workers: isCI ? 2 : 4,
	timeout: 90_000,
	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			animations: "disabled",
			caret: "hide",
		},
	},
	snapshotPathTemplate:
		"{testDir}/__screenshots__/{platform}/{projectName}/{testFileName}/{arg}{ext}",
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "playwright-report" }],
	],
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		serviceWorkers: "allow",
	},
	projects: [
		{
			name: "desktop-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1280, height: 720 },
			},
		},
		{
			name: "mobile-chromium",
			use: { ...devices["Pixel 7 landscape"] },
		},
	],
	webServer: {
		command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !isCI,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
