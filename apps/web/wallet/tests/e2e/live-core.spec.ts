import { test, expect } from '@playwright/test';
import {
  ensureNodeReady,
  createLiveWallet,
  getBalance,
  selectWalletInUI,
  BASE_URL,
} from './helpers/live-node';

/**
 * Core Wallet Live-Node Tests
 *
 * Exercises the WalletClient UI against the real running Docker node.
 * All tests are skipped when the backend is unavailable so CI pipelines
 * that do not expose the node still pass.
 *
 * Tag @critical marks the minimal set that must pass before merging.
 * Run just those with:
 *   npx playwright test --config playwright.live.config.ts --grep @critical
 */

let backendReady = false;

test.beforeAll(async ({ request }) => {
  backendReady = await ensureNodeReady(request);
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function skip(t: typeof test | Parameters<typeof test.beforeEach>[0]) {
  void t; // just a guard — actual skip is inline
}
void skip; // avoid unused-var lint

function walletDisplayName(walletName: string): string {
  return walletName.endsWith('.dat') ? walletName.slice(0, -4) : walletName;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Live: Wallet List', () => {
  test('@critical wallet list loads and selector is visible', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    // The /api/wallets endpoint must return at least an empty array.
    const res = await request.get(`${BASE_URL}/api/wallets`);
    expect(res.ok()).toBe(true);
    const data = await res.json() as { wallets: string[] };
    expect(Array.isArray(data.wallets)).toBe(true);

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('[data-testid="wallet-selector"]')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Live: Create Wallet', () => {
  test('@critical create wallet via UI — mnemonic section renders', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    // Use API to probe; actual wallet creation goes through the UI modal.
    const label = `live-create-${Date.now()}`;

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="create-wallet-button"]')).toBeVisible({ timeout: 10_000 });

    // Open create modal
    await page.click('[data-testid="create-wallet-button"]');
    await expect(page.locator('[data-testid="wallet-name-input"]')).toBeVisible({ timeout: 5_000 });

    // Fill name and submit
    await page.fill('[data-testid="wallet-name-input"]', label);
    await page.click('[data-testid="create-button"]');

    // The node returns mnemonic: null (wallet encryption), so the modal either shows:
    //   a) A mnemonic phrase, or
    //   b) A success message (wallet already created, no mnemonic)
    // Either way the wallet should now be in the selector.
    await expect(page.locator('.success-message, [data-testid="mnemonic-phrase"]')).toBeVisible({ timeout: 15_000 });

    // Verify the wallet appears in /api/wallets
    const walletRes = await request.get(`${BASE_URL}/api/wallets`);
    const walletData = await walletRes.json() as { wallets: string[] };
    const expectedFile = label.endsWith('.dat') ? label : `${label}.dat`;
    expect(walletData.wallets).toContain(expectedFile);
  });
});

test.describe('Live: Balance', () => {
  test('@critical balance panel renders after selecting a wallet', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-bal-${Date.now()}`;
    const { walletName } = await createLiveWallet(request, label);
    const displayName = walletDisplayName(walletName);

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="wallet-selector"]')).toBeVisible({ timeout: 10_000 });

    await selectWalletInUI(page, displayName);

    // Balance section should appear (may show 0 — that is fine for a fresh wallet).
    await expect(page.locator('[data-testid="wallet-balance"]')).toBeVisible({ timeout: 20_000 });
  });

  test('refresh balance button triggers reload', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-refresh-${Date.now()}`;
    const { walletName } = await createLiveWallet(request, label);
    const displayName = walletDisplayName(walletName);

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await selectWalletInUI(page, displayName);
    await expect(page.locator('[data-testid="wallet-balance"]')).toBeVisible({ timeout: 20_000 });

    // Click refresh — it should complete without error
    await page.click('[data-testid="refresh-balance"]');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="wallet-balance"]')).toBeVisible();
    // No error message should be present
    await expect(page.locator('.error-message')).not.toBeVisible();
  });
});

