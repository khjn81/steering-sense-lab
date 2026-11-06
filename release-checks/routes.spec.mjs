import { test, expect } from "@playwright/test";
for (const id of ["apt-bay", "apt-pillar", "apt-traffic"])
  test(`real-time model route reaches completion: ${id}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#sceneLoading")).toBeHidden();
    await page.locator("#scenarioSelect").selectOption(id);
    await page.locator("#modelButton").click();
    await expect(page.locator("#practiceStatus")).toHaveText("보기 완료", {
      timeout: 39000,
    });
    await expect(page.locator("#sceneNoticeText")).not.toContainText(
      "접촉 전에",
    );
    await page.locator("#practiceButton").click();
    await expect(page.locator("#practiceStatus")).toHaveText("직접 연습");
    await expect(page.locator("#travelReadout")).toHaveText("0.0 m");
  });
