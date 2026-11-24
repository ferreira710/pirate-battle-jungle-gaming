import {
	type KeyboardEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";
import { audioEngine } from "../../audio/audioEngine";

export interface TabItem {
	id: string;
	label: string;
	render: () => ReactNode;
}

interface TabsProps {
	label: string;
	items: readonly TabItem[];
}

export function Tabs({ label, items }: TabsProps) {
	const baseId = useId();
	const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const [activeId, setActiveId] = useState(items[0]?.id ?? "");
	const current = items.find((item) => item.id === activeId) ?? items[0];

	function select(id: string) {
		if (id === activeId) return;
		audioEngine.play("ui_click", { volume: 0.4 });
		setActiveId(id);
	}

	function focusAt(index: number) {
		const item = items[(index + items.length) % items.length];
		if (!item) return;
		select(item.id);
		tabRefs.current[item.id]?.focus();
	}

	function handleKeyDown(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) {
		switch (event.key) {
			case "ArrowRight":
				event.preventDefault();
				focusAt(index + 1);
				break;
			case "ArrowLeft":
				event.preventDefault();
				focusAt(index - 1);
				break;
			case "Home":
				event.preventDefault();
				focusAt(0);
				break;
			case "End":
				event.preventDefault();
				focusAt(items.length - 1);
				break;
			default:
				break;
		}
	}

	return (
		<div className="tabs">
			<div role="tablist" aria-label={label} className="tabs__list">
				{items.map((item, index) => {
					const selected = item.id === current?.id;
					return (
						<button
							key={item.id}
							ref={(element) => {
								tabRefs.current[item.id] = element;
							}}
							id={`${baseId}-tab-${item.id}`}
							type="button"
							role="tab"
							className="tabs__tab"
							aria-selected={selected}
							aria-controls={`${baseId}-panel-${item.id}`}
							tabIndex={selected ? 0 : -1}
							onClick={() => select(item.id)}
							onKeyDown={(event) => handleKeyDown(event, index)}
							data-testid={`tab-${item.id}`}
						>
							{item.label}
						</button>
					);
				})}
			</div>
			{current && (
				<div
					role="tabpanel"
					id={`${baseId}-panel-${current.id}`}
					aria-labelledby={`${baseId}-tab-${current.id}`}
					className="tabs__panel"
					data-testid={`panel-${current.id}`}
				>
					{current.render()}
				</div>
			)}
		</div>
	);
}
