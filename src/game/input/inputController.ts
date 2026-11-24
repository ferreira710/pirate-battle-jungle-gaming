import {
	createIdleCommands,
	PLAYER_ACTIONS,
	type PlayerAction,
	type PlayerCommands,
} from "../sim/commands";

export type SystemCommand = "pause";

export interface KeyBinding {
	action: PlayerAction;
	codes: readonly string[];
	labels: readonly string[];
	description: string;
}

export const KEY_BINDINGS: readonly KeyBinding[] = [
	{
		action: "forward",
		codes: ["KeyW", "ArrowUp"],
		labels: ["W", "↑"],
		description: "Sail forward",
	},
	{
		action: "turnLeft",
		codes: ["KeyA", "ArrowLeft"],
		labels: ["A", "←"],
		description: "Turn left",
	},
	{
		action: "turnRight",
		codes: ["KeyD", "ArrowRight"],
		labels: ["D", "→"],
		description: "Turn right",
	},
	{
		action: "fireFront",
		codes: ["Space", "KeyK"],
		labels: ["Space", "K"],
		description: "Fire bow cannon",
	},
	{
		action: "fireLeft",
		codes: ["KeyQ", "KeyJ"],
		labels: ["Q", "J"],
		description: "Fire left broadside",
	},
	{
		action: "fireRight",
		codes: ["KeyE", "KeyL"],
		labels: ["E", "L"],
		description: "Fire right broadside",
	},
];

export const PAUSE_BINDING = {
	codes: ["Escape", "KeyP"] as readonly string[],
	labels: ["Esc", "P"] as readonly string[],
	description: "Pause",
} as const;

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return (
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT"
	);
}

export class InputController {
	private readonly holders = new Map<PlayerAction, Set<string>>();
	private readonly commands = createIdleCommands();
	private readonly codeToAction = new Map<string, PlayerAction>();
	private readonly onSystemCommand: (command: SystemCommand) => void;
	private target: Window | null = null;
	private active = false;

	constructor(
		onSystemCommand: (command: SystemCommand) => void = () => undefined,
	) {
		this.onSystemCommand = onSystemCommand;
		for (const action of PLAYER_ACTIONS) {
			this.holders.set(action, new Set());
		}
		for (const binding of KEY_BINDINGS) {
			for (const code of binding.codes) {
				this.codeToAction.set(code, binding.action);
			}
		}
	}

	attach(target: Window = window): void {
		if (this.target) return;
		this.target = target;
		target.addEventListener("keydown", this.handleKeyDown);
		target.addEventListener("keyup", this.handleKeyUp);
		target.addEventListener("blur", this.handleBlur);
	}

	detach(): void {
		if (!this.target) return;
		this.target.removeEventListener("keydown", this.handleKeyDown);
		this.target.removeEventListener("keyup", this.handleKeyUp);
		this.target.removeEventListener("blur", this.handleBlur);
		this.target = null;
		this.active = false;
		this.releaseAll();
	}

	setActive(active: boolean): void {
		this.active = active;
		if (!active) this.releaseAll();
	}

	isActive(): boolean {
		return this.active;
	}

	press(action: PlayerAction, sourceId: string): void {
		if (!this.active) return;
		this.holders.get(action)?.add(sourceId);
		this.commands[action] = true;
	}

	release(sourceId: string): void {
		for (const action of PLAYER_ACTIONS) {
			const sources = this.holders.get(action);
			if (!sources) continue;
			sources.delete(sourceId);
			this.commands[action] = sources.size > 0;
		}
	}

	releaseAll(): void {
		for (const action of PLAYER_ACTIONS) {
			this.holders.get(action)?.clear();
			this.commands[action] = false;
		}
	}

	read(): PlayerCommands {
		return this.commands;
	}

	private readonly handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.active) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		if (PAUSE_BINDING.codes.includes(event.code)) {
			event.preventDefault();
			if (!event.repeat) this.onSystemCommand("pause");
			return;
		}

		const action = this.codeToAction.get(event.code);
		if (!action) return;
		event.preventDefault();
		this.press(action, `key:${event.code}`);
	};

	private readonly handleKeyUp = (event: KeyboardEvent): void => {
		const action = this.codeToAction.get(event.code);
		if (!action) return;
		if (this.active) event.preventDefault();
		this.release(`key:${event.code}`);
	};

	private readonly handleBlur = (): void => {
		this.releaseAll();
	};
}
