import { type ReactNode, type Ref, useId } from "react";

interface PanelProps {
	heading: ReactNode;
	headingRef?: Ref<HTMLHeadingElement>;
	className?: string;
	children: ReactNode;
}

export function Panel({
	heading,
	headingRef,
	className,
	children,
}: PanelProps) {
	const headingId = useId();

	return (
		<section
			className={className ? `panel ${className}` : "panel"}
			aria-labelledby={headingId}
		>
			<h1
				id={headingId}
				ref={headingRef}
				tabIndex={-1}
				className="panel__title"
			>
				{heading}
			</h1>
			{children}
		</section>
	);
}
