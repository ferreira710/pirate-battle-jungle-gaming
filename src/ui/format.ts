import type { EndReason } from "../game/sim/state";

export function formatClock(totalSeconds: number): string {
	const safe = Math.max(0, Math.floor(totalSeconds));
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatEndReason(reason: EndReason): string {
	return reason === "time" ? "Time ran out" : "Ship destroyed";
}

export function formatDate(iso: string): string {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(iso));
}
