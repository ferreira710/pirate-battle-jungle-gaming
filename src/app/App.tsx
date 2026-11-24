import { lazy, type ReactNode, Suspense } from "react";
import { RegistrationSync } from "../api/RegistrationSync";
import { Button } from "../ui/components/Button";
import { ErrorBoundary } from "../ui/components/ErrorBoundary";
import { Panel } from "../ui/components/Panel";
import { MainMenuScreen } from "../ui/screens/MainMenuScreen";
import { OptionsScreen } from "../ui/screens/OptionsScreen";
import { ResultScreen } from "../ui/screens/ResultScreen";
import { useRoute } from "./router";

const CombatScreen = lazy(() =>
	import("../ui/screens/CombatScreen").then((module) => ({
		default: module.CombatScreen,
	})),
);

function CombatLoading() {
	return (
		<main className="screen screen--loading">
			<Panel heading="Preparing the fleet">
				<p className="loading__text" role="status">
					Loading the battle…
				</p>
			</Panel>
		</main>
	);
}

function CombatUnavailable() {
	return (
		<main className="screen screen--loading">
			<Panel heading="Battle unavailable">
				<div className="form-alert" role="alert">
					<p className="form-alert__title">The game could not be loaded.</p>
					<p>Check your connection and reload the page.</p>
				</div>
				<div className="form-actions">
					<Button
						onClick={() => window.location.reload()}
						data-testid="combat-reload"
					>
						Reload
					</Button>
				</div>
			</Panel>
		</main>
	);
}

export function App() {
	const route = useRoute();

	let screen: ReactNode;
	switch (route) {
		case "options":
			screen = <OptionsScreen />;
			break;
		case "play":
			screen = (
				<ErrorBoundary fallback={<CombatUnavailable />}>
					<Suspense fallback={<CombatLoading />}>
						<CombatScreen />
					</Suspense>
				</ErrorBoundary>
			);
			break;
		case "result":
			screen = <ResultScreen />;
			break;
		default:
			screen = <MainMenuScreen />;
	}

	return (
		<div className="app">
			<RegistrationSync />
			{screen}
		</div>
	);
}
