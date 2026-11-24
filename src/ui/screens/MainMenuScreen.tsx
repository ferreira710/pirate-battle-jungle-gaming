import { navigate } from "../../app/router";
import { Button } from "../components/Button";
import { ControlsHelp } from "../components/ControlsHelp";
import { Panel } from "../components/Panel";
import { type TabItem, Tabs } from "../components/Tabs";
import { useScreenFocus } from "../hooks/useScreenFocus";
import { HistoryPanel } from "../menu/HistoryPanel";
import { NetworkLab } from "../menu/NetworkLab";
import { RankingPanel } from "../menu/RankingPanel";

const TITLE_ART = `${import.meta.env.BASE_URL}assets/png/default/ui/menu/title_pirate_battle.png`;

const BOARD_TABS: readonly TabItem[] = [
	{ id: "ranking", label: "Ranking", render: () => <RankingPanel /> },
	{ id: "history", label: "Match History", render: () => <HistoryPanel /> },
];

export function MainMenuScreen() {
	const headingRef = useScreenFocus<HTMLHeadingElement>();

	return (
		<main className="screen screen--menu">
			<div className="menu-layout">
				<Panel
					heading={
						<img className="title-art" src={TITLE_ART} alt="Pirate Battle" />
					}
					headingRef={headingRef}
				>
					<nav className="menu-actions" aria-label="Main menu">
						<Button data-testid="menu-play" onClick={() => navigate("play")}>
							Play
						</Button>
						<Button
							data-testid="menu-options"
							variant="secondary"
							onClick={() => navigate("options")}
						>
							Options
						</Button>
						<NetworkLab />
					</nav>
					<ControlsHelp />
				</Panel>

				<section className="board" aria-label="Leaderboards">
					<Tabs label="Leaderboards" items={BOARD_TABS} />
				</section>
			</div>
		</main>
	);
}
