import type { ReactNode } from "react";
import { RegistrationSync } from "../api/RegistrationSync";
import { CombatScreen } from "../ui/screens/CombatScreen";
import { MainMenuScreen } from "../ui/screens/MainMenuScreen";
import { OptionsScreen } from "../ui/screens/OptionsScreen";
import { ResultScreen } from "../ui/screens/ResultScreen";
import { useRoute } from "./router";

export function App() {
	const route = useRoute();

	let screen: ReactNode;
	switch (route) {
		case "options":
			screen = <OptionsScreen />;
			break;
		case "play":
			screen = <CombatScreen />;
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
