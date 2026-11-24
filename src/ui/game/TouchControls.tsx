import { type PointerEvent, useState } from "react";
import type { InputController } from "../../game/input/inputController";
import type { PlayerAction } from "../../game/sim/commands";
import { iconUrl } from "../components/IconButton";

interface HoldButtonProps {
	input: InputController;
	action: PlayerAction;
	icon: string;
	label: string;
}

const MOVEMENT: readonly Omit<HoldButtonProps, "input">[] = [
	{ action: "turnLeft", icon: "turn_left", label: "Turn left" },
	{ action: "forward", icon: "forward", label: "Sail forward" },
	{ action: "turnRight", icon: "turn_right", label: "Turn right" },
];

const WEAPONS: readonly Omit<HoldButtonProps, "input">[] = [
	{ action: "fireLeft", icon: "fire_left", label: "Fire left broadside" },
	{ action: "fireFront", icon: "fire_front", label: "Fire bow cannon" },
	{ action: "fireRight", icon: "fire_right", label: "Fire right broadside" },
];

function HoldButton({ input, action, icon, label }: HoldButtonProps) {
	const [pressed, setPressed] = useState(false);

	function handleDown(event: PointerEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		input.press(action, `pointer:${event.pointerId}`);
		setPressed(true);
	}

	function handleUp(event: PointerEvent<HTMLButtonElement>) {
		input.release(`pointer:${event.pointerId}`);
		setPressed(false);
	}

	return (
		<button
			type="button"
			className={`touch-btn touch-btn--${action}`}
			aria-label={label}
			tabIndex={-1}
			data-pressed={pressed}
			data-testid={`touch-${action}`}
			onPointerDown={handleDown}
			onPointerUp={handleUp}
			onPointerCancel={handleUp}
			onLostPointerCapture={handleUp}
			onContextMenu={(event) => event.preventDefault()}
		>
			<img src={iconUrl(icon)} alt="" aria-hidden="true" draggable={false} />
		</button>
	);
}

export function TouchControls({ input }: { input: InputController }) {
	return (
		<div className="touch-controls" data-testid="touch-controls">
			<fieldset
				className="touch-controls__group touch-controls__group--move"
				aria-label="Movement"
			>
				{MOVEMENT.map((button) => (
					<HoldButton key={button.action} input={input} {...button} />
				))}
			</fieldset>
			<fieldset
				className="touch-controls__group touch-controls__group--fire"
				aria-label="Cannons"
			>
				{WEAPONS.map((button) => (
					<HoldButton key={button.action} input={input} {...button} />
				))}
			</fieldset>
		</div>
	);
}
