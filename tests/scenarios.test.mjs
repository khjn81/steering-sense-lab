import test from "node:test";
import assert from "node:assert/strict";
import {
  SCENARIOS,
  getScenario,
  proximity,
  inTarget,
} from "../dist/scenarios.mjs";
import { vehiclePoint } from "../dist/simulation.mjs";
import { appHarness } from "./app-harness.mjs";

function select(app, id) {
  app.el("scenarioSelect").value = id;
  app.el("scenarioSelect").emit("change");
  app.tick();
}

test("each reference demonstration is contact-free throughout and finishes inside its target", async () => {
  for (const s of SCENARIOS) {
    const app = await appHarness();
    select(app, s.id);
    await app.click("modelButton");
    const frames =
      Math.ceil(s.steps.reduce((sum, step) => sum + step.duration, 0) * 60) + 5;
    for (let i = 0; i < frames; i++) {
      app.tick();
      assert.equal(
        app.output.contact,
        false,
        `${s.id} reference touched an obstacle at frame ${i}`,
      );
    }
    assert.equal(app.output.modelFinished, true, `${s.id} did not finish`);
    assert.equal(app.output.modelPlaying, false);
    assert.ok(
      Math.hypot(app.output.pose.x - s.end.x, app.output.pose.y - s.end.y) <
        0.001,
      `${s.id} wrong end position`,
    );
    if (s.target) assert.ok(inTarget(app.output.pose, s));
    assert.equal(app.el("practiceButton").hidden, false);
  }
});

test("collision checks include a rotated front corner even when the rear axle is clear", () => {
  const pose = { x: 0, y: 0, heading: Math.PI / 4 },
    corner = vehiclePoint(pose, 3.45, 0.85);
  const obstacle = {
    x: corner.x,
    y: corner.y,
    width: 0.2,
    length: 0.2,
    heading: 0,
  };
  assert.ok(Math.hypot(corner.x, corner.y) > 3);
  assert.equal(proximity(pose, [obstacle]).contact, true);
  assert.equal(proximity(pose, [{ ...obstacle, x: 9 }]).contact, false);
});

test("a parking goal requires the whole body and correct orientation, rather than axle proximity", () => {
  const s = getScenario("apt-bay");
  assert.ok(inTarget(s.end, s));
  assert.equal(inTarget({ ...s.end, x: 0.7 }, s), false);
  assert.equal(inTarget({ ...s.end, heading: 0.35 }, s), false);
  assert.equal(inTarget(s.start, s), false);
});

async function setupInAisle(app) {
  select(app, "apt-bay");
  await app.click("forwardGear");
  app.tick(264);
  await app.click("driveButton");
  app.tick();
}
async function reverseIntoBay(app) {
  app.el("steerRange").value = "360";
  app.el("steerRange").emit("input");
  await app.click("reverseGear");
  app.tick(551);
  await app.click("driveButton");
  app.tick();
  app.el("steerRange").value = "0";
  app.el("steerRange").emit("input");
  await app.click("reverseGear");
  app.tick(308);
  await app.click("driveButton");
  app.tick();
}
test("a full manual 90-degree parking route can exceed 5m; going too far then stops before the stopper and can escape", async () => {
  const app = await appHarness();
  await setupInAisle(app);
  await reverseIntoBay(app);
  assert.equal(app.output.contact, false);
  assert.equal(app.output.complete, true);
  assert.ok(inTarget(app.output.pose, getScenario("apt-bay")));
  await app.click("reverseGear");
  app.tick(100);
  assert.equal(app.output.contact, true);
  assert.equal(app.output.running, false);
  assert.ok(app.output.pose.y - 0.9 > -8.58 + 0.09);
  const y = app.output.pose.y;
  await app.click("forwardGear");
  app.tick(20);
  assert.ok(app.output.pose.y > y);
  assert.equal(app.output.contact, false);
});

test("waiting for a passing car alone does not complete parking; the other car keeps moving while stopped", async () => {
  const app = await appHarness();
  select(app, "apt-traffic");
  await app.click("forwardGear");
  app.tick(240);
  assert.ok(app.output.hazardTime >= 0);
  await app.click("driveButton");
  app.tick(480);
  assert.equal(app.output.running, false);
  assert.equal(app.output.contact, false);
  assert.equal(app.output.complete, false);
  assert.equal(app.output.hazardTime, 7.5);
  await app.click("replayButton");
  app.tick(10);
  assert.equal(app.output.hazardTime, -1);
  app.tick(750);
  assert.equal(app.output.hazardTime, 7.5);
});

test("starting the reverse turn before the passing car clears prevents contact and does not complete the goal", async () => {
  const app = await appHarness();
  select(app, "apt-traffic");
  await app.click("forwardGear");
  app.tick(264);
  await app.click("driveButton");
  app.el("steerRange").value = "360";
  app.el("steerRange").emit("input");
  await app.click("reverseGear");
  app.tick(240);
  assert.equal(app.output.running, false);
  assert.equal(app.output.contact, true);
  assert.equal(app.output.complete, false);
});

