import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { queryClient } from "./app/queryClient";
import { getRoute, navigate } from "./app/router";
import "./styles/global.css";

async function enableMocking(): Promise<void> {
	try {
		const { worker } = await import("./mocks/browser");
		await worker.start({
			serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
			quiet: true,
		});
	} catch {
		return;
	}
}

function render(): void {
	if (getRoute() === "play") {
		navigate("menu", { replace: true });
	}

	const container = document.getElementById("root");
	if (!container) throw new Error("Root element not found");

	createRoot(container).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</StrictMode>,
	);
}

void enableMocking().then(render);
