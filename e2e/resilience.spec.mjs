import { test, expect } from '@playwright/test';
async function enter(page) { await page.goto('/'); await expect(page.locator('#sceneLoading')).toBeHidden(); }

test('help dialog blocks driving shortcuts and restores focus on Escape', async ({ page }) => {
  await enter(page); await page.locator('#aboutButton').click();
  await expect(page.locator('#aboutDialog')).toBeVisible();
  await page.keyboard.down('w');
  expect(await page.locator('#driveButtonText').textContent()).not.toBe('멈추기');
  await page.keyboard.up('w'); await page.keyboard.press('Escape');
  await expect(page.locator('#aboutButton')).toBeFocused();
});

test('native range ArrowUp adjusts steering without starting the vehicle', async ({ page }) => {
  await enter(page); await page.locator('#steerRange').focus(); await page.keyboard.press('ArrowUp');
  expect(Number(await page.locator('#steerRange').inputValue())).toBe(1);
  expect(await page.locator('#travelReadout').textContent()).toBe('0.0 m');
});

test('Escape immediately stops a manually moving vehicle', async ({ page }) => {
  await enter(page); await page.locator('#reverseGear').click(); await page.keyboard.press('Escape');
  expect(await page.locator('#driveButtonText').textContent()).not.toBe('멈추기');
});

test('pagehide pauses a model demonstration before page-cache restoration', async ({ page }) => {
  await enter(page); await page.locator('#modelButton').click();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  expect(await page.locator('#practiceStatus').textContent()).toBe('일시 정지');
});

test('hidden documents stop drawing the 2D fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : native.call(this, type, ...args); };
    window.__paintCount = 0;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(...args) { window.__paintCount++; return fill.apply(this, args); };
  });
  await enter(page); await expect(page.locator('#view3d')).toBeDisabled();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = await page.evaluate(() => window.__paintCount);
  await page.waitForTimeout(180); // Bounded draw interval, not a loading wait.
  expect(await page.evaluate(() => window.__paintCount)).toBe(before);
});

test('graphics context loss stops motion and enables the usable 2D fallback', async ({ page }) => {
  await enter(page);
  await page.locator('#scene canvas').evaluate(c => c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('#view3d')).toBeDisabled();
  await expect(page.locator('#scene canvas')).toBeVisible();
  await expect(page.locator('#runStatus')).toContainText('2D');
});

test('camera permission denial restores manual controls with useful feedback', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denial', 'NotAllowedError'); }; });
  await enter(page); await page.locator('#cameraButton').click();
  await expect(page.locator('#cameraError')).toContainText('권한');
  await expect(page.locator('#cameraButton')).toBeEnabled();
  await expect(page.locator('#steerRange')).toBeEnabled();
  await expect(page.locator('#reverseGear')).toBeEnabled();
});

test('primary touch targets are reachable and at least44 pixels', async ({ page }) => {
  await enter(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const id of ['aboutButton','reverseGear','forwardGear','driveButton','modelButton','cameraButton']) {
    await page.locator('#'+id).scrollIntoViewIfNeeded();
    const b = await page.locator('#'+id).boundingBox();
    expect(b.width, id).toBeGreaterThanOrEqual(44); expect(b.height, id).toBeGreaterThanOrEqual(44);
  }
});
