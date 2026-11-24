import { type SyntheticEvent, useEffect, useRef } from "react";
import type { PauseReason } from "../../game/session/gameSession";
import { Button } from "../components/Button";

interface PauseDialogProps {
	open: boolean;
	reason: PauseReason | null;
	onResume: () => void;
	onRestart: () => void;
	onExit: () => void;
}

const REASON_TEXT: Record<PauseReason, string> = {
	manual: "The battle is on hold.",
	focus: "Paused because the game window lost focus.",
	hidden: "Paused because the tab was hidden.",
};

export function PauseDialog({
	open,
	reason,
	onResume,
	onRestart,
	onExit,
}: PauseDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			dialog
				.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')
				?.focus();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
		event.preventDefault();
		onResume();
	}

	return (
		<dialog
			ref={dialogRef}
			className="pause-dialog"
			aria-labelledby="pause-title"
			aria-describedby="pause-reason"
			onCancel={handleCancel}
			data-testid="pause-dialog"
		>
			<h2 id="pause-title" className="pause-dialog__title">
				Paused
			</h2>
			<p id="pause-reason" className="pause-dialog__reason">
				{reason ? REASON_TEXT[reason] : ""}
			</p>
			<div className="form-actions">
				<Button onClick={onResume} data-testid="pause-resume">
					Resume
				</Button>
				<Button
					variant="secondary"
					onClick={onRestart}
					data-testid="pause-restart"
				>
					Restart
				</Button>
				<Button variant="secondary" onClick={onExit} data-testid="pause-exit">
					Main Menu
				</Button>
			</div>
		</dialog>
	);
}
