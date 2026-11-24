import type { EndReason, MatchRecord, MatchSettings } from "../api/contracts";
import { createRng } from "../game/sim/rng";

const FIXTURE_SEED = 20261124;
const BASE_DATE = Date.UTC(2026, 10, 1, 18, 0, 0);
const HOUR_MS = 3_600_000;

const CAPTAINS: readonly string[] = [
	"Captain Saltbeard",
	"Red Meg",
	"Barnacle Bess",
	"Old Tom Gale",
	"Iron Isa",
	"Captain Driftwood",
	"Silver Nell",
	"One-Eyed Rook",
	"Admiral Kestrel",
	"Stormy Ada",
	"Captain Marlowe",
	"Tidewater Jo",
];

const FIXTURE_GROUPS: readonly { settings: MatchSettings; count: number }[] = [
	{
		settings: { sessionTime: 120, spawnInterval: 3, mapId: "archipelago-v1" },
		count: 34,
	},
	{
		settings: { sessionTime: 60, spawnInterval: 3, mapId: "archipelago-v1" },
		count: 8,
	},
	{
		settings: { sessionTime: 180, spawnInterval: 2, mapId: "archipelago-v1" },
		count: 6,
	},
];

export function createFixtureRecords(): MatchRecord[] {
	const rng = createRng(FIXTURE_SEED);
	const records: MatchRecord[] = [];
	let sequence = 0;

	for (const group of FIXTURE_GROUPS) {
		for (let index = 0; index < group.count; index += 1) {
			sequence += 1;
			const captainIndex = Math.floor(rng.next() * CAPTAINS.length);
			const endReason: EndReason = rng.next() < 0.7 ? "time" : "death";
			const duration =
				endReason === "time"
					? group.settings.sessionTime
					: Math.round(rng.range(20, group.settings.sessionTime - 1) * 1000) /
						1000;
			const scoreCeiling = Math.round(
				(duration / group.settings.spawnInterval) * 0.9,
			);
			const score = Math.floor(rng.next() * Math.max(1, scoreCeiling));
			const playedAt = new Date(
				BASE_DATE - sequence * 7 * HOUR_MS,
			).toISOString();

			records.push({
				matchId: `fixture-match-${String(sequence).padStart(3, "0")}`,
				playerId: `fixture-player-${captainIndex + 1}`,
				playerName: CAPTAINS[captainIndex] ?? "Captain Unknown",
				playedAt,
				score,
				duration,
				endReason,
				settings: group.settings,
				recordedAt: playedAt,
			});
		}
	}

	return records;
}
