import { test, expect } from '@playwright/test';

async function isWalletBackendReady(request: { get: (url: string, options?: { timeout?: number }) => Promise<{ ok: () => boolean; json: () => Promise<any> }> }): Promise<boolean> {
  try {
    const response = await request.get('http://localhost:3250/api/status', { timeout: 2000 });
    if (!response.ok()) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

async function getWalletList(request: { get: (url: string, options?: { timeout?: number }) => Promise<{ ok: () => boolean; json: () => Promise<any> }> }): Promise<string[]> {
  try {
    const response = await request.get('http://localhost:3250/api/wallets', { timeout: 2000 });
    if (!response.ok()) return [];
    const data = await response.json().catch(() => null);
    return Array.isArray(data?.wallets) ? data.wallets : [];
  } catch {
    return [];
  }
}

test.describe('Wallet Web', () => {
  let backendReady = false;

  test.beforeAll(async ({ request }) => {
    backendReady = await isWalletBackendReady(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3250');
  });

  test('should load wallet interface', async ({ page }) => {
    await expect(page).toHaveTitle(/KuberCoin Wallet/);
    await expect(page.locator('h1')).toContainText('Wallet');
  });

  test('should create new wallet', async ({ page }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    await page.locator('[data-testid="create-wallet-button"]').click();
    
    const walletNameInput = page.locator('[data-testid="wallet-name-input"]');
    await walletNameInput.fill('test-wallet-' + Date.now());
    
    await page.locator('[data-testid="create-button"]').click();
    
    // Should show success message
    await expect(page.locator('.success-message')).toBeVisible();
    
    // Should display mnemonic
    const mnemonic = page.locator('[data-testid="mnemonic-phrase"]');
    await expect(mnemonic).toBeVisible();
    const mnemonicText = await mnemonic.textContent();
    expect(mnemonicText?.split(' ').length).toBe(24);
  });

  test('should display wallet balance', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    // Select existing wallet
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    // Load balance
    await page.locator('[data-testid="refresh-balance"]').click();
    
    // Should display balance
    const balanceElement = page.locator('[data-testid="wallet-balance"]');
    await expect(balanceElement).toBeVisible({ timeout: 5000 });
    
    const balance = await balanceElement.textContent();
    expect(balance).toMatch(/\d+ KC/);
  });

  test('should send transaction', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    // Select wallet with balance
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    // Fill send form
    const toAddress = 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8'; // Example testnet address
    const amount = '1000';
    
    await page.locator('[data-testid="to-address"]').fill(toAddress);
    await page.locator('[data-testid="amount"]').fill(amount);
    
    // Send transaction
    await page.locator('[data-testid="send-button"]').click();
    
    // Should show confirmation dialog
    await expect(page.locator('.confirmation-dialog')).toBeVisible();
    
    // Confirm
    await page.locator('[data-testid="confirm-send"]').click();
    
    // Should show success with txid
    await expect(page.locator('.transaction-success')).toBeVisible({ timeout: 15000 });
    const txid = await page.locator('[data-testid="transaction-id"]').textContent();
    expect(txid).toMatch(/^[0-9a-f]{64}$/);
  });

  test('should validate address format', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    // Enter invalid address
    await page.locator('[data-testid="to-address"]').fill('invalid-address');
    await page.locator('[data-testid="amount"]').fill('1000');
    await page.locator('[data-testid="send-button"]').click();
    
    // Should show error
    await expect(page.locator('.error-message')).toContainText('Invalid address');
  });

  test('should show transaction history', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    await page.locator('[data-testid="history-tab"]').click();
    
    const historyList = page.locator('[data-testid="transaction-history"]');
    await expect(historyList).toBeVisible();
    
    // Check if transactions are displayed
    const txItems = historyList.locator('.transaction-item');
    const count = await txItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should export wallet backup', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    await page.locator('[data-testid="settings-menu"]').click();
    
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-backup"]').click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});

test.describe('Wallet Security', () => {
  let backendReady = false;

  test.beforeAll(async ({ request }) => {
    backendReady = await isWalletBackendReady(request);
  });

  test('should require confirmation for large transactions', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    await page.goto('http://localhost:3250');
    
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    // Try to send large amount
    await page.locator('[data-testid="to-address"]').fill('mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8');
    await page.locator('[data-testid="amount"]').fill('1000000');
    await page.locator('[data-testid="send-button"]').click();
    
    // Should show extra confirmation
    await expect(page.locator('.large-amount-warning')).toBeVisible();
  });

  test('should not expose private keys in UI', async ({ page, request }) => {
    test.skip(!backendReady, 'Wallet backend is unavailable');
    const wallets = await getWalletList(request);
    test.skip(wallets.length === 0, 'No wallets available');
    await page.goto('http://localhost:3250');
    
    await page.locator('[data-testid="wallet-selector"]').click();
    await page.locator('[data-testid="wallet-option"]').first().click();
    
    // Check page content
    const content = await page.content();
    expect(content).not.toMatch(/private.*key/i);
  });
});
