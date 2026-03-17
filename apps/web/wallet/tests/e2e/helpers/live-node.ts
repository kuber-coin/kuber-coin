import type { APIRequestContext, Page } from '@playwright/test';

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3250';
export const NODE_RPC_URL = process.env.KUBERCOIN_NODE_RPC_URL ?? 'http://localhost:8634';

/**
 * The API key used by the test node (set via KUBERCOIN_API_KEYS env var in Docker/tasks).
 * Override with KUBERCOIN_TEST_API_KEY in CI environments.
 */
export const API_KEY =
  process.env.KUBERCOIN_TEST_API_KEY ??
  process.env.KUBERCOIN_API_KEYS ??
  'public_test_key_not_a_secret';

// ---------------------------------------------------------------------------
// Node health
// ---------------------------------------------------------------------------

/**
 * Returns true if the wallet web server and wallet API proxy are reachable.
 *
 * Do not key this off /api/status alone: that route also checks monitoring
 * dependencies and can flap when Grafana/Prometheus or a slow node-health
 * probe is transiently delayed, which causes unrelated wallet live tests to
 * skip even though the wallet API itself is healthy.
 */
export async function ensureNodeReady(request: APIRequestContext): Promise<boolean> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const [statsRes, walletsRes] = await Promise.all([
        request.get(`${BASE_URL}/api/stats`, { timeout: 5000 }),
        request.get(`${BASE_URL}/api/wallets`, { timeout: 10000 }),
      ]);

      if (statsRes.ok() && walletsRes.ok()) {
        const statsData = await statsRes.json() as { online?: unknown };
        const walletData = await walletsRes.json() as { wallets?: unknown };
        if (Boolean(statsData?.online) && Array.isArray(walletData?.wallets)) {
          return true;
        }
      }
    } catch {
      // Transient startup and proxy races are expected in live docker-backed runs.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

// ---------------------------------------------------------------------------
// Wallet management
// ---------------------------------------------------------------------------

export interface WalletHandle {
  /** Full wallet filename as returned by the API, e.g. "my-wallet.dat" */
  walletName: string;
  /** On-chain address for the wallet. May be empty string on some node builds. */
  address: string;
}

/**
 * Create a wallet via the wallet web API proxy.
 * The API normalises the name by appending ".dat" if absent.
 */
export async function createLiveWallet(
  request: APIRequestContext,
  label: string,
): Promise<WalletHandle> {
  const res = await request.post(`${BASE_URL}/api/wallet/create`, {
    data: { name: label },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createLiveWallet("${label}") failed [${res.status()}]: ${body}`);
  }
  const data = await res.json() as { name: string; address: string };
  return { walletName: data.name, address: data.address ?? '' };
}

export async function listWallets(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${BASE_URL}/api/wallets`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`listWallets failed [${res.status()}]: ${body}`);
  }

  const data = await res.json() as { wallets?: string[] };
  return Array.isArray(data.wallets) ? data.wallets : [];
}

export interface BalanceResult {
  address: string;
  spendable: number;
  total: number;
  immature: number;
  height: number;
}

/**
 * Fetch balance for a wallet.  walletName should include the .dat suffix.
 */
export async function getBalance(
  request: APIRequestContext,
  walletName: string,
): Promise<BalanceResult> {
  const res = await request.get(`${BASE_URL}/api/wallet/balance`, {
    params: { name: walletName },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`getBalance("${walletName}") failed [${res.status()}]: ${body}`);
  }
  return res.json() as Promise<BalanceResult>;
}

export async function findFundedWallet(
  request: APIRequestContext,
  minimumSpendable = 1000,
  excludeWallets: string[] = [],
): Promise<string | null> {
  const excluded = new Set(excludeWallets);
  const wallets = await listWallets(request);

  for (const walletName of wallets) {
    if (excluded.has(walletName)) {
      continue;
    }

    try {
      const balance = await getBalance(request, walletName);
      if (balance.spendable >= minimumSpendable) {
        return walletName;
      }
    } catch {
      // Ignore unreadable wallets and keep scanning.
    }
  }

  return null;
}

export async function sendFromWallet(
  request: APIRequestContext,
  fromWalletName: string,
  toAddress: string,
  amount: number,
): Promise<string> {
  const res = await request.post(`${BASE_URL}/api/wallet/send`, {
    data: { from: fromWalletName, to: toAddress, amount },
  });
  const body = await res.text();

  let payload: { ok?: boolean; txid?: string; error?: string } = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }

  if (!res.ok() || !payload.ok || !payload.txid) {
    throw new Error(`sendFromWallet(${fromWalletName}) failed [${res.status()}]: ${payload.error ?? body}`);
  }

  return payload.txid;
}

// ---------------------------------------------------------------------------
// Mining / funding
// ---------------------------------------------------------------------------

/**
 * Fund a wallet by mining `blocks` blocks to `address` via the node's
 * generatetoaddress JSON-RPC method.
 *
 * Only available on testnet/regtest nodes.
 * Mines at most 500 blocks per call (node limit).
 */
export async function fundWallet(
  request: APIRequestContext,
  address: string,
  blocks = 101,
): Promise<void> {
  if (!address) throw new Error('fundWallet: address must not be empty');

  const res = await request.post(NODE_RPC_URL, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    data: {
      jsonrpc: '2.0',
      id: 'fund-wallet',
      method: 'generatetoaddress',
      params: [Math.min(blocks, 500), address],
    },
    timeout: 120_000, // mining 101 blocks can take up to ~2 min on slow CI
  });

  const body = await res.text();
  let payload: { result?: unknown; error?: { message?: string } } = {};
  try { payload = JSON.parse(body); } catch { /* ignore */ }

  if (!res.ok() || payload.error) {
    throw new Error(
      `fundWallet(${address}, ${blocks}) failed: ` +
      (payload.error?.message ?? body),
    );
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Select a wallet by its display name (wallet filename without .dat suffix)
 * from the WalletClient dropdown.
 */
export async function selectWalletInUI(page: Page, displayName: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.click('[data-testid="wallet-selector"]');

    const option = page.locator(`[data-testid="wallet-option"]:has-text("${displayName}")`).first();
    if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await option.click();
      return;
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="wallet-selector"]').waitFor({ state: 'visible', timeout: 10_000 });
  }

  throw new Error(`Wallet option not found in selector: ${displayName}`);
}

// ---------------------------------------------------------------------------
// Offline / localStorage helpers (for smoke tests)
// ---------------------------------------------------------------------------

export interface LocalStorageWallet {
  walletsMap: Record<string, unknown>;
  activeAddress: string;
}

/**
 * Build a fake wallet object suitable for injecting into localStorage.
 * Used by smoke tests that only need a wallet to exist — no live RPC needed.
 */
export function buildLocalStorageWallet(label = 'Smoke Wallet'): LocalStorageWallet {
  const id = Math.random().toString(36).slice(2, 11);
  const address = `KC1smoke${id}`;
  const walletsMap: Record<string, unknown> = {
    [address]: {
      address,
      label,
      balance: 100.5,
      unconfirmedBalance: 0,
      createdAt: Date.now(),
      publicKey: `test_pub_${id}`,
      watchOnly: false,
    },
  };
  return { walletsMap, activeAddress: address };
}
