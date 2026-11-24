import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import {
	AssetLoadError,
	type GameTextures,
	loadGameTextures,
} from "../../game/render/assets";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { Battle } from "../game/Battle";
import { useScreenFocus } from "../hooks/useScreenFocus";
import "../../styles/game.css";

type LoadState =
	| { status: "loading"; progress: number }
	| { status: "error"; message: string }
	| { status: "ready"; textures: GameTextures };

function LoadingPanel({
	state,
	onRetry,
}: {
	state: Exclude<LoadState, { status: "ready" }>;
	onRetry: () => void;
}) {
	const headingRef = useScreenFocus<HTMLHeadingElement>();
	const percent =
		state.status === "loading" ? Math.round(state.progress * 100) : 0;

	return (
		<main className="screen screen--loading">
			<Panel
				heading={
					state.status === "loading" ? "Preparing the fleet" : "Loading failed"
				}
				headingRef={headingRef}
			>
				{state.status === "loading" ? (
					<div className="loading" data-testid="loading">
						<progress
							className="loading__bar"
							max={100}
							value={percent}
							aria-label="Loading game assets"
							data-testid="loading-progress"
						/>
						<p className="loading__text" aria-hidden="true">
							{percent}%
						</p>
					</div>
				) : (
					<div className="form-alert" role="alert" data-testid="loading-error">
						<p className="form-alert__title">{state.message}</p>
						<p>Check your connection and try again.</p>
					</div>
				)}
				<div className="form-actions">
					{state.status === "error" && (
						<Button onClick={onRetry} data-testid="loading-retry">
							Try again
						</Button>
					)}
					<Button
						variant="secondary"
						onClick={() => navigate("menu")}
						data-testid="loading-back"
					>
						Main Menu
					</Button>
				</div>
			</Panel>
		</main>
	);
}

function CombatAttempt({
	matchKey,
	onRestart,
	onRetry,
}: {
	matchKey: number;
	onRestart: () => void;
	onRetry: () => void;
}) {
	const [state, setState] = useState<LoadState>({
		status: "loading",
		progress: 0,
	});

	useEffect(() => {
		let active = true;
		setState({ status: "loading", progress: 0 });

		loadGameTextures((progress) => {
			if (active) setState({ status: "loading", progress });
		})
			.then((textures) => {
				if (active) setState({ status: "ready", textures });
			})
			.catch((error: unknown) => {
				if (!active) return;
				const count = error instanceof AssetLoadError ? error.failed.length : 0;
				setState({
					status: "error",
					message:
						count > 0
							? `Could not load ${count} game asset(s).`
							: "Could not load the game assets.",
				});
			});

		return () => {
			active = false;
		};
	}, []);

	if (state.status !== "ready") {
		return <LoadingPanel state={state} onRetry={onRetry} />;
	}

	return (
		<Battle key={matchKey} textures={state.textures} onRestart={onRestart} />
	);
}

export function CombatScreen() {
	const [attempt, setAttempt] = useState(0);
	const [matchKey, setMatchKey] = useState(0);

	return (
		<CombatAttempt
			key={attempt}
			matchKey={matchKey}
			onRestart={() => setMatchKey((value) => value + 1)}
			onRetry={() => setAttempt((value) => value + 1)}
		/>
	);
}
