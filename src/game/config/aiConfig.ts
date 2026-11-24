export interface AiTuning {
	readonly lookahead: number;
	readonly avoidanceStep: number;
	readonly avoidanceSteps: number;
	readonly sharpTurnAngle: number;
	readonly sharpTurnThrust: number;
	readonly shooterAimTolerance: number;
	readonly shooterBrakeBand: number;
}

export const AI_TUNING: AiTuning = Object.freeze({
	lookahead: 70,
	avoidanceStep: Math.PI / 6,
	avoidanceSteps: 4,
	sharpTurnAngle: Math.PI / 2,
	sharpTurnThrust: 0.4,
	shooterAimTolerance: 0.18,
	shooterBrakeBand: 40,
});
