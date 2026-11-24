import type { Page } from "@playwright/test";
import { advance } from "./app";

async function centerOf(
	page: Page,
	testId: string,
): Promise<{ x: number; y: number }> {
	const box = await page.getByTestId(testId).boundingBox();
	if (!box) throw new Error(`Element ${testId} is not visible`);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function touchHold(
	page: Page,
	testIds: readonly string[],
	seconds: number,
): Promise<void> {
	const points = [];
	for (const [index, testId] of testIds.entries()) {
		const center = await centerOf(page, testId);
		points.push({ ...center, id: index + 1 });
	}

	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: points,
		});
		await advance(page, seconds);
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
	} finally {
		await cdp.detach();
	}
}
