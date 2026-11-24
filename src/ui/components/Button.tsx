import type { ComponentPropsWithRef, MouseEvent } from "react";
import { audioEngine } from "../../audio/audioEngine";

type ButtonProps = ComponentPropsWithRef<"button"> & {
	variant?: "primary" | "secondary";
};

export function Button({
	variant = "primary",
	className,
	onClick,
	type = "button",
	...rest
}: ButtonProps) {
	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		audioEngine.unlock();
		audioEngine.play("ui_click", { volume: 0.5 });
		onClick?.(event);
	}

	const classes = ["btn", `btn--${variant}`, className]
		.filter(Boolean)
		.join(" ");

	return (
		<button type={type} className={classes} onClick={handleClick} {...rest} />
	);
}
