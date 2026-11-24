import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { audioEngine } from "../../audio/audioEngine";

export type IconName =
	| "close"
	| "home"
	| "minus"
	| "pause"
	| "play"
	| "plus"
	| "restart"
	| "settings";

type IconButtonProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	icon: IconName;
	label: string;
};

export function iconUrl(icon: string): string {
	return `${import.meta.env.BASE_URL}assets/png/default/ui/controls/icon_${icon}.png`;
}

export function IconButton({
	icon,
	label,
	className,
	onClick,
	type = "button",
	...rest
}: IconButtonProps) {
	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		audioEngine.unlock();
		audioEngine.play("ui_click", { volume: 0.4 });
		onClick?.(event);
	}

	return (
		<button
			type={type}
			className={className ? `icon-btn ${className}` : "icon-btn"}
			aria-label={label}
			title={label}
			onClick={handleClick}
			{...rest}
		>
			<img src={iconUrl(icon)} alt="" aria-hidden="true" draggable={false} />
		</button>
	);
}
