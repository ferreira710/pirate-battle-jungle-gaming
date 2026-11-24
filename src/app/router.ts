import { useSyncExternalStore } from "react";

export const ROUTES = ["menu", "options", "play", "result"] as const;
export type Route = (typeof ROUTES)[number];

function parseRoute(hash: string): Route {
	const name = hash.replace(/^#\/?/, "");
	return (ROUTES as readonly string[]).includes(name)
		? (name as Route)
		: "menu";
}

export function getRoute(): Route {
	return parseRoute(window.location.hash);
}

export function navigate(
	route: Route,
	options: { replace?: boolean } = {},
): void {
	const hash = `#/${route}`;
	if (window.location.hash === hash) return;

	if (options.replace) {
		window.history.replaceState(null, "", hash);
		window.dispatchEvent(new HashChangeEvent("hashchange"));
		return;
	}

	window.location.hash = hash;
}

function subscribe(listener: () => void): () => void {
	window.addEventListener("hashchange", listener);
	return () => {
		window.removeEventListener("hashchange", listener);
	};
}

export function useRoute(): Route {
	return useSyncExternalStore(subscribe, getRoute, getRoute);
}
