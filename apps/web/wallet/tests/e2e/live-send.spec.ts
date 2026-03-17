import { test, expect } from '@playwright/test';
import {
  ensureNodeReady,
  createLiveWallet,
  findFundedWallet,
  getBalance,
  fundWallet,
  sendFromWallet,
  selectWalletInUI,
  BASE_URL,
} from './helpers/live-node';

/**
 * Send Transaction Live-Node Tests
 *
 * Exercises the WalletClient send flow against the real running Docker node.
 * The "with funds" describe block funds a sender wallet by mining 101 blocks
 * via generatetoaddress before running send tests.
 *
 * All tests skip gracefully when the backend is unavailable.
 */

let backendReady = false;

test.beforeAll(async ({ request }) => {
  backendReady = await ensureNodeReady(request);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(walletName: string): string {
  return walletName.endsWith('.dat') ? walletName.slice(0, -4) : walletName;
}

/**
 * Navigate to root, select the given wallet, wait for balance to load,
 * then click the "Send" tab so the send form is visible.
 */
async function openSendTab(
  page: Parameters<Parameters<typeof test>[1]>[0],
  walletDisplayName: string,
) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="wallet-selector"]').waitFor({ state: 'visible', timeout: 10_000 });

  await selectWalletInUI(page, walletDisplayName);

  // Wait for balance to load
  await page.locator('[data-testid="wallet-balance"]').waitFor({ state: 'visible', timeout: 25_000 });

  // Send tab is already active by default after wallet selection, but assert robustly
  await page.locator('[data-testid="to-address"]').waitFor({ state: 'visible', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Validation tests (no live funds needed)
// ---------------------------------------------------------------------------

test.describe('Send: Validation', () => {
  let walletDisp = '';
  let validRecipientAddress = '';

  test.beforeAll(async ({ request }) => {
    if (!backendReady) return;
    const ts = Date.now();
    const [h, r] = await Promise.all([
      createLiveWallet(request, `live-val-${ts}`),
      createLiveWallet(request, `live-val-r-${ts}`),
    ]);
    walletDisp = displayName(h.walletName);
    validRecipientAddress = r.address;
  });

  test('@critical shows "Invalid address" for address shorter than 5 chars', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    // 'abc' is only 3 chars — fails isLikelyAddress length check
    await page.fill('[data-testid="to-address"]', 'abc');
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.error-message')).toContainText(/invalid address/i, { timeout: 5_000 });
  });

  test('shows "Invalid address" for address containing spaces', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    await page.fill('[data-testid="to-address"]', 'bad address here');
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.error-message')).toContainText(/invalid address/i, { timeout: 5_000 });
  });

  test('shows "Invalid address" for address containing special characters', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    await page.fill('[data-testid="to-address"]', 'addr@bad!');
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.error-message')).toContainText(/invalid address/i, { timeout: 5_000 });
  });

  test('shows "Invalid amount" for zero amount', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    await page.fill('[data-testid="to-address"]', 'KC1validlooking99xyzabc');
    await page.fill('[data-testid="amount"]', '0');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.error-message')).toContainText(/invalid amount/i, { timeout: 5_000 });
  });

  test('shows "Invalid amount" for negative amount', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    await page.fill('[data-testid="to-address"]', 'KC1validlooking99xyzabc');
    await page.fill('[data-testid="amount"]', '-500');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.error-message')).toContainText(/invalid amount/i, { timeout: 5_000 });
  });

  test('confirm modal opens for valid address + positive amount', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    await openSendTab(page, walletDisp);

    // A valid-looking address passes the isLikelyAddress check → confirm modal opens.
    // The actual send may fail (no funds) but the confirm dialog must appear.
    await page.fill('[data-testid="to-address"]', 'KC1validlooking99xyzabc');
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.confirmation-dialog')).toBeVisible({ timeout: 5_000 });
    // Cancel to avoid an error from the unfunded wallet
    await page.locator('button:has-text("Cancel")').click();
  });

  test('insufficient funds error when unfunded wallet tries to send', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');
    test.skip(!validRecipientAddress, 'No valid recipient address available');

    await openSendTab(page, walletDisp);

    // Use a real node address so the node validates the address and reaches the funds check.
    await page.fill('[data-testid="to-address"]', validRecipientAddress);
    await page.fill('[data-testid="amount"]', '100000');
    await page.click('[data-testid="send-button"]');

    // Confirm modal must appear first
    await expect(page.locator('.confirmation-dialog')).toBeVisible({ timeout: 5_000 });
    await page.click('[data-testid="confirm-send"]');

    // Node RPC returns an error — accepts any send-failure message
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Happy-path send with live funds
// ---------------------------------------------------------------------------

test.describe('Send: With Live Funds', () => {
  let senderDisp = '';
  let senderWalletName = '';
  let recipientAddress = '';
  let initialSpendable = 0;
  let hasFunds = false;

  test.beforeAll(async ({ request }) => {
    // Mining 101 blocks can take >60 s on the testnet node.
    test.setTimeout(180_000);
    if (!backendReady) return;

    const ts = Date.now();
    const [sender, recipient] = await Promise.all([
      createLiveWallet(request, `live-send-from-${ts}`),
      createLiveWallet(request, `live-send-to-${ts}`),
    ]);

    senderWalletName = sender.walletName;
    senderDisp = displayName(senderWalletName);
    recipientAddress = recipient.address;

    // Prefer an existing funded wallet to avoid slow 101-block mining during
    // live E2E runs. Fall back to mining only when no funded wallet exists.
    try {
      if (sender.address) {
        const fundedWallet = await findFundedWallet(request, 2000, [senderWalletName]);
        if (fundedWallet) {
          await sendFromWallet(request, fundedWallet, sender.address, 100000);
          await fundWallet(request, recipientAddress || sender.address, 1);
        } else {
          const fundAddr = sender.address || recipientAddress;
          await fundWallet(request, fundAddr, 101);
        }
      } else {
        await fundWallet(request, recipientAddress, 101);
      }
    } catch {
      // fundWallet failure is non-fatal here — hasFunds check below handles it.
    }

    // Confirm spendable balance is > 0 before proceeding
    try {
      const bal = await getBalance(request, senderWalletName);
      initialSpendable = bal.spendable;
      hasFunds = initialSpendable > 0;
    } catch {
      hasFunds = false;
    }
  });

  test('@critical happy path: send 1000 satoshis, TXID appears', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');
    test.skip(!hasFunds, 'Sender wallet has no funds — mining may have failed');

    await openSendTab(page, senderDisp);

    await page.fill('[data-testid="to-address"]', recipientAddress);
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');

    // Confirm dialog
    await expect(page.locator('.confirmation-dialog')).toBeVisible({ timeout: 5_000 });
    await page.click('[data-testid="confirm-send"]');

    // Success: TXID renders (64-char hex)
    await expect(page.locator('[data-testid="transaction-id"]').first()).toBeVisible({ timeout: 15_000 });
    const txidText = await page.locator('[data-testid="transaction-id"]').first().textContent();
    expect(txidText?.trim()).toMatch(/^[a-f0-9]{64}$/i);

    // Success message
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('balance decreases after send', async ({ page, request }) => {
    test.setTimeout(120_000); // allows time for mining confirmation blocks
    test.skip(!backendReady, 'Node backend unavailable');
    test.skip(!hasFunds, 'Sender wallet has no funds');

    // Use initialSpendable (from beforeAll) as the "before" baseline —
    // avoids a back-to-back wallet unload/load race between getBalance + send.
    const before = initialSpendable;

    // Mine 1 block first so any pending tx from earlier tests in this describe
    // (happy-path) is confirmed and removed from the mempool.  Without this the
    // node rejects the next send as "Transaction already in mempool".
    try { await fundWallet(request, recipientAddress, 1); } catch { /* non-fatal */ }

    // Send via API (UI send is already covered by the happy-path test).
    const sendRes = await request.post(`${BASE_URL}/api/wallet/send`, {
      data: { from: senderWalletName, to: recipientAddress, amount: 1000 },
    });
    if (!sendRes.ok()) {
      const errBody = await sendRes.text();
      throw new Error(`send API returned ${sendRes.status()}: ${errBody}`);
    }
    const sendData = await sendRes.json() as { ok: boolean; txid: string };
    expect(sendData.ok).toBe(true);
    expect(sendData.txid).toMatch(/^[a-f0-9]{64}$/i);

    // Mine 1 more block to confirm this transaction.
    try { await fundWallet(request, recipientAddress, 1); } catch { /* non-fatal */ }

    // Poll balance via API until it decreases relative to the initial funding
    // amount (up to ~15 s).
    let after = { spendable: before };
    for (let attempt = 0; attempt < 15; attempt++) {
      await page.waitForTimeout(1000);
      try { after = await getBalance(request, senderWalletName); } catch { /* non-fatal */ }
      if (after.spendable < before) break;
    }

    expect(after.spendable).toBeLessThan(before);
  });

  test('sent transaction appears in history tab', async ({ page, request }) => {
    test.setTimeout(120_000); // allows time for mining 1 confirmation block
    test.skip(!backendReady, 'Node backend unavailable');
    test.skip(!hasFunds, 'Sender wallet has no funds');

    await openSendTab(page, senderDisp);

    await page.fill('[data-testid="to-address"]', recipientAddress);
    await page.fill('[data-testid="amount"]', '1000');
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('.confirmation-dialog')).toBeVisible({ timeout: 5_000 });
    await page.click('[data-testid="confirm-send"]');

    // Get the TXID from the success display
    await expect(page.locator('[data-testid="transaction-id"]').first()).toBeVisible({ timeout: 15_000 });
    const txid = await page.locator('[data-testid="transaction-id"]').first().textContent();

    // Mine 1 block so the transaction is confirmed and appears in listtransactions
    try { await fundWallet(request, recipientAddress, 1); } catch { /* non-fatal */ }

    let historyHasTx = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const historyRes = await request.get(`${BASE_URL}/api/wallet/history`, {
          params: { name: senderWalletName },
        });
        if (historyRes.ok()) {
          const historyData = await historyRes.json() as { transactions?: Array<{ txid?: string }> };
          historyHasTx = Array.isArray(historyData.transactions)
            && historyData.transactions.some((entry) => entry.txid?.toLowerCase() === txid?.trim().toLowerCase());
          if (historyHasTx) {
            break;
          }
        }
      } catch {
        // Retry while the wallet history view catches up.
      }

      await page.waitForTimeout(1000);
    }

    expect(historyHasTx).toBe(true);

    // Switch to history tab
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="wallet-selector"]').waitFor({ state: 'visible', timeout: 10_000 });
    await selectWalletInUI(page, senderDisp);
    await page.locator('[data-testid="wallet-balance"]').waitFor({ state: 'visible', timeout: 25_000 });
    await page.click('[data-testid="history-tab"]');
    await expect(page.locator('[data-testid="transaction-history"]')).toBeVisible({ timeout: 5_000 });

    // The TXID (or at least the first 8 chars) should appear
    const shortTxid = txid?.trim().slice(0, 8) ?? '';
    if (shortTxid) {
      await expect(page.locator(`[data-testid="transaction-history"]:has-text("${shortTxid}")`)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('large amount warning shown for amounts >= 500000 satoshis', async ({ page }) => {
    test.skip(!backendReady, 'Node backend unavailable');
    test.skip(!hasFunds, 'Sender wallet has no funds');

    await openSendTab(page, senderDisp);

    await page.fill('[data-testid="to-address"]', recipientAddress);
    await page.fill('[data-testid="amount"]', '500000');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('.confirmation-dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.large-amount-warning')).toBeVisible({ timeout: 3_000 });

    // Cancel — don't actually drain test funds
    await page.locator('button:has-text("Cancel")').click();
  });
});

// ---------------------------------------------------------------------------
// Send sub-page (dedicated /wallet/send route)
// ---------------------------------------------------------------------------

test.describe('Send: /wallet/send page', () => {
  test('@critical send page loads and shows form fields', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-sendpage-${Date.now()}`;
    const { walletName, address } = await createLiveWallet(request, label);

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
      { walletFile: walletName, walletAddr: address || `KC1x${walletName}` },
    );

    await page.goto(`${BASE_URL}/wallet/send`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('h1')).toContainText(/Send/i, { timeout: 10_000 });
    await expect(page.locator('[data-testid="recipient-address-input"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="amount-input"]')).toBeVisible({ timeout: 10_000 });
  });

  test('send page: blank recipient shows validation error', async ({ page, request }) => {
    test.skip(!backendReady, 'Node backend unavailable');

    const label = `live-sendval-${Date.now()}`;
    const { walletName, address } = await createLiveWallet(request, label);

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
      { walletFile: walletName, walletAddr: address || `KC1x${walletName}` },
    );

    await page.goto(`${BASE_URL}/wallet/send`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="send-transaction-button"]')).toBeVisible({ timeout: 10_000 });

    await page.click('[data-testid="send-transaction-button"]');
    await expect(page.locator('text=/recipient address is required/i')).toBeVisible({ timeout: 5_000 });
  });
});
