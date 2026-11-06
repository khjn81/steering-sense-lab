import { test, expect } from "@playwright/test";
test("moving path updates reuse native graphics buffers after warmup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__allocatedBuffers = 0;
    const native = WebGL2RenderingContext.prototype.createBuffer;
    WebGL2RenderingContext.prototype.createBuffer = function (...args) {
      window.__allocatedBuffers++;
      return native.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  await page.locator("#scenarioSelect").selectOption("free");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = await page.evaluate(() => window.__allocatedBuffers);
  await page.locator("#forwardGear").click();
  await expect
    .poll(() =>
      page.locator("#travelReadout").evaluate((e) => parseFloat(e.textContent)),
    )
    .toBeGreaterThan(0.3);
  await page.locator("#driveButton").click();
  const created =
    (await page.evaluate(() => window.__allocatedBuffers)) - before;
  expect(created).toBeLessThanOrEqual(2);
});
test("a stationary visible2D fallback avoids redundant canvas painting", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : native.call(this, type, ...args);
    };
    window.__fallbackPaints = 0;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      window.__fallbackPaints++;
      return fill.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  await page.waitForLoadState("networkidle");
  const before = await page.evaluate(() => window.__fallbackPaints);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.__fallbackPaints)).toBe(before);
  await page.locator("#steerRange").focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => page.evaluate(() => window.__fallbackPaints))
    .toBeGreaterThan(before);
});
