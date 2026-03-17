import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3250',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start a production-like server for E2E (more stable than `next dev`).
  // This makes the run behave closer to a real user hitting a deployed app.
  webServer: {
    command: 'node scripts/playwright_webserver.mjs',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3250',
    reuseExistingServer: !process.env.CI,
    timeout: 300 * 1000,
  },
});
