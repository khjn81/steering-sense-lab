import { test, expect } from "@playwright/test";
test("native graphics loss releases the old scene and preserves a resizable manual fallback", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  await page.locator("#scenarioSelect").selectOption("free");
  await page.locator("#reverseGear").click();
  await page
    .locator("#scene canvas")
    .evaluate((canvas) =>
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
  await expect(page.locator("#view3d")).toBeDisabled();
  expect(await page.locator("#driveButtonText").textContent()).not.toBe(
    "멈추기",
  );
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.locator("#scene canvas")).toHaveCount(1);
  await page.locator("#reverseGear").click();
  await expect(page.locator("#driveButtonText")).toHaveText("멈추기");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
