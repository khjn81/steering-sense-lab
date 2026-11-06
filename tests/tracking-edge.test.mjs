import test from 'node:test';
import assert from 'node:assert/strict';
import { measureHands } from '../dist/hand-math.mjs';
import { HandController } from '../dist/hand-control.mjs';
const hand = x => Array.from({length:21}, () => ({x,y:.5,z:0}));

test('malformed and sparse landmarks fail closed without exceptions', () => {
  for (const bad of [null, [], {}, {length:21}, Array(21), hand(.7).slice(0,18), hand(.7).map((p,i)=>i===20?null:p), hand(.7).map((p,i)=>i===8?{x:NaN,y:.5}:p)]) {
    assert.equal(measureHands([bad,hand(.3)],640,480),null);
  }
  assert.equal(measureHands({length:2},640,480),null);
  assert.equal(measureHands([hand(.7),hand(.3)],NaN,480),null);
  assert.ok(measureHands([hand(.7),hand(.3)],640,480));
});

test('invalid model callbacks clear the overlay instead of throwing while drawing', () => {
  const previous=globalThis.document;
  const context=Object.fromEntries(['clearRect','beginPath','lineTo','moveTo','stroke','arc','fill'].map(name=>[name,()=>{}]));
  const video={videoWidth:640,videoHeight:480},overlay={getContext:()=>context};
  globalThis.document={getElementById:id=>id==='handVideo'?video:overlay};
  try {
    const c=new HandController({onAngle(){},onChange(){},onLost(){}});
    assert.doesNotThrow(()=>c.process([{length:21},hand(.3)],performance.now()));
    assert.equal(c.measurement,null);assert.equal(c.samples.length,0);
  } finally { if(previous===undefined)delete globalThis.document;else globalThis.document=previous; }
});
