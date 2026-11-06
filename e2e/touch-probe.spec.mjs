import { test, expect } from "@playwright/test";
test("two native touch pointers can steer and reverse together", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  await page.locator("#scenarioSelect").selectOption("free");
  await page.locator(".control-deck").scrollIntoViewIfNeeded();
  const wheel = await page.locator("#wheelPad").boundingBox(),
    gear = await page.locator("#reverseGear").boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const direction = {
    x: gear.x + gear.width / 2,
    y: gear.y + gear.height / 2,
    id: 2,
  };
  let touching = false;
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: wheel.x + wheel.width * 0.85,
          y: wheel.y + wheel.height / 2,
          id: 1,
        },
        direction,
      ],
    });
    touching = true;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: wheel.x + wheel.width / 2,
          y: wheel.y + wheel.height * 0.85,
          id: 1,
        },
        direction,
      ],
    });
    await expect
      .poll(() => page.locator("#steerRange").evaluate((e) => Number(e.value)))
      .toBeGreaterThan(70);
    await expect
      .poll(() =>
        page
          .locator("#travelReadout")
          .evaluate((e) => parseFloat(e.textContent)),
      )
      .toBeGreaterThan(0.1);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    touching = false;
    await page.keyboard.press("Escape");
    expect(await page.locator("#driveButtonText").textContent()).not.toBe(
      "멈추기",
    );
  } finally {
    if (touching)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
    await cdp.detach();
  }
});
