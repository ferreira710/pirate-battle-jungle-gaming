import { useSyncExternalStore } from "react";
import { DEFAULT_OPTIONS, type PlayerOptions } from "../game/config/gameConfig";
import { sanitizeOptions } from "../game/config/playerOptions";
import {
	readStored,
	removeStored,
	STORAGE_PREFIX,
	type StorageCodec,
	writeStored,
} from "./localStore";

const OPTIONS_CODEC: StorageCodec<PlayerOptions> = {
	key: `${STORAGE_PREFIX}options`,
	version: 1,
	parse: sanitizeOptions,
};

const listeners = new Set<() => void>();
let current: PlayerOptions = Object.freeze(
	readStored(OPTIONS_CODEC) ?? { ...DEFAULT_OPTIONS },
);

function notify(): void {
	for (const listener of listeners) listener();
}

export function getOptions(): PlayerOptions {
	return current;
}

export function saveOptions(options: PlayerOptions): boolean {
	const saved = writeStored(OPTIONS_CODEC, options);
	current = Object.freeze({ ...options });
	notify();
	return saved;
}

export function resetOptions(): void {
	removeStored(OPTIONS_CODEC);
	current = Object.freeze({ ...DEFAULT_OPTIONS });
	notify();
}

export function subscribeOptions(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useOptions(): PlayerOptions {
	return useSyncExternalStore(subscribeOptions, getOptions, getOptions);
}

window.addEventListener("storage", (event) => {
	if (event.key !== OPTIONS_CODEC.key) return;
	current = Object.freeze(readStored(OPTIONS_CODEC) ?? { ...DEFAULT_OPTIONS });
	notify();
});
