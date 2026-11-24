import { useQueryClient } from "@tanstack/react-query";
import {
	type SyntheticEvent,
	useEffect,
	useId,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	getMockSettings,
	getScenarioDefinition,
	resetMocks,
	SCENARIOS,
	type ScenarioId,
	setLatencyScale,
	setScenario,
	subscribeMockSettings,
} from "../../mocks/scenarios";
import { requestSync } from "../../storage/registrationOutbox";
import { Button } from "../components/Button";

const LATENCY_OPTIONS: readonly { value: number; label: string }[] = [
	{ value: 1, label: "Normal" },
	{ value: 0.25, label: "Fast" },
	{ value: 0, label: "Instant" },
];

export function NetworkLab() {
	const baseId = useId();
	const queryClient = useQueryClient();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState("");
	const settings = useSyncExternalStore(
		subscribeMockSettings,
		getMockSettings,
		getMockSettings,
	);
	const definition = getScenarioDefinition(settings.scenario);

	const latencyOptions = LATENCY_OPTIONS.some(
		(option) => option.value === settings.latencyScale,
	)
		? LATENCY_OPTIONS
		: [
				...LATENCY_OPTIONS,
				{
					value: settings.latencyScale,
					label: `Custom (×${settings.latencyScale})`,
				},
			];

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}, [open]);

	function close() {
		setOpen(false);
		setStatus("");
		triggerRef.current?.focus();
	}

	function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
		event.preventDefault();
		close();
	}

	function handleScenario(id: ScenarioId) {
		setScenario(id);
		setStatus(`Scenario set to ${getScenarioDefinition(id).label}.`);
		void queryClient.invalidateQueries();
		requestSync();
	}

	function handleLatency(value: number) {
		setLatencyScale(value);
		setStatus("Latency updated.");
	}

	function handleReset() {
		resetMocks();
		void queryClient.resetQueries();
		requestSync();
		setStatus("Mock server restored to its initial state.");
	}

	return (
		<>
			<Button
				ref={triggerRef}
				variant="secondary"
				onClick={() => setOpen(true)}
				data-testid="menu-network"
			>
				Network lab
			</Button>

			<dialog
				ref={dialogRef}
				className="lab-dialog"
				aria-labelledby={`${baseId}-title`}
				aria-describedby={`${baseId}-intro`}
				onCancel={handleCancel}
				data-testid="network-lab"
			>
				<h2 id={`${baseId}-title`} className="lab-dialog__title">
					Network lab
				</h2>
				<p id={`${baseId}-intro`} className="lab-dialog__intro">
					Simulate API conditions for the ranking and match history. The game
					itself always works offline.
				</p>

				<div className="field">
					<label htmlFor={`${baseId}-scenario`} className="field__label">
						Scenario
					</label>
					<select
						id={`${baseId}-scenario`}
						className="select"
						value={settings.scenario}
						onChange={(event) =>
							handleScenario(event.target.value as ScenarioId)
						}
						aria-describedby={`${baseId}-scenario-hint`}
						data-testid="lab-scenario"
					>
						{SCENARIOS.map((scenario) => (
							<option key={scenario.id} value={scenario.id}>
								{scenario.label}
							</option>
						))}
					</select>
					<p id={`${baseId}-scenario-hint`} className="field__hint">
						{definition.description}
					</p>
				</div>

				<div className="field">
					<label htmlFor={`${baseId}-latency`} className="field__label">
						Latency
					</label>
					<select
						id={`${baseId}-latency`}
						className="select"
						value={String(settings.latencyScale)}
						onChange={(event) => handleLatency(Number(event.target.value))}
						data-testid="lab-latency"
					>
						{latencyOptions.map((option) => (
							<option key={option.value} value={String(option.value)}>
								{option.label}
							</option>
						))}
					</select>
				</div>

				<p className="form-status" role="status" data-testid="lab-status">
					{status}
				</p>

				<div className="form-actions">
					<Button
						variant="secondary"
						onClick={handleReset}
						data-testid="lab-reset"
					>
						Reset mock server
					</Button>
					<Button onClick={close} data-testid="lab-close">
						Close
					</Button>
				</div>
			</dialog>
		</>
	);
}
