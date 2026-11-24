import { useEffect, useRef, useState } from "react";
import { navigate } from "../../app/router";
import { bindGameAudio } from "../../game/audio/gameAudio";
import { buildArenaMap, DEFAULT_ARENA } from "../../game/config/arenaMap";
import { createMatchConfig } from "../../game/config/gameConfig";
import type { GameTextures } from "../../game/render/assets";
import { GameRenderer } from "../../game/render/gameRenderer";
import { createArenaLayer } from "../../game/render/layers/arenaLayer";
import { createEffectsLayer } from "../../game/render/layers/effectsLayer";
import { createProjectileLayer } from "../../game/render/layers/projectileLayer";
import { createShipLayer } from "../../game/render/layers/shipLayer";
import { completeMatch } from "../../game/session/completeMatch";
import { GameSession } from "../../game/session/gameSession";
import { randomSeed } from "../../game/sim/rng";
import { getOptions } from "../../storage/optionsStore";
import {
	exposeSession,
	readClockParam,
	readSeedParam,
} from "../../testing/testBridge";
import { Hud } from "./Hud";
import { PauseDialog } from "./PauseDialog";
import { TouchControls } from "./TouchControls";

const RESULT_DELAY_MS = 1500;
const MANUAL_CLOCK_MAX_FPS = 10;
const LAYERS = [
	createArenaLayer,
	createShipLayer,
	createProjectileLayer,
	createEffectsLayer,
];

interface BattleProps {
	textures: GameTextures;
	onRestart: () => void;
}

export function Battle({ textures, onRestart }: BattleProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [session, setSession] = useState<GameSession | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let active = true;
		let resultTimer: number | undefined;

		const timeMode = readClockParam();
		const config = createMatchConfig(getOptions());
		const map = buildArenaMap(DEFAULT_ARENA, config.world);
		const created = new GameSession({
			config,
			map,
			seed: readSeedParam() ?? randomSeed(),
			timeMode,
			onEnded: (outcome) => {
				completeMatch(outcome);
				resultTimer = window.setTimeout(() => {
					if (active) navigate("result");
				}, RESULT_DELAY_MS);
			},
		});

		const renderer = new GameRenderer({
			session: created,
			textures,
			layers: LAYERS,
			maxFps: timeMode === "manual" ? MANUAL_CLOCK_MAX_FPS : undefined,
		});
		const unbindAudio = bindGameAudio(created);

		renderer
			.mount(host)
			.then((mounted) => {
				if (!mounted || !active) return;
				created.attach();
				exposeSession(created);
				setSession(created);
			})
			.catch(() => {
				if (active) setFailed(true);
			});

		return () => {
			active = false;
			window.clearTimeout(resultTimer);
			exposeSession(null);
			unbindAudio();
			renderer.destroy();
			created.dispose();
			setSession(null);
		};
	}, [textures]);

	const snapshotPhase = session?.getSnapshot().phase;

	return (
		<div className="battle">
			<div ref={hostRef} className="battle__stage" />

			{failed && (
				<div className="battle__error" role="alert">
					<p>The game renderer could not start on this device.</p>
					<button type="button" onClick={() => navigate("menu")}>
						Back to menu
					</button>
				</div>
			)}

			{session && (
				<>
					<Hud session={session} onPause={() => session.pause("manual")} />
					<TouchControls input={session.input} />
					<PauseWatcher
						session={session}
						onRestart={onRestart}
						onExit={() => navigate("menu")}
						key={snapshotPhase === undefined ? "none" : "ready"}
					/>
				</>
			)}

			<p className="rotate-hint" aria-hidden="true">
				Best played in landscape
			</p>
		</div>
	);
}

function PauseWatcher({
	session,
	onRestart,
	onExit,
}: {
	session: GameSession;
	onRestart: () => void;
	onExit: () => void;
}) {
	const [snapshot, setSnapshot] = useState(session.getSnapshot());

	useEffect(
		() => session.subscribe(() => setSnapshot(session.getSnapshot())),
		[session],
	);

	return (
		<PauseDialog
			open={snapshot.phase === "paused"}
			reason={snapshot.pauseReason}
			onResume={() => session.resume()}
			onRestart={onRestart}
			onExit={onExit}
		/>
	);
}
