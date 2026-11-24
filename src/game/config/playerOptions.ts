import { isRecord } from "../../storage/localStore";
import {
	type NumericLimit,
	OPTION_LIMITS,
	type PlayerOptions,
} from "./gameConfig";

export type OptionField = keyof PlayerOptions;
export type OptionsDraft = Record<OptionField, string>;
export type OptionErrors = Partial<Record<OptionField, string>>;

export type OptionsValidation =
	| { readonly ok: true; readonly value: PlayerOptions }
	| { readonly ok: false; readonly errors: OptionErrors };

export const OPTION_FIELDS: readonly OptionField[] = [
	"sessionTime",
	"spawnInterval",
];

export const OPTION_META: Readonly<
	Record<OptionField, { readonly label: string; readonly unit: string }>
> = {
	sessionTime: { label: "Game session time", unit: "seconds" },
	spawnInterval: { label: "Enemy spawn time", unit: "seconds" },
};

const STEP_TOLERANCE = 1e-6;

function isOnStep(value: number, limit: NumericLimit): boolean {
	const steps = (value - limit.min) / limit.step;
	return Math.abs(steps - Math.round(steps)) < STEP_TOLERANCE;
}

export function checkOptionValue(
	field: OptionField,
	value: number,
): string | null {
	const limit = OPTION_LIMITS[field];
	const { label, unit } = OPTION_META[field];

	if (!Number.isFinite(value)) return `${label} must be a number.`;
	if (value < limit.min || value > limit.max) {
		return `${label} must be between ${limit.min} and ${limit.max} ${unit}.`;
	}
	if (!isOnStep(value, limit))
		return `${label} must use steps of ${limit.step} ${unit}.`;
	return null;
}

function parseField(
	field: OptionField,
	raw: string,
): { value: number } | { error: string } {
	const trimmed = raw.trim().replace(",", ".");
	if (trimmed === "")
		return { error: `${OPTION_META[field].label} is required.` };

	const value = Number(trimmed);
	const error = checkOptionValue(field, value);
	return error ? { error } : { value };
}

export function validateOptionsDraft(draft: OptionsDraft): OptionsValidation {
	const errors: OptionErrors = {};
	const values: Partial<PlayerOptions> = {};

	for (const field of OPTION_FIELDS) {
		const result = parseField(field, draft[field]);
		if ("error" in result) {
			errors[field] = result.error;
		} else {
			values[field] = result.value;
		}
	}

	if (values.sessionTime === undefined || values.spawnInterval === undefined) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		value: {
			sessionTime: values.sessionTime,
			spawnInterval: values.spawnInterval,
		},
	};
}

export function toDraft(options: PlayerOptions): OptionsDraft {
	return {
		sessionTime: String(options.sessionTime),
		spawnInterval: String(options.spawnInterval),
	};
}

export function sanitizeOptions(data: unknown): PlayerOptions | null {
	if (!isRecord(data)) return null;
	const { sessionTime, spawnInterval } = data;
	if (typeof sessionTime !== "number" || typeof spawnInterval !== "number")
		return null;
	if (
		checkOptionValue("sessionTime", sessionTime) ||
		checkOptionValue("spawnInterval", spawnInterval)
	)
		return null;
	return { sessionTime, spawnInterval };
}

export function sameOptions(a: PlayerOptions, b: PlayerOptions): boolean {
	return a.sessionTime === b.sessionTime && a.spawnInterval === b.spawnInterval;
}
