export const PLAYER_ACTIONS = [
	"forward",
	"turnLeft",
	"turnRight",
	"fireFront",
	"fireLeft",
	"fireRight",
] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

export type PlayerCommands = Readonly<Record<PlayerAction, boolean>>;

export function createIdleCommands(): Record<PlayerAction, boolean> {
	return {
		forward: false,
		turnLeft: false,
		turnRight: false,
		fireFront: false,
		fireLeft: false,
		fireRight: false,
	};
}
