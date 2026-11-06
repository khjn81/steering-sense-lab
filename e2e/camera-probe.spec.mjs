import { test, expect } from '@playwright/test';
import { installCameraFixture } from './helpers/camera.mjs';
async function enterCamera(page, options) {
  await installCameraFixture(page, options);
  await page.goto('/'); await expect(page.locator('#sceneLoading')).toBeHidden();
  await page.locator('#scenarioSelect').selectOption('free');
  await page.locator('#cameraButton').click();
  await expect(page.locator('#calibrateButton')).toBeEnabled();
}

test('unstable synthetic hands cannot produce a false calibration success message', async ({ page }) => {
  await enterCamera(page, { unstable: true });
  await page.locator('#calibrateButton').click();
  await expect(page.locator('#cameraStatus')).toHaveText('잠깐 가만히 있어요');
  expect(await page.locator('#runStatus').textContent()).not.toContain('맞췄어요');
  await expect(page.locator('#reverseGear')).toBeDisabled();
});

test('stable synthetic hands calibrate and stopping releases the owned video and worker', async ({ page }) => {
  await enterCamera(page);
  await page.locator('#calibrateButton').click();
  await expect(page.locator('#cameraStatus')).toHaveText('손으로 조작 중');
  await page.locator('#reverseGear').click();
  await expect(page.locator('#driveButtonText')).toHaveText('멈추기');
  await page.locator('#stopCamera').click();
  await expect(page.locator('#steerRange')).toBeEnabled();
  expect(await page.locator('#handVideo').evaluate(v => v.srcObject)).toBeNull();
  const resources = await page.evaluate(() => window.__cameraFixture);
  expect(resources.stoppedTracks).toBeGreaterThan(0); expect(resources.stoppedWorkers).toBeGreaterThan(0);
});
