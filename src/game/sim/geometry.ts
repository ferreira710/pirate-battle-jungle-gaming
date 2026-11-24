export interface Vec2 {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Circle {
	x: number;
	y: number;
	radius: number;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function distanceSq(a: Vec2, b: Vec2): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return dx * dx + dy * dy;
}

export function distance(a: Vec2, b: Vec2): number {
	return Math.sqrt(distanceSq(a, b));
}

export function angleTo(from: Vec2, to: Vec2): number {
	return Math.atan2(to.y - from.y, to.x - from.x);
}

export function normalizeAngle(angle: number): number {
	let result = angle % (Math.PI * 2);
	if (result > Math.PI) result -= Math.PI * 2;
	if (result <= -Math.PI) result += Math.PI * 2;
	return result;
}

export function rotateTowards(
	current: number,
	target: number,
	maxStep: number,
): number {
	const delta = normalizeAngle(target - current);
	if (Math.abs(delta) <= maxStep) return normalizeAngle(target);
	return normalizeAngle(current + Math.sign(delta) * maxStep);
}

export function directionFromAngle(angle: number): Vec2 {
	return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function circlesIntersect(a: Circle, b: Circle): boolean {
	const radii = a.radius + b.radius;
	return distanceSq(a, b) < radii * radii;
}

export function circleIntersectsRect(circle: Circle, rect: Rect): boolean {
	const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
	const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
	const dx = circle.x - closestX;
	const dy = circle.y - closestY;
	return dx * dx + dy * dy < circle.radius * circle.radius;
}

export function circleRectPenetration(circle: Circle, rect: Rect): Vec2 | null {
	const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
	const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
	const dx = circle.x - closestX;
	const dy = circle.y - closestY;
	const distSq = dx * dx + dy * dy;

	if (distSq >= circle.radius * circle.radius) return null;

	if (distSq > 0) {
		const dist = Math.sqrt(distSq);
		const depth = circle.radius - dist;
		return { x: (dx / dist) * depth, y: (dy / dist) * depth };
	}

	const left = circle.x - rect.x + circle.radius;
	const right = rect.x + rect.width - circle.x + circle.radius;
	const top = circle.y - rect.y + circle.radius;
	const bottom = rect.y + rect.height - circle.y + circle.radius;
	const min = Math.min(left, right, top, bottom);

	if (min === left) return { x: -left, y: 0 };
	if (min === right) return { x: right, y: 0 };
	if (min === top) return { x: 0, y: -top };
	return { x: 0, y: bottom };
}

export function circleInsideBounds(
	circle: Circle,
	width: number,
	height: number,
): boolean {
	return (
		circle.x - circle.radius >= 0 &&
		circle.y - circle.radius >= 0 &&
		circle.x + circle.radius <= width &&
		circle.y + circle.radius <= height
	);
}

export function clampCircleToBounds(
	circle: Circle,
	width: number,
	height: number,
): Vec2 {
	return {
		x: clamp(circle.x, circle.radius, width - circle.radius),
		y: clamp(circle.y, circle.radius, height - circle.radius),
	};
}

export function isOutsideBounds(
	point: Vec2,
	width: number,
	height: number,
): boolean {
	return point.x < 0 || point.y < 0 || point.x > width || point.y > height;
}
