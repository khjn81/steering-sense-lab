import { clamp, deg, MAX_HAND_ANGLE } from "./simulation.mjs";
export const HAND_GAIN = MAX_HAND_ANGLE / 70;
export const TRACKING_TIMEOUT = 300;

export function palmCenter(hand) {
  if (
    !Array.isArray(hand) ||
    hand.length !== 21 ||
    hand.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return null;
  if (Array.from({ length: 21 }, (_, i) => hand[i]).some((p) => !p))
    return null;
  const points = [0, 5, 9, 13, 17].map((i) => hand[i]);
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;
  return {
    x: points.reduce((sum, p) => sum + 1 - p.x, 0) / 5,
    y: points.reduce((sum, p) => sum + p.y, 0) / 5,
  };
}

export function measureHands(landmarks, width, height) {
  if (
    !Array.isArray(landmarks) ||
    landmarks.length !== 2 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  const hands = landmarks.map(palmCenter);
  if (hands.some((p) => !p)) return null;
  hands.sort((a, b) => a.x - b.x);
  const dx = (hands[1].x - hands[0].x) * width;
  const dy = (hands[1].y - hands[0].y) * height;
  if (dx < width * 0.12 || Math.hypot(dx, dy) < width * 0.2) return null;
  return { angle: deg(Math.atan2(dy, dx)), hands };
}

export function handSteering(measurement, neutral, previous = 0, dt = 0.05) {
  const difference = clamp(measurement - neutral, -70, 70);
  const target = Math.abs(difference) < 1.7 ? 0 : difference * HAND_GAIN;
  const alpha = 1 - Math.exp(-Math.max(0, dt) / 0.085);
  return clamp(
    previous + (target - previous) * alpha,
    -MAX_HAND_ANGLE,
    MAX_HAND_ANGLE,
  );
}

export function trackingIsFresh(lastSeen, now, calibrated) {
  return (
    calibrated === true &&
    Number.isFinite(lastSeen) &&
    Number.isFinite(now) &&
    lastSeen >= 0 &&
    now >= lastSeen &&
    now - lastSeen <= TRACKING_TIMEOUT
  );
}
