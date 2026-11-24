import { type FormEvent, useId, useRef, useState } from "react";
import { navigate } from "../../app/router";
import { DEFAULT_OPTIONS, OPTION_LIMITS } from "../../game/config/gameConfig";
import {
	OPTION_FIELDS,
	OPTION_META,
	type OptionErrors,
	type OptionField,
	type OptionsDraft,
	toDraft,
	validateOptionsDraft,
} from "../../game/config/playerOptions";
import { saveOptions, useOptions } from "../../storage/optionsStore";
import { Button } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { Panel } from "../components/Panel";
import { useScreenFocus } from "../hooks/useScreenFocus";

type Status = { tone: "success" | "warning"; message: string } | null;

function formatNumber(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

export function OptionsScreen() {
	const saved = useOptions();
	const headingRef = useScreenFocus<HTMLHeadingElement>();
	const baseId = useId();
	const inputs = useRef<Partial<Record<OptionField, HTMLInputElement | null>>>(
		{},
	);
	const [draft, setDraft] = useState<OptionsDraft>(() => toDraft(saved));
	const [errors, setErrors] = useState<OptionErrors>({});
	const [status, setStatus] = useState<Status>(null);

	function update(field: OptionField, value: string) {
		setDraft((previous) => ({ ...previous, [field]: value }));
		setStatus(null);
		setErrors((previous) => {
			if (!previous[field]) return previous;
			const next = { ...previous };
			delete next[field];
			return next;
		});
	}

	function stepBy(field: OptionField, direction: 1 | -1) {
		const limit = OPTION_LIMITS[field];
		const parsed = Number(draft[field].trim().replace(",", "."));
		const base = Number.isFinite(parsed) ? parsed : saved[field];
		const snapped =
			Math.round((base - limit.min) / limit.step) * limit.step + limit.min;
		const next = Math.min(
			limit.max,
			Math.max(limit.min, snapped + direction * limit.step),
		);
		update(field, formatNumber(next));
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = validateOptionsDraft(draft);

		if (!result.ok) {
			setErrors(result.errors);
			setStatus(null);
			const firstInvalid = OPTION_FIELDS.find((field) => result.errors[field]);
			if (firstInvalid) inputs.current[firstInvalid]?.focus();
			return;
		}

		setErrors({});
		const persisted = saveOptions(result.value);
		setDraft(toDraft(result.value));
		setStatus(
			persisted
				? {
						tone: "success",
						message: "Options saved. They apply to your next match.",
					}
				: {
						tone: "warning",
						message:
							"Options applied, but they could not be stored on this device.",
					},
		);
	}

	function handleDefaults() {
		setDraft(toDraft(DEFAULT_OPTIONS));
		setErrors({});
		setStatus({
			tone: "success",
			message: "Default values restored. Select Save to keep them.",
		});
	}

	const errorList = OPTION_FIELDS.flatMap((field) => {
		const message = errors[field];
		return message ? [{ field, message }] : [];
	});

	return (
		<main className="screen screen--options">
			<Panel heading="Options" headingRef={headingRef}>
				<form
					className="options-form"
					noValidate
					onSubmit={handleSubmit}
					data-testid="options-form"
				>
					{errorList.length > 0 && (
						<div
							className="form-alert"
							role="alert"
							data-testid="options-errors"
						>
							<p className="form-alert__title">Please fix the following:</p>
							<ul>
								{errorList.map(({ field, message }) => (
									<li key={field}>
										<a href={`#${baseId}-${field}`}>{message}</a>
									</li>
								))}
							</ul>
						</div>
					)}

					{OPTION_FIELDS.map((field) => {
						const meta = OPTION_META[field];
						const limit = OPTION_LIMITS[field];
						const inputId = `${baseId}-${field}`;
						const hintId = `${inputId}-hint`;
						const errorId = `${inputId}-error`;
						const error = errors[field];

						return (
							<div key={field} className="field">
								<label htmlFor={inputId} className="field__label">
									{meta.label}
								</label>
								<div className="field__control">
									<IconButton
										icon="minus"
										label={`Decrease ${meta.label}`}
										onClick={() => stepBy(field, -1)}
									/>
									<input
										id={inputId}
										ref={(element) => {
											inputs.current[field] = element;
										}}
										className="field__input"
										type="text"
										inputMode="decimal"
										autoComplete="off"
										value={draft[field]}
										onChange={(event) => update(field, event.target.value)}
										aria-invalid={error ? true : undefined}
										aria-describedby={error ? `${hintId} ${errorId}` : hintId}
										data-testid={`option-${field}`}
									/>
									<span className="field__unit" aria-hidden="true">
										s
									</span>
									<IconButton
										icon="plus"
										label={`Increase ${meta.label}`}
										onClick={() => stepBy(field, 1)}
									/>
								</div>
								<p id={hintId} className="field__hint">
									{limit.min} to {limit.max} {meta.unit}, in steps of{" "}
									{limit.step}.
								</p>
								{error && (
									<p id={errorId} className="field__error">
										{error}
									</p>
								)}
							</div>
						);
					})}

					<p
						className="form-status"
						role="status"
						data-testid="options-status"
						data-tone={status?.tone}
					>
						{status?.message ?? ""}
					</p>

					<div className="form-actions">
						<Button type="submit" data-testid="options-save">
							Save
						</Button>
						<Button
							variant="secondary"
							onClick={handleDefaults}
							data-testid="options-defaults"
						>
							Defaults
						</Button>
						<Button
							variant="secondary"
							onClick={() => navigate("menu")}
							data-testid="options-back"
						>
							Back
						</Button>
					</div>
				</form>
			</Panel>
		</main>
	);
}
