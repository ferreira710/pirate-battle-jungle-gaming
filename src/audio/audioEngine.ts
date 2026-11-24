export const SOUND_NAMES = [
	"cannon_broadside",
	"cannon_fire_1",
	"cannon_fire_2",
	"cannon_fire_3",
	"cannonball_water_hit_1",
	"cannonball_water_hit_2",
	"game_complete",
	"game_over",
	"game_pause",
	"game_resume",
	"game_start",
	"health_low",
	"ocean_ambience_loop",
	"score_point",
	"ship_collision",
	"ship_explosion_1",
	"ship_explosion_2",
	"ship_sailing_loop",
	"ship_sinking",
	"ship_wood_hit_1",
	"ship_wood_hit_2",
	"time_warning",
	"ui_back",
	"ui_click",
	"ui_close",
	"ui_hover",
	"ui_open",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];
export type LoopName = Extract<
	SoundName,
	"ocean_ambience_loop" | "ship_sailing_loop"
>;

export interface PlayOptions {
	volume?: number;
	rate?: number;
}

interface LoopVoice {
	source: AudioBufferSourceNode;
	gain: GainNode;
	target: number;
}

const MIN_REPEAT_INTERVAL = 0.04;
const MAX_VOICES = 24;
const DEFAULT_VOLUME = 0.8;
const VOLUME_SMOOTHING = 0.05;
const DEFAULT_LOOP_FADE = 0.3;

function soundUrl(name: SoundName): string {
	return `${import.meta.env.BASE_URL}assets/sounds/${name}.wav`;
}

export class AudioEngine {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private loading: Promise<void> | null = null;
	private readonly buffers = new Map<SoundName, AudioBuffer>();
	private readonly lastPlayed = new Map<SoundName, number>();
	private readonly loops = new Map<LoopName, LoopVoice>();
	private activeVoices = 0;
	private muted = false;
	private volume = DEFAULT_VOLUME;

	unlock(): void {
		if (!this.context) {
			if (typeof window.AudioContext !== "function") return;
			this.context = new AudioContext();
			this.master = this.context.createGain();
			this.master.connect(this.context.destination);
			this.applyVolume();
		}

		if (this.context.state === "suspended") {
			this.context.resume().catch(() => undefined);
		}

		void this.load();
	}

	load(): Promise<void> {
		const context = this.context;
		if (!context) return Promise.resolve();
		if (this.loading) return this.loading;

		this.loading = Promise.all(
			SOUND_NAMES.map(async (name) => {
				try {
					const response = await fetch(soundUrl(name));
					if (!response.ok) return;
					const data = await response.arrayBuffer();
					this.buffers.set(name, await context.decodeAudioData(data));
				} catch {
					return;
				}
			}),
		).then(() => undefined);

		return this.loading;
	}

	play(name: SoundName, options: PlayOptions = {}): void {
		const { context, master } = this;
		if (!context || !master || this.muted) return;

		const buffer = this.buffers.get(name);
		if (!buffer) return;

		const now = context.currentTime;
		const last = this.lastPlayed.get(name) ?? -Infinity;
		if (now - last < MIN_REPEAT_INTERVAL) return;
		if (this.activeVoices >= MAX_VOICES) return;
		this.lastPlayed.set(name, now);

		const source = context.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = options.rate ?? 1;

		const gain = context.createGain();
		gain.gain.value = options.volume ?? 1;

		source.connect(gain);
		gain.connect(master);
		this.activeVoices += 1;

		source.onended = () => {
			this.activeVoices = Math.max(0, this.activeVoices - 1);
			source.disconnect();
			gain.disconnect();
		};

		source.start();
	}

	setLoop(name: LoopName, volume: number, fade = DEFAULT_LOOP_FADE): void {
		const { context, master } = this;
		if (!context || !master) return;

		const current = this.loops.get(name);
		if (current) {
			if (current.target === volume) return;
			current.target = volume;
			current.gain.gain.cancelScheduledValues(context.currentTime);
			current.gain.gain.setTargetAtTime(volume, context.currentTime, fade / 3);
			if (volume === 0) {
				current.source.stop(context.currentTime + fade);
				this.loops.delete(name);
			}
			return;
		}

		if (volume <= 0) return;
		const buffer = this.buffers.get(name);
		if (!buffer) return;

		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = true;

		const gain = context.createGain();
		gain.gain.value = 0;
		gain.gain.setTargetAtTime(volume, context.currentTime, fade / 3);

		source.connect(gain);
		gain.connect(master);
		source.onended = () => {
			source.disconnect();
			gain.disconnect();
		};
		source.start();

		this.loops.set(name, { source, gain, target: volume });
	}

	stopLoops(fade = DEFAULT_LOOP_FADE): void {
		for (const name of [...this.loops.keys()]) {
			this.setLoop(name, 0, fade);
		}
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		this.applyVolume();
	}

	isMuted(): boolean {
		return this.muted;
	}

	setVolume(volume: number): void {
		this.volume = Math.min(1, Math.max(0, volume));
		this.applyVolume();
	}

	private applyVolume(): void {
		const { context, master } = this;
		if (!context || !master) return;
		master.gain.setTargetAtTime(
			this.muted ? 0 : this.volume,
			context.currentTime,
			VOLUME_SMOOTHING,
		);
	}
}

export const audioEngine = new AudioEngine();
