const STEP_EPSILON = 1e-9;

export class FixedStepClock {
	private readonly fixedStep: number;
	private readonly maxFrameDelta: number;
	private accumulator = 0;

	constructor(fixedStep: number, maxFrameDelta: number) {
		this.fixedStep = fixedStep;
		this.maxFrameDelta = maxFrameDelta;
	}

	advance(frameDelta: number, step: (dt: number) => boolean): number {
		if (Number.isFinite(frameDelta) && frameDelta > 0) {
			this.accumulator += Math.min(frameDelta, this.maxFrameDelta);
		}

		while (this.accumulator + STEP_EPSILON >= this.fixedStep) {
			this.accumulator -= this.fixedStep;
			if (!step(this.fixedStep)) {
				this.accumulator = 0;
				break;
			}
		}

		return this.alpha();
	}

	runSteps(count: number, step: (dt: number) => boolean): number {
		let executed = 0;
		for (let index = 0; index < count; index += 1) {
			executed += 1;
			if (!step(this.fixedStep)) break;
		}
		return executed;
	}

	reset(): void {
		this.accumulator = 0;
	}

	alpha(): number {
		return Math.min(1, Math.max(0, this.accumulator / this.fixedStep));
	}

	getFixedStep(): number {
		return this.fixedStep;
	}
}