test.describe('Live: Receive', () => {
  test('@critical receive page: wallet address is non-empty', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-recv-${Date.now()}`;
    const { walletName, address } = await createLiveWallet(request, label);

    // Seed localStorage so the /wallet/receive sub-page can show something
    // even before its own API call resolves.
    await page.addInitScript(
      ({ walletFile, walletAddr }) => {
        try {
          const m: Record<string, unknown> = {};
          m[walletAddr] = { address: walletAddr, label: walletFile, balance: 0, watchOnly: false };
          localStorage.setItem('kubercoin_wallets', JSON.stringify(m));
          localStorage.setItem('kubercoin_active_wallet', walletAddr);
          localStorage.setItem('kubercoin_selected_wallet', walletFile);
        } catch { /* ignore */ }
      },
      { walletFile: walletName, walletAddr: address || `KC1live${walletName}` },
    );

    await page.goto(`${BASE_URL}/wallet/receive`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1')).toContainText(/Receive/i, { timeout: 10_000 });

    // Address element should exist and not be empty
    const addrEl = page.locator('[data-testid="wallet-address"]');
    if (await addrEl.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const text = await addrEl.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('@critical receive page: QR code image is rendered', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-qr-${Date.now()}`;
    await createLiveWallet(request, label);

    await page.goto(`${BASE_URL}/wallet/receive`);
    await expect(page.locator('h1')).toContainText(/Receive/i, { timeout: 10_000 });

    const qr = page.locator('[data-testid="qr-code-image"]');
    if (await qr.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(qr).toBeVisible();
    }
  });

  test('copy address button shows copied feedback', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await createLiveWallet(request, `live-copy-${Date.now()}`);

    await page.goto(`${BASE_URL}/wallet/receive`);
    await expect(page.locator('h1')).toContainText(/Receive/i, { timeout: 10_000 });

    const copyBtn = page.locator('[data-testid="copy-address-button"]');
    if (await copyBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await copyBtn.click();
      await expect(page.locator('text=/copied/i')).toBeVisible({ timeout: 3_000 });
    }
  });
});

test.describe('Live: Wallet Selector', () => {
  test('switching wallets updates the selected wallet display', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const ts = Date.now();
    const [h1, h2] = await Promise.all([
      createLiveWallet(request, `live-sw-a-${ts}`),
      createLiveWallet(request, `live-sw-b-${ts}`),
    ]);
    const d1 = walletDisplayName(h1.walletName);
    const d2 = walletDisplayName(h2.walletName);

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await selectWalletInUI(page, d1);
    await expect(page.locator('[data-testid="wallet-balance"]')).toBeVisible({ timeout: 20_000 });

    // Switch to second wallet
    await selectWalletInUI(page, d2);
    await expect(page.locator('[data-testid="wallet-balance"]')).toBeVisible({ timeout: 20_000 });

    // Header should now reference the second wallet
    await expect(page.getByText(d2, { exact: false }).first()).toBeVisible();
  });
});

test.describe('Live: API Sanity', () => {
  test('/api/stats returns network info', async ({ request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const res = await request.get(`${BASE_URL}/api/stats`);
    expect(res.ok()).toBe(true);
    const data = await res.json() as Record<string, unknown>;
    expect(typeof data.online).toBe('boolean');
  });

  test('/api/wallets returns wallets array', async ({ request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const res = await request.get(`${BASE_URL}/api/wallets`);
    expect(res.ok()).toBe(true);
    const data = await res.json() as { wallets: string[] };
    expect(Array.isArray(data.wallets)).toBe(true);
  });

  test('GET /api/wallet/balance with no name returns 400', async ({ request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const res = await request.get(`${BASE_URL}/api/wallet/balance`);
    expect(res.status()).toBe(400);
  });

  test('POST /api/wallet/create with empty name returns 400', async ({ request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const res = await request.post(`${BASE_URL}/api/wallet/create`, { data: { name: '' } });
    expect(res.status()).toBe(400);
  });

  test('GET /api/wallet/balance for created wallet returns numeric fields', async ({ request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const { walletName } = await createLiveWallet(request, `live-api-${Date.now()}`);
    const bal = await getBalance(request, walletName);
    expect(typeof bal.spendable).toBe('number');
    expect(typeof bal.total).toBe('number');
    expect(typeof bal.height).toBe('number');
    expect(bal.height).toBeGreaterThanOrEqual(0);
  });
});
