import { useEffect, useRef } from "react";

export function useScreenFocus<T extends HTMLElement>() {
	const ref = useRef<T>(null);

	useEffect(() => {
		ref.current?.focus({ preventScroll: true });
	}, []);

	return ref;
}
