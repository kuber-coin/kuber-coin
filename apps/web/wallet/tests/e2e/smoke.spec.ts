import { test, expect } from '@playwright/test';
import { buildLocalStorageWallet, BASE_URL } from './helpers/live-node';

/**
 * Navigation Smoke Tests — /wallet/* sub-pages
 *
 * Verifies every known wallet sub-page:
 *   1. Loads without a JavaScript crash
 *   2. Renders a visible <h1> or <main> element
 *   3. Does not show a Next.js unhandled-error overlay
 *
 * Tests use offline localStorage seeding — no live node required.
 * This suite can run in isolation on any machine with the wallet
 * docker image running on port 3250.
 */

// ---------------------------------------------------------------------------
// Sub-pages under /wallet/*
// ---------------------------------------------------------------------------
const WALLET_SUB_PAGES = [
  'dashboard',
  'send',
  'receive',
  'manage',
  'history',
  'multisig',
  'cold-storage',
  'swaps',
  'staking',
  'defi',
  'nfts',
  'privacy',
  'lightning',
  'utxos',
  'fees',
  'address-book',
  'addresses',
  'analytics',
  'audit',
  'backup',
  'backup-recovery',
  'batch-send',
  'contracts',
  'faucet',
  'hardware',
  'import-export',
  'key-manager',
  'mobile',
  'network',
  'notifications',
  'portfolio',
  'price',
  'rebalance',
  'schedule',
  'security',
  'settings',
  'tax',
  'templates',
  'tx-builder',
  'watch-only',
] as const;

// Top-level app pages (outside /wallet/)
const TOP_LEVEL_PAGES = [
  '/',
  '/wallet/send',
  '/wallet/receive',
  '/transactions',
  '/settings',
  '/onboarding',
  '/landing',
  '/showcase',
] as const;

// ---------------------------------------------------------------------------
// Shared localStorage seed
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  const { walletsMap, activeAddress } = buildLocalStorageWallet('Smoke Wallet');
  await page.addInitScript(
    ({ initWalletsMap, initActiveAddress }) => {
      try {
        localStorage.setItem('kubercoin_wallets', JSON.stringify(initWalletsMap));
        localStorage.setItem('kubercoin_active_wallet', initActiveAddress);
        localStorage.setItem('kubercoin_selected_wallet', initActiveAddress);
      } catch { /* ignore */ }
    },
    { initWalletsMap: walletsMap, initActiveAddress: activeAddress },
  );
});

// ---------------------------------------------------------------------------
// Error overlay detector
// ---------------------------------------------------------------------------

async function hasNextErrorOverlay(page: Parameters<Parameters<typeof test>[1]>[0]): Promise<boolean> {
  // Next.js dev error overlay — should NOT appear in production builds.
  return page.locator('nextjs-portal, [data-nextjs-dialog-overlay]').isVisible({ timeout: 500 }).catch(() => false);
}

// ---------------------------------------------------------------------------
// Smoke: /wallet/* sub-pages
// ---------------------------------------------------------------------------

test.describe('Smoke: /wallet/* sub-pages', () => {
  for (const slug of WALLET_SUB_PAGES) {
    test(`/wallet/${slug} — loads without crash`, async ({ page }) => {
      const url = `${BASE_URL}/wallet/${slug}`;

      // Collect console errors
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      // Collect unhandled page errors
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Page must not show Next.js error overlay
      const overlay = await hasNextErrorOverlay(page);
      expect(overlay, `Error overlay visible on /wallet/${slug}`).toBe(false);

      // At least one visible block-level element
      const mainOrH1 = page.locator('h1, main').first();
      await expect(mainOrH1).toBeVisible({ timeout: 15_000 });

      // Must not have unhandled page errors
      expect(
        pageErrors.filter((e) => !e.includes('ResizeObserver') && !e.includes('Non-Error')),
        `Unhandled page errors on /wallet/${slug}: ${pageErrors.join('; ')}`,
      ).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Smoke: top-level pages
// ---------------------------------------------------------------------------

test.describe('Smoke: top-level pages', () => {
  for (const path of TOP_LEVEL_PAGES) {
    test(`${path} — loads without crash`, async ({ page }) => {
      const url = `${BASE_URL}${path}`;

      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const overlay = await hasNextErrorOverlay(page);
      expect(overlay, `Error overlay visible on ${path}`).toBe(false);

      const mainOrH1 = page.locator('h1, main, [class*="container"]').first();
      await expect(mainOrH1).toBeVisible({ timeout: 15_000 });

      expect(
        pageErrors.filter((e) => !e.includes('ResizeObserver') && !e.includes('Non-Error')),
        `Unhandled page errors on ${path}: ${pageErrors.join('; ')}`,
      ).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Smoke: page titles and meta
// ---------------------------------------------------------------------------

test.describe('Smoke: page metadata', () => {
  test('root page has KuberCoin in title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/KuberCoin/i, { timeout: 10_000 });
  });

  test('wallet selector is present on root page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    // The wallet selector should always be rendered — even with no wallets loaded
    // because the WalletClient renders the selector section unconditionally.
    await expect(page.locator('[data-testid="wallet-selector"]')).toBeVisible({ timeout: 10_000 });
  });

  test('create wallet button is present on root page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="create-wallet-button"]')).toBeVisible({ timeout: 10_000 });
  });
});
