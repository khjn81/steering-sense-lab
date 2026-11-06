import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';

test('long recordings retain at most3200 recent frames and a valid timeline cursor', async () => {
  const app=await appHarness('free');app.recordFrames(4000);
  assert.equal(app.output.history.length,3200);
  assert.equal(app.output.historyIndex,3199);
  assert.equal(app.output.history[0].time,801);
  assert.equal(app.output.history.at(-1).time,4000);
  await app.click('replayButton');app.tick(10);assert.ok(app.output.replaying);
});
