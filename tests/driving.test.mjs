import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';

test('reverse button immediately moves the car while the steering pointer is still held', async () => {
  const app = await appHarness(), wheel = app.el('wheelPad');
  wheel.emit('pointerdown', { pointerId: 1, clientX: 150, clientY: 80 });
  wheel.emit('pointermove', { pointerId: 1, clientX: 80, clientY: 150 });
  app.el('reverseGear').emit('pointerdown', { pointerId: 2, pointerType: 'touch' }); app.tick(30);
  assert.ok(app.output.running); assert.ok(app.output.pose.y < 1); assert.ok(app.output.pose.heading < 0);
  assert.equal(app.output.handAngle, 90);
  await app.click('driveButton');
  app.el('reverseGear').emit('click', { detail: 1 }); app.tick();
  assert.equal(app.output.running, false, 'releasing an earlier direction press must not restart a stopped car');
});
test('changing to forward while steering takes effect without a second start click', async () => {
  const app = await appHarness();
  app.el('steerRange').value = '180'; app.el('steerRange').emit('input');
  await app.click('reverseGear'); app.tick(30);
  const y = app.output.pose.y;
  await app.click('forwardGear'); app.tick(30);
  assert.equal(app.output.gear, 1); assert.ok(app.output.running); assert.ok(app.output.pose.y > y); assert.equal(app.output.handAngle, 180);
});
test('a second touch cannot steal or release the steering pointer', async () => {
  const app = await appHarness(), wheel = app.el('wheelPad');
  wheel.emit('pointerdown', { pointerId: 1, clientX: 150, clientY: 80 });
  wheel.emit('pointermove', { pointerId: 1, clientX: 80, clientY: 150 });
  app.tick(); const before = app.output.handAngle;
  wheel.emit('pointerdown', { pointerId: 2, clientX: 150, clientY: 80 });
  wheel.emit('pointermove', { pointerId: 2, clientX: 80, clientY: 10 });
  wheel.emit('pointerup', { pointerId: 2 }); app.tick();
  assert.equal(app.output.handAngle, before);
  wheel.emit('pointermove', { pointerId: 1, clientX: 10, clientY: 80 }); app.tick();
  assert.ok(app.output.handAngle > before);
});
test('hold W/S to drive while the wheel is dragged, even after a button had focus; release stops', async () => {
  const app = await appHarness(), wheel = app.el('wheelPad');
  wheel.emit('pointerdown', { pointerId: 1, clientX: 150, clientY: 80 });
  app.document.emit('keydown', { code: 'KeyW', target: app.el('forwardGear') });
  wheel.emit('pointermove', { pointerId: 1, clientX: 80, clientY: 150 });
  app.document.emit('keydown', { code: 'ArrowRight', target: app.el('forwardGear') }); app.tick(30);
  assert.ok(app.output.running); assert.ok(app.output.pose.y > 1); assert.ok(app.output.pose.heading > 0);
  assert.ok(app.output.handAngle > 90);
  app.document.emit('keyup', { code: 'KeyW' }); app.tick(); assert.equal(app.output.running, false);
  const y = app.output.pose.y;
  app.document.emit('keydown', { code: 'KeyS', target: wheel }); app.tick(20);
  assert.equal(app.output.gear, -1); assert.ok(app.output.pose.y < y);
});
test('a camera-mode start request can wait briefly for both hands after the mouse click', async () => {
  const app = await appHarness(); await app.click('cameraButton');
  app.hands.lose(); await app.click('forwardGear'); app.tick(20);
  assert.equal(app.output.running, false);
  app.hands.regain(80); app.tick(20);
  assert.ok(app.output.running); assert.ok(app.output.pose.y > 1); assert.equal(app.output.handAngle, 80);
});
test('cancelled or expired camera start requests cannot start on later hand recovery', async () => {
  const app = await appHarness(); await app.click('cameraButton'); app.hands.lose();
  await app.click('reverseGear'); await app.click('driveButton'); app.hands.regain(); app.tick(10);
  assert.equal(app.output.running, false);
  app.hands.lose(); await app.click('reverseGear'); app.tick(200); app.hands.regain(); app.tick(10);
  assert.equal(app.output.running, false);
});
