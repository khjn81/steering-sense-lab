import test from "node:test";
import assert from "node:assert/strict";
import { measureHands } from "../dist/hand-math.mjs";
import { HandController } from "../dist/hand-control.mjs";
const hand = (x) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));

test("malformed and sparse landmarks fail closed without exceptions", () => {
  for (const bad of [
    null,
    [],
    {},
    { length: 21 },
    Array(21),
    hand(0.7).slice(0, 18),
    hand(0.7).map((p, i) => (i === 20 ? null : p)),
    hand(0.7).map((p, i) => (i === 8 ? { x: NaN, y: 0.5 } : p)),
  ]) {
    assert.equal(measureHands([bad, hand(0.3)], 640, 480), null);
  }
  assert.equal(measureHands({ length: 2 }, 640, 480), null);
  assert.equal(measureHands([hand(0.7), hand(0.3)], NaN, 480), null);
  assert.ok(measureHands([hand(0.7), hand(0.3)], 640, 480));
});

test("invalid model callbacks clear the overlay instead of throwing while drawing", () => {
  const previous = globalThis.document;
  const context = Object.fromEntries(
    ["clearRect", "beginPath", "lineTo", "moveTo", "stroke", "arc", "fill"].map(
      (name) => [name, () => {}],
    ),
  );
  const video = { videoWidth: 640, videoHeight: 480 },
    overlay = { getContext: () => context };
  globalThis.document = {
    getElementById: (id) => (id === "handVideo" ? video : overlay),
  };
  try {
    const c = new HandController({ onAngle() {}, onChange() {}, onLost() {} });
    assert.doesNotThrow(() =>
      c.process([{ length: 21 }, hand(0.3)], performance.now()),
    );
    assert.equal(c.measurement, null);
    assert.equal(c.samples.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("freshness rejects future, nonfinite and negative observation times", async () => {
  const { trackingIsFresh } = await import("../dist/hand-math.mjs");
  for (const [seen, now] of [
    [1000, 200],
    [Infinity, 200],
    [-10, 0],
    [NaN, 200],
    [100, NaN],
  ])
    assert.equal(trackingIsFresh(seen, now, true), false);
  assert.equal(trackingIsFresh(0, 300, true), true);
  assert.equal(trackingIsFresh(0, 301, true), false);
});

test("future and reordered worker observations cannot refresh calibrated driving", () => {
  const previous = globalThis.document;
  const context = Object.fromEntries(
    ["clearRect", "beginPath", "lineTo", "moveTo", "stroke", "arc", "fill"].map(
      (name) => [name, () => {}],
    ),
  );
  globalThis.document = {
    getElementById: (id) =>
      id === "handVideo"
        ? { videoWidth: 640, videoHeight: 480 }
        : { getContext: () => context },
  };
  try {
    const c = new HandController({ onAngle() {}, onChange() {}, onLost() {} });
    c.active = c.calibrated = true;
    const now = performance.now();
    c.previousTimestamp = now - 20;
    c.lastSeen = now;
    c.process([hand(0.7), hand(0.3)], now + 10000);
    assert.equal(c.ready, false);
    assert.equal(c.lastSeen, null);
    c.lastSeen = performance.now();
    c.previousTimestamp = performance.now();
    c.process([hand(0.7), hand(0.3)], c.previousTimestamp - 1);
    assert.equal(c.ready, false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
