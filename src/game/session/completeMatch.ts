import { type LastResult, saveLastResult } from "../../storage/lastResultStore";
import { getPlayerIdentity } from "../../storage/playerIdentity";
import { enqueueRegistration } from "../../storage/registrationOutbox";
import { createId } from "../../utils/createId";
import type { MatchOutcome } from "./gameSession";

export function completeMatch(outcome: MatchOutcome): LastResult {
	const identity = getPlayerIdentity();
	const result: LastResult = Object.freeze({
		...outcome,
		matchId: createId(),
		playerId: identity.id,
	});
	saveLastResult(result);
	enqueueRegistration(result, identity.name);
	return result;
}
