import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./release-checks",
  outputDir: "./test-results-release",
  timeout: 45000,
  expect: { timeout: 10000 },
  globalTimeout: 240000,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results-release/summary.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4195",
    trace: "off",
    screenshot: "only-on-failure",
    actionTimeout: 7000,
  },
  projects: [
    {
      name: "chromium-production",
      testMatch: ["**/production.spec.mjs", "**/routes.spec.mjs"],
      use: {
        browserName: "chromium",
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "touch-production",
      testMatch: "**/production.spec.mjs",
      use: {
        browserName: "chromium",
        channel: "chromium",
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: "webkit-production",
      testMatch: "**/production.spec.mjs",
      use: { browserName: "webkit", viewport: { width: 1024, height: 768 } },
    },
  ],
  webServer: {
    command: "python3 serve.py --port 4195",
    url: "http://127.0.0.1:4195",
    reuseExistingServer: false,
    timeout: 10000,
  },
});
