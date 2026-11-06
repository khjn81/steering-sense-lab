import { test, expect } from '@playwright/test';
async function enter(page) { await page.goto('/'); await expect(page.locator('#sceneLoading')).toBeHidden(); }
const distance = page => page.locator('#travelReadout').evaluate(el => parseFloat(el.textContent));

test('local first visit offers all parking scenes without external requests or camera use', async ({ page }, info) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4190/') && !r.url().startsWith('data:')) external.push(r.url()); });
  await enter(page);
  for (const id of ['apt-bay','apt-pillar','apt-traffic','free']) {
    await page.locator('#scenarioSelect').selectOption(id);
    await expect(page.locator('#practiceStatus')).toHaveText('직접 연습');
  }
  await expect(page.locator('#cameraStatus')).toHaveText('카메라 꺼짐');
  await expect(page.locator('#scene canvas')).toBeVisible();
  await page.screenshot({ path: info.outputPath('practice.png') });
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('manual steering, forward/reverse, stopping, rewind and replay form a complete visit', async ({ page }) => {
  await enter(page); await page.locator('#scenarioSelect').selectOption('free');
  await page.locator('#steerRange').focus(); await page.keyboard.press('End');
  await page.locator('#reverseGear').click();
  await expect.poll(() => distance(page)).toBeGreaterThan(.1);
  await page.locator('#driveButton').click();
  await expect(page.locator('#timeline')).toBeEnabled();
  await page.locator('#timeline').focus(); await page.keyboard.press('Home');
  await expect(page.locator('#travelReadout')).toHaveText('0.0 m');
  await page.locator('#replayButton').click();
  await expect.poll(() => distance(page)).toBeGreaterThan(0);
  await page.locator('#resetPosition').click();
  await expect(page.locator('#travelReadout')).toHaveText('0.0 m');
});

test('model demonstration can pause and return to direct practice', async ({ page }) => {
  await enter(page); await page.locator('#modelButton').click();
  await expect(page.locator('#practiceStatus')).toHaveText('보는 중');
  await page.locator('#modelButton').click();
  await expect(page.locator('#practiceStatus')).toHaveText('일시 정지');
  await page.locator('#practiceButton').click();
  await expect(page.locator('#practiceStatus')).toHaveText('직접 연습');
  await expect(page.locator('#travelReadout')).toHaveText('0.0 m');
});

test('a prediction quiz reveals movement and a review before the next question', async ({ page }) => {
  await enter(page); await page.locator('#quizMode').click();
  await expect(page.locator('#lessonAction')).toBeDisabled();
  await page.locator('#quizAnswers button').first().click();
  await page.locator('#lessonAction').click();
  await expect(page.locator('#lessonAction')).toContainText('다음 상황');
  await expect(page.locator('#lessonFeedback')).toBeVisible();
  await page.locator('#lessonAction').click();
  await expect(page.locator('#lessonProgress')).toHaveText('2 / 3');
});