test("changing scenario cancels a model or queued camera departure and resets hazard/history", async () => {
  const app = await appHarness();
  select(app, "apt-traffic");
  await app.click("modelButton");
  app.tick(150);
  select(app, "apt-pillar");
  assert.equal(app.output.modelPlaying, false);
  assert.equal(app.output.modelView, false);
  assert.equal(app.output.hazardTime, -1);
  assert.equal(app.output.travelled, 0);
  assert.equal(app.output.history.length, 1);
  await app.click("cameraButton");
  app.hands.lose();
  await app.click("reverseGear");
  select(app, "apt-bay");
  app.hands.regain(80);
  app.tick(30);
  assert.equal(app.output.running, false);
  assert.equal(app.output.pendingDriveUntil, 0);
});

test("model demonstration can pause/resume without live hand input altering the reference route", async () => {
  const app = await appHarness();
  select(app, "apt-pillar");
  await app.click("cameraButton");
  await app.click("modelButton");
  app.tick(500);
  const angle = app.output.handAngle;
  app.hands.regain(250);
  app.tick();
  assert.equal(app.output.handAngle, angle);
  await app.click("modelButton");
  const p = { ...app.output.pose };
  app.tick(60);
  assert.equal(app.output.modelPlaying, false);
  assert.equal(app.output.pose.y, p.y);
  await app.click("modelButton");
  app.tick(40);
  assert.equal(app.output.modelPlaying, true);
  assert.notEqual(app.output.pose.y, p.y);
  await app.click("practiceButton");
  app.tick();
  assert.equal(app.output.modelView, false);
  assert.equal(app.output.running, false);
  assert.equal(app.output.pose.x, getScenario("apt-pillar").start.x);
});

test("the first experience opens a dense apartment garage and each parking target is an independently marked 90-degree bay", async () => {
  const app = await appHarness(null);
  assert.equal(app.output.scenarioId, "apt-bay");
  assert.equal(app.output.pose.heading, Math.PI / 2);
  for (const s of SCENARIOS.filter((s) => s.garage)) {
    assert.equal(s.garage.bays.length, 26);
    assert.equal(s.obstacles.filter((o) => o.kind === "car").length, 25);
    assert.equal(s.garage.bays.filter((b) => b.target).length, 1);
    assert.equal(s.target.heading, 0);
    assert.equal(s.end.heading.toFixed(4), "0.0000");
    assert.ok(
      s.end.y < -7 && s.start.y > 1,
      "route must enter the bay from the aisle",
    );
  }
});

test("the B14 entry pillar is a collision obstacle inside the relevant corner clearance, not scenery", () => {
  const s = getScenario("apt-pillar"),
    pole = s.obstacles.find((o) => o.id === "bay-pillar");
  assert.ok(pole);
  assert.ok(proximity(s.end, [pole]).distance > 0.1);
  assert.equal(
    proximity({ ...s.end, x: s.end.x + 0.16 }, [pole]).contact,
    true,
  );
});

test("mirror and rear camera switches change visible panes independently without changing movement", async () => {
  const app = await appHarness();
  await app.click("reverseGear");
  app.tick(10);
  app.el("showRear").checked = false;
  app.el("showRear").emit("change");
  app.tick();
  assert.equal(app.el("rearCamera").hidden, true);
  assert.equal(app.el("leftMirror").hidden, false);
  assert.equal(app.output.running, true);
  app.el("showMirrors").checked = false;
  app.el("showMirrors").emit("change");
  app.tick();
  assert.equal(app.el("mirrorStrip").hidden, true);
});

test("scrubbing a hazard recording freezes both vehicles until the learner explicitly drives again", async () => {
  const app = await appHarness();
  select(app, "apt-traffic");
  await app.click("forwardGear");
  app.tick(264);
  await app.click("driveButton");
  app.tick(480);
  const index = app.output.history.findIndex(
    (f) => f.hazardTime > 0.1 && f.hazardTime < 0.5,
  );
  app.el("timeline").value = String(index);
  app.el("timeline").emit("input");
  app.tick();
  const frozen = app.output.hazardTime,
    count = app.output.history.length;
  app.tick(90);
  assert.equal(app.output.hazardTime, frozen);
  assert.equal(app.output.history.length, count);
  await app.click("reverseGear");
  app.tick(10);
  assert.ok(app.output.hazardTime > frozen);
});

test("all three prediction lessons still complete and return to the selected scenario", async () => {
  const app = await appHarness();
  select(app, "apt-pillar");
  await app.click("quizMode");
  for (let i = 0; i < 3; i++) {
    assert.equal(app.el("missionBox").hidden, true);
    assert.equal(app.el("modelButtons").hidden, true);
    app.el("quizAnswers").children[0].emit("click");
    await app.click("lessonAction");
    app.tick(125);
    assert.equal(app.output.phase, "review");
    assert.equal(app.output.running, false);
    await app.click("lessonAction");
  }
  app.tick();
  assert.equal(app.output.mode, "free");
  assert.equal(app.output.scenarioId, "apt-pillar");
});

test("a paused model can rewind and resume the exact remaining route with monotonic recording times", async () => {
  const app = await appHarness(),
    s = getScenario("apt-pillar");
  select(app, s.id);
  await app.click("modelButton");
  app.tick(220);
  await app.click("modelButton");
  app.el("timeline").value = "60";
  app.el("timeline").emit("input");
  app.tick();
  await app.click("modelButton");
  app.tick(2000);
  assert.equal(app.output.modelFinished, true);
  assert.equal(app.output.contact, false);
  assert.ok(
    Math.hypot(app.output.pose.x - s.end.x, app.output.pose.y - s.end.y) <
      0.001,
  );
  const times = app.output.history.map((f) => f.time);
  assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]));
});
