import { createId } from "../utils/createId";
import {
	isRecord,
	readStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "./localStore";

export interface PlayerIdentity {
	readonly id: string;
	readonly name: string;
}

const IDENTITY_CODEC: StorageCodec<PlayerIdentity> = {
	key: `${STORAGE_PREFIX}player`,
	version: 1,
	parse(data) {
		if (!isRecord(data)) return null;
		const { id, name } = data;
		if (
			typeof id !== "string" ||
			id === "" ||
			typeof name !== "string" ||
			name === ""
		)
			return null;
		return { id, name };
	},
};

let cached: PlayerIdentity | null = null;

function createIdentity(): PlayerIdentity {
	const id = createId();
	return { id, name: `Captain ${id.slice(0, 4).toUpperCase()}` };
}

export function getPlayerIdentity(): PlayerIdentity {
	if (cached) return cached;
	const stored = readStored(IDENTITY_CODEC);
	const identity = Object.freeze(stored ?? createIdentity());
	if (!stored) writeStored(IDENTITY_CODEC, identity);
	cached = identity;
	return identity;
}
