import { useId } from "react";
import { KEY_BINDINGS, PAUSE_BINDING } from "../../game/input/inputController";

export function ControlsHelp() {
	const headingId = useId();
	const rows = [...KEY_BINDINGS, PAUSE_BINDING];

	return (
		<section className="controls-help" aria-labelledby={headingId}>
			<h2 id={headingId} className="section-title">
				Controls
			</h2>
			<dl className="controls-help__list">
				{rows.map((row) => (
					<div key={row.description} className="controls-help__row">
						<dt>{row.description}</dt>
						<dd>
							{row.labels.map((label, index) => (
								<span key={label}>
									{index > 0 && <span className="controls-help__or"> or </span>}
									<kbd>{label}</kbd>
								</span>
							))}
						</dd>
					</div>
				))}
			</dl>
			<p className="controls-help__note">
				On touch screens, use the on-screen buttons. Play in landscape.
			</p>
		</section>
	);
}
