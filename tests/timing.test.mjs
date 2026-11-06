import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';
import { getScenario, inTarget } from '../dist/scenarios.mjs';

test('one elapsed second produces the same steering trajectory at10Hz and60Hz', async () => {
  const outputs=[];
  for (const [count,step] of [[60,1000/60],[10,100]]) {
    const app=await appHarness('free');app.el('steerRange').value='160';app.el('steerRange').emit('input');
    await app.click('forwardGear');app.tick(count,step);outputs.push(app.output);
  }
  assert.ok(Math.abs(outputs[0].travelled-.8)<1e-9);
  for(const key of ['x','y','heading'])assert.ok(Math.abs(outputs[0].pose[key]-outputs[1].pose[key])<1e-9,key);
});

test('a low-cadence model completes at its declared elapsed duration', async () => {
  const app=await appHarness('apt-bay'),scenario=getScenario('apt-bay');await app.click('modelButton');
  const seconds=scenario.steps.reduce((sum,s)=>sum+s.duration,0);app.tick(Math.ceil((seconds+.2)*10),100);
  assert.equal(app.output.modelFinished,true);assert.ok(inTarget(app.output.pose,scenario));
});
