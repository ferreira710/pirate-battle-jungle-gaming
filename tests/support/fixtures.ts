import { test as base, expect } from "@playwright/test";

const ALLOWED_CONSOLE_ERRORS: readonly RegExp[] = [
	/Failed to load resource/i,
	/net::ERR_/i,
];

interface Fixtures {
	consoleErrors: string[];
	allowConsoleErrors: readonly RegExp[];
}

export const test = base.extend<Fixtures>({
	allowConsoleErrors: [[], { option: true }],
	consoleErrors: [
		async ({ page, allowConsoleErrors }, use) => {
			const errors: string[] = [];
			const allowed = [...ALLOWED_CONSOLE_ERRORS, ...allowConsoleErrors];

			page.on("console", (message) => {
				if (message.type() !== "error") return;
				const text = message.text();
				if (!allowed.some((pattern) => pattern.test(text))) errors.push(text);
			});
			page.on("pageerror", (error) => {
				errors.push(`Uncaught: ${error.message}`);
			});

			await use(errors);
			expect(errors, "Unexpected console errors").toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
