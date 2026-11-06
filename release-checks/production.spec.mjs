import { test, expect } from "@playwright/test";
test("public runtime supports a complete visit through pointer or actual touch input", async ({
  page,
  request,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const activate = (locator) =>
    info.project.use.hasTouch ? locator.tap() : locator.click();
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  await page.screenshot({ path: info.outputPath("garage.png") });
  await page.locator("#scenarioSelect").selectOption("apt-pillar");
  await activate(page.locator("#viewFollow"));
  await expect(page.locator("#viewFollow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await activate(page.locator("#modelButton"));
  await expect(page.locator("#practiceStatus")).toHaveText("보는 중");
  await activate(page.locator("#modelButton"));
  await expect(page.locator("#practiceStatus")).toHaveText("일시 정지");
  await activate(page.locator("#practiceButton"));
  await page.locator("#scenarioSelect").selectOption("free");
  await activate(page.locator("#reverseGear"));
  await expect
    .poll(() =>
      page.locator("#travelReadout").evaluate((e) => parseFloat(e.textContent)),
    )
    .toBeGreaterThan(0.1);
  await activate(page.locator("#driveButton"));
  await expect(page.locator("#timeline")).toBeEnabled();
  await activate(page.locator("#aboutButton"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#aboutButton")).toBeFocused();
  const root = await request.get("/");
  expect(root.headers()["content-security-policy"]).toContain(
    "connect-src 'self'",
  );
  expect((await request.get("/serve.py")).status()).toBe(404);
  expect(errors).toEqual([]);
});
