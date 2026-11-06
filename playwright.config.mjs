import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 20000, expect: { timeout: 7000 }, globalTimeout: 180000,
  workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4190', channel: 'chromium', trace: 'off', screenshot: 'only-on-failure', actionTimeout: 5000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
  ],
  webServer: { command: 'python3 serve.py --port 4190', url: 'http://127.0.0.1:4190', reuseExistingServer: false, timeout: 10000 },
});
