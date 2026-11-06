import test from "node:test";
import assert from "node:assert/strict";
import {
  stepPose,
  vehiclePoint,
  frontWheelAngles,
  projectedPath,
  roadAngle,
  WHEELBASE,
} from "../dist/simulation.mjs";
const start = { x: 0, y: 0, heading: 0 };
const close = (a, b, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("neutral reversing travels backward, without changing heading", () => {
  const p = stepPose(start, 0, -1, 2, 1);
  close(p.x, 0);
  close(p.y, -2);
  close(p.heading, 0);
});
test("right steering plus reversing: rear initially right, front initially left", () => {
  const p = stepPose(start, 288, -1, 1, 1);
  assert.ok(p.x > 0);
  assert.ok(p.y < 0);
  assert.ok(p.heading < 0);
  assert.ok(vehiclePoint(p, 3.5).x < 0);
  assert.ok(vehiclePoint(p, -0.9).x > 0);
});
test("left and right reverse paths are mirror images", () => {
  const a = stepPose(start, 270, -1, 3),
    b = stepPose(start, -270, -1, 3);
  close(a.x, -b.x);
  close(a.y, b.y);
  close(a.heading, -b.heading);
});
test("constant steering keeps the rear axle on its independently calculated turning circle", () => {
  const hand = 240,
    radius = WHEELBASE / Math.tan(roadAngle(hand));
  for (const time of [0.2, 1, 2, 4]) {
    const p = stepPose(start, hand, 1, time, 1);
    close(Math.hypot(p.x - radius, p.y), radius);
  }
});
test("straightening follows the current heading, preserving the existing turn", () => {
  const turned = stepPose(start, 288, -1, 1.5, 1),
    p = stepPose(turned, 0, -1, 1, 1);
  close(p.heading, turned.heading);
  close(p.x - turned.x, -Math.sin(turned.heading));
  close(p.y - turned.y, -Math.cos(turned.heading));
  assert.notEqual(p.heading, 0);
});
test("reversing an identical constant-curvature motion returns to the starting pose", () => {
  const initial = { x: 1.4, y: -2, heading: -0.72 };
  const p = stepPose(stepPose(initial, 300, 1, 2.5), 300, -1, 2.5);
  close(p.x, initial.x);
  close(p.y, initial.y);
  close(p.heading, initial.heading);
});
test("a changed steering input continues from the current position", () => {
  const p = stepPose(start, 250, -1, 1),
    q = stepPose(p, -180, -1, 0);
  close(q.x, p.x);
  close(q.y, p.y);
  close(q.heading, p.heading);
});
test("Ackermann inner wheel turns farther and wheelbase geometry stays rigid", () => {
  const angles = frontWheelAngles(288);
  assert.ok(angles.right > angles.left);
  assert.ok(angles.left > 0);
  const p = stepPose(start, 300, -1, 2),
    front = vehiclePoint(p, WHEELBASE);
  close(Math.hypot(front.x - p.x, front.y - p.y), WHEELBASE);
});
test("projected path begins at the actual body point and matches integrated endpoint", () => {
  const p = { x: 1, y: 2, heading: 0.3 },
    path = projectedPath(p, -240, -1, 3.5, 2);
  const first = vehiclePoint(p, 3.5),
    last = vehiclePoint(stepPose(p, -240, -1, 2 / 0.8), 3.5);
  close(path[0].x, first.x);
  close(path[0].y, first.y);
  close(path.at(-1).x, last.x);
  close(path.at(-1).y, last.y);
});
