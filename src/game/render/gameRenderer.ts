import { Application, Container, type Ticker } from "pixi.js";
import type { GameSession } from "../session/gameSession";
import type { GameEvent, GameState } from "../sim/state";
import type { GameTextures } from "./assets";

export interface SceneLayer {
	readonly container: Container;
	update(state: Readonly<GameState>, alpha: number, frameDelta: number): void;
	handleEvents?(events: readonly GameEvent[]): void;
	destroy(): void;
}

export interface LayerContext {
	readonly textures: GameTextures;
	readonly state: Readonly<GameState>;
}

export type LayerFactory = (context: LayerContext) => SceneLayer;

export interface Viewport {
	readonly width: number;
	readonly height: number;
	readonly scale: number;
	readonly offsetX: number;
	readonly offsetY: number;
}

export interface GameRendererOptions {
	session: GameSession;
	textures: GameTextures;
	layers: readonly LayerFactory[];
	onViewportChange?: (viewport: Viewport) => void;
}

const MAX_RESOLUTION = 2;
const BACKGROUND_COLOR = 0x1d6fa5;

function currentResolution(): number {
	return Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION);
}

function measure(host: HTMLElement): { width: number; height: number } {
	return {
		width: Math.max(1, Math.floor(host.clientWidth)),
		height: Math.max(1, Math.floor(host.clientHeight)),
	};
}

export class GameRenderer {
	private readonly app = new Application();
	private readonly world = new Container();
	private readonly layers: SceneLayer[] = [];
	private readonly session: GameSession;
	private readonly textures: GameTextures;
	private readonly factories: readonly LayerFactory[];
	private readonly onViewportChange: (viewport: Viewport) => void;
	private host: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private unsubscribeEvents: (() => void) | null = null;
	private initialized = false;
	private destroyed = false;
	private viewport: Viewport = {
		width: 1,
		height: 1,
		scale: 1,
		offsetX: 0,
		offsetY: 0,
	};

	constructor(options: GameRendererOptions) {
		this.session = options.session;
		this.textures = options.textures;
		this.factories = options.layers;
		this.onViewportChange = options.onViewportChange ?? (() => undefined);
	}

	async mount(host: HTMLElement): Promise<boolean> {
		if (this.destroyed || this.host) return false;
		this.host = host;

		const { width, height } = measure(host);
		await this.app.init({
			width,
			height,
			resolution: currentResolution(),
			autoDensity: true,
			antialias: true,
			background: BACKGROUND_COLOR,
			preference: "webgl",
		});

		if (this.destroyed) {
			this.app.destroy(
				{ removeView: true },
				{ children: true, texture: false, textureSource: false },
			);
			return false;
		}

		this.initialized = true;

		const canvas = this.app.canvas;
		canvas.style.display = "block";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.touchAction = "none";
		canvas.setAttribute("aria-hidden", "true");
		canvas.dataset.testid = "game-canvas";
		host.appendChild(canvas);

		const state = this.session.getState();
		for (const factory of this.factories) {
			const layer = factory({ textures: this.textures, state });
			this.layers.push(layer);
			this.world.addChild(layer.container);
		}
		this.app.stage.addChild(this.world);

		this.unsubscribeEvents = this.session.subscribeEvents(this.handleEvents);
		this.resizeObserver = new ResizeObserver(this.handleResize);
		this.resizeObserver.observe(host);
		this.fit(width, height);

		this.app.ticker.add(this.handleTick);
		return true;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (!this.initialized) return;

		this.app.ticker.remove(this.handleTick);
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.unsubscribeEvents?.();
		this.unsubscribeEvents = null;

		for (const layer of this.layers) {
			layer.destroy();
		}
		this.layers.length = 0;

		this.app.destroy(
			{ removeView: true },
			{ children: true, texture: false, textureSource: false },
		);
		this.host = null;
		this.initialized = false;
	}

	getViewport(): Viewport {
		return this.viewport;
	}

	toWorld(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.app.canvas.getBoundingClientRect();
		return {
			x: (clientX - rect.left - this.viewport.offsetX) / this.viewport.scale,
			y: (clientY - rect.top - this.viewport.offsetY) / this.viewport.scale,
		};
	}

	private fit(width: number, height: number): void {
		const { map } = this.session.getState();
		this.app.renderer.resize(width, height, currentResolution());

		const scale = Math.min(width / map.width, height / map.height);
		const offsetX = (width - map.width * scale) / 2;
		const offsetY = (height - map.height * scale) / 2;

		this.world.scale.set(scale);
		this.world.position.set(offsetX, offsetY);
		this.viewport = Object.freeze({ width, height, scale, offsetX, offsetY });
		this.onViewportChange(this.viewport);
	}

	private readonly handleTick = (ticker: Ticker): void => {
		const frameDelta = ticker.deltaMS / 1000;
		const alpha = this.session.frame(frameDelta);
		const state = this.session.getState();
		for (const layer of this.layers) {
			layer.update(state, alpha, frameDelta);
		}
	};

	private readonly handleEvents = (events: readonly GameEvent[]): void => {
		for (const layer of this.layers) {
			layer.handleEvents?.(events);
		}
	};

	private readonly handleResize = (): void => {
		if (!this.initialized || !this.host) return;
		const { width, height } = measure(this.host);
		this.fit(width, height);
	};
}
