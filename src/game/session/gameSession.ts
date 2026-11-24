import type { ArenaMap } from "../config/arenaMap";
import type { GameConfig, PlayerOptions } from "../config/gameConfig";
import { InputController } from "../input/inputController";
import { FixedStepClock } from "../sim/fixedStepClock";
import {
	createInitialState,
	type EndReason,
	type GameEvent,
	type GameState,
	type MatchPhase,
} from "../sim/state";
import { pauseMatch, resumeMatch, stepSimulation } from "../sim/step";

export type PauseReason = "manual" | "focus" | "hidden";
export type TimeMode = "realtime" | "manual";

export interface MatchSnapshot {
	readonly phase: MatchPhase;
	readonly pauseReason: PauseReason | null;
	readonly endReason: EndReason | null;
	readonly score: number;
	readonly remainingSeconds: number;
	readonly health: number;
	readonly maxHealth: number;
	readonly enemiesAlive: number;
}

export interface MatchOutcome {
	readonly reason: EndReason;
	readonly score: number;
	readonly duration: number;
	readonly seed: number;
	readonly mapId: string;
	readonly options: PlayerOptions;
	readonly endedAt: string;
}

export interface GameSessionOptions {
	config: GameConfig;
	map: ArenaMap;
	seed: number;
	timeMode?: TimeMode;
	onEnded?: (outcome: MatchOutcome) => void;
}

type SnapshotListener = () => void;
type EventListener = (events: readonly GameEvent[]) => void;

const TIME_EPSILON = 1e-9;

function sameSnapshot(a: MatchSnapshot, b: MatchSnapshot): boolean {
	return (
		a.phase === b.phase &&
		a.pauseReason === b.pauseReason &&
		a.endReason === b.endReason &&
		a.score === b.score &&
		a.remainingSeconds === b.remainingSeconds &&
		a.health === b.health &&
		a.maxHealth === b.maxHealth &&
		a.enemiesAlive === b.enemiesAlive
	);
}

export class GameSession {
	readonly input: InputController;
	private readonly state: GameState;
	private readonly clock: FixedStepClock;
	private readonly snapshotListeners = new Set<SnapshotListener>();
	private readonly eventListeners = new Set<EventListener>();
	private readonly onEnded: (outcome: MatchOutcome) => void;
	private timeMode: TimeMode;
	private snapshot: MatchSnapshot;
	private pauseReason: PauseReason | null = null;
	private syncTimer = 0;
	private outcome: MatchOutcome | null = null;
	private attached = false;
	private disposed = false;

	constructor(options: GameSessionOptions) {
		const { config, map, seed } = options;
		this.state = createInitialState(config, map, seed);
		this.clock = new FixedStepClock(
			config.simulation.fixedStep,
			config.simulation.maxFrameDelta,
		);
		this.input = new InputController((command) => {
			if (command === "pause") this.pause("manual");
		});
		this.timeMode = options.timeMode ?? "realtime";
		this.onEnded = options.onEnded ?? (() => undefined);
		this.snapshot = this.buildSnapshot();
	}

	attach(): void {
		if (this.attached || this.disposed) return;
		this.attached = true;
		this.input.attach(window);
		this.input.setActive(this.state.phase === "running");
		window.addEventListener("blur", this.handleBlur);
		document.addEventListener("visibilitychange", this.handleVisibilityChange);
	}

	detach(): void {
		if (!this.attached) return;
		this.attached = false;
		window.removeEventListener("blur", this.handleBlur);
		document.removeEventListener(
			"visibilitychange",
			this.handleVisibilityChange,
		);
		this.input.detach();
	}

	dispose(): void {
		if (this.disposed) return;
		this.detach();
		this.disposed = true;
		this.snapshotListeners.clear();
		this.eventListeners.clear();
	}

