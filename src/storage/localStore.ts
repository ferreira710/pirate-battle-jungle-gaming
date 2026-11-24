export interface StorageCodec<T> {
	readonly key: string;
	readonly version: number;
	parse(data: unknown): T | null;
}

export const STORAGE_PREFIX = "pirate-battle:";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStored<T>(codec: StorageCodec<T>): T | null {
	try {
		const raw = window.localStorage.getItem(codec.key);
		if (raw === null) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || parsed.version !== codec.version) return null;
		return codec.parse(parsed.data);
	} catch {
		return null;
	}
}

export function writeStored<T>(codec: StorageCodec<T>, value: T): boolean {
	try {
		window.localStorage.setItem(
			codec.key,
			JSON.stringify({ version: codec.version, data: value }),
		);
		return true;
	} catch {
		return false;
	}
}

export function removeStored<T>(codec: StorageCodec<T>): void {
	try {
		window.localStorage.removeItem(codec.key);
	} catch {
		return;
	}
}
