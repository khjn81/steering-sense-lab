import test from 'node:test';
import assert from 'node:assert/strict';
import { handSteering, measureHands, trackingIsFresh } from '../dist/hand-math.mjs';
const hand = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
test('clockwise rotation in the mirrored self view produces right steering', () => {
  const result = measureHands([hand(.75, .35), hand(.25, .65)], 640, 480);
  assert.ok(result.angle > 0); assert.ok(handSteering(result.angle, 0, 0, 1) > 0);
});
test('measurement accounts for the image aspect ratio rather than stretching coordinates', () => {
  const result = measureHands([hand(.75, .25), hand(.25, .75)], 640, 480);
  assert.ok(Math.abs(result.angle - 36.86989764584402) < 1e-7);
});
test('missing or overlapping hands cannot control steering', () => {
  assert.equal(measureHands([], 640, 480), null); assert.equal(measureHands([hand(.5, .5)], 640, 480), null);
  assert.equal(measureHands([hand(.49, .4), hand(.51, .6)], 640, 480), null);
});
test('neutral calibration, deadband, smoothing and angular limits constrain noisy input', () => {
  assert.equal(handSteering(13, 12, 0, .05), 0);
  const small = handSteering(25, 0, 0, .01), later = handSteering(25, 0, 0, .5);
  assert.ok(small > 0 && small < later); assert.ok(later < 25 * 360 / 70);
  assert.ok(handSteering(180, 0, 0, 2) <= 360);
});
test('a comfortable 70-degree hand rotation can reach the full parking steering range in either direction', () => {
  assert.ok(handSteering(70, 0, 0, 2) > 359);
  assert.ok(handSteering(-70, 0, 0, 2) < -359);
  assert.ok(handSteering(-180, 0, 0, 2) >= -360);
});
test('uncalibrated, absent and stale observations cannot enable driving', () => {
  assert.equal(trackingIsFresh(100, 200, false), false);
  assert.equal(trackingIsFresh(null, 200, true), false);
  assert.equal(trackingIsFresh(100, 450, true), false);
  assert.equal(trackingIsFresh(100, 250, true), true);
});