	frame(deltaSeconds: number): number {
		if (this.disposed) return 0;

		let alpha = this.clock.alpha();
		if (this.timeMode === "realtime" && this.state.phase === "running") {
			alpha = this.clock.advance(deltaSeconds, this.runStep);
		}

		this.afterSteps(deltaSeconds, false);
		return alpha;
	}

	advance(seconds: number): number {
		if (this.disposed || this.state.phase !== "running") return 0;
		const steps = Math.round(seconds / this.clock.getFixedStep());
		const executed = this.clock.runSteps(steps, this.runStep);
		this.afterSteps(0, true);
		return executed;
	}

	setTimeMode(mode: TimeMode): void {
		this.timeMode = mode;
		this.clock.reset();
	}

	getTimeMode(): TimeMode {
		return this.timeMode;
	}

	pause(reason: PauseReason): void {
		if (!pauseMatch(this.state)) return;
		this.pauseReason = reason;
		this.clock.reset();
		this.input.setActive(false);
		this.publish();
	}

	resume(): void {
		if (!resumeMatch(this.state)) return;
		this.pauseReason = null;
		this.clock.reset();
		this.input.setActive(true);
		this.publish();
	}

	getState(): Readonly<GameState> {
		return this.state;
	}

	getOutcome(): MatchOutcome | null {
		return this.outcome;
	}

	readonly subscribe = (listener: SnapshotListener): (() => void) => {
		this.snapshotListeners.add(listener);
		return () => {
			this.snapshotListeners.delete(listener);
		};
	};

	readonly getSnapshot = (): MatchSnapshot => this.snapshot;

	subscribeEvents(listener: EventListener): () => void {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}

	private readonly runStep = (dt: number): boolean => {
		stepSimulation(this.state, this.input.read(), dt);
		return this.state.phase === "running";
	};

	private afterSteps(realDelta: number, force: boolean): void {
		this.dispatchEvents();

		this.syncTimer += realDelta;
		const phaseChanged = this.snapshot.phase !== this.state.phase;
		if (
			force ||
			phaseChanged ||
			this.syncTimer >= this.state.config.simulation.uiSyncInterval
		) {
			this.syncTimer = 0;
			this.publish();
		}

		if (this.state.phase === "ended") this.finish();
	}

	private dispatchEvents(): void {
		const events = this.state.events;
		if (events.length === 0) return;
		for (const listener of this.eventListeners) {
			listener(events);
		}
		events.length = 0;
	}

	private finish(): void {
		if (this.outcome || this.state.endReason === null) return;
		this.input.setActive(false);

		const { config, map, rng } = this.state;
		this.outcome = Object.freeze({
			reason: this.state.endReason,
			score: this.state.score,
			duration: Math.round(this.state.elapsed * 1000) / 1000,
			seed: rng.seed,
			mapId: map.id,
			options: Object.freeze({
				sessionTime: config.match.duration,
				spawnInterval: config.spawn.interval,
			}),
			endedAt: new Date().toISOString(),
		});

		this.onEnded(this.outcome);
	}

	private publish(): void {
		const next = this.buildSnapshot();
		if (sameSnapshot(next, this.snapshot)) return;
		this.snapshot = next;
		for (const listener of this.snapshotListeners) {
			listener();
		}
	}

	private buildSnapshot(): MatchSnapshot {
		const { state } = this;
		let enemiesAlive = 0;
		for (const enemy of state.enemies) {
			if (enemy.alive) enemiesAlive += 1;
		}

		return {
			phase: state.phase,
			pauseReason: this.pauseReason,
			endReason: state.endReason,
			score: state.score,
			remainingSeconds: Math.ceil(state.remaining - TIME_EPSILON),
			health: state.player.health,
			maxHealth: state.player.maxHealth,
			enemiesAlive,
		};
	}

	private readonly handleBlur = (): void => {
		this.pause("focus");
	};

	private readonly handleVisibilityChange = (): void => {
		if (document.visibilityState === "hidden") this.pause("hidden");
	};
}
