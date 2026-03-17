import { defineConfig, devices } from '@playwright/test';

/**
 * Live-node Playwright configuration.
 * Assumes Docker containers are already running:
 *   - Wallet web:  http://localhost:3250
 *   - Node RPC:    http://localhost:8634
 *
 * Run with:
 *   npx playwright test --config apps/web/wallet/playwright.live.config.ts
 *
 * No webServer block — tests skip gracefully when the stack is down.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/live-*.spec.ts', '**/smoke.spec.ts'],

  // Live tests are slower; each test gets a full minute.
  timeout: 60 * 1000,

  // Sequential — live tests mutate shared node state (wallets, chain).
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: [
    ['html', { outputFolder: 'playwright-report-live', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3250',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'live-node',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — Docker containers must already be running.
});
