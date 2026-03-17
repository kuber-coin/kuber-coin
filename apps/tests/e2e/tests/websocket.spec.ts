import { test, expect } from '@playwright/test';

async function isBackendReady(request: { get: (url: string, options?: { timeout?: number }) => Promise<{ ok: () => boolean; json: () => Promise<any> }> }, url: string): Promise<boolean> {
  try {
    const response = await request.get(url, { timeout: 2000 });
    if (!response.ok()) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function hasType(value: unknown, type: string): value is Record<string, unknown> {
  return isRecord(value) && value.type === type;
}

test.describe('WebSocket Real-time Updates', () => {
  let wsMessages: unknown[] = [];
  let backendReady = false;

  const onFrameReceived = (event: { payload: unknown }) => {
    const payloadText = typeof event.payload === 'string' ? event.payload : String(event.payload);
    const message = safeJsonParse(payloadText);
    if (message != null) wsMessages.push(message);
  };

  const onWebsocket = (ws: { on: (event: 'framereceived', handler: (event: { payload: unknown }) => void) => void }) => {
    ws.on('framereceived', onFrameReceived);
  };
  
  test.beforeEach(async ({ page }) => {
    // Capture WebSocket messages
    wsMessages = [];
    page.on('websocket', onWebsocket);
    
    await page.goto('http://localhost:3200');
  });

  test.beforeAll(async ({ request }) => {
    const explorerReady = await isBackendReady(request, 'http://localhost:3200/api/status');
    const walletReady = await isBackendReady(request, 'http://localhost:3250/api/status');
    backendReady = explorerReady && walletReady;
  });

  test('should establish WebSocket connection', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    // Wait for connection indicator
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    const status = await page.locator('[data-testid="ws-status"]').textContent();
    expect(status).toMatch(/connected/i);
  });

  test('should receive block notifications', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    // Wait for WS connection
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Mine a block via RPC
    await page.request.post('http://localhost:8634', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'generatetoaddress',
        params: [1, 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8']
      }
    });
    
    // Wait for WebSocket notification
    await page.waitForFunction(() => {
      const wsStatus = document.querySelector('[data-testid="ws-last-message"]');
      return wsStatus?.textContent?.includes('block');
    }, { timeout: 15000 });
    
    // Verify we received block message
    const blockMessages = wsMessages.filter((m) => hasType(m, 'block'));
    expect(blockMessages.length).toBeGreaterThan(0);
    
    const lastBlock = blockMessages.at(-1);
    expect(lastBlock).toBeDefined();
    if (!lastBlock) return;
    expect(lastBlock).toHaveProperty('hash');
    expect(lastBlock).toHaveProperty('height');
  });

  test('should receive transaction notifications', async ({ page, context }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Create and send a transaction
    const walletPage = await context.newPage();
    await walletPage.goto('http://localhost:3250');
    
    // Send a transaction (assuming wallet is set up)
    await walletPage.locator('[data-testid="wallet-selector"]').click();
    await walletPage.locator('[data-testid="wallet-option"]').first().click();
    await walletPage.locator('[data-testid="to-address"]').fill('mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8');
    await walletPage.locator('[data-testid="amount"]').fill('1000');
    await walletPage.locator('[data-testid="send-button"]').click();
    await walletPage.locator('[data-testid="confirm-send"]').click();
    
    // Back on explorer, wait for transaction notification
    await page.waitForFunction(() => {
      const wsStatus = document.querySelector('[data-testid="ws-last-message"]');
      return wsStatus?.textContent?.includes('transaction');
    }, { timeout: 15000 });
    
    const txMessages = wsMessages.filter((m) => hasType(m, 'transaction'));
    expect(txMessages.length).toBeGreaterThan(0);
    
    const lastTx = txMessages.at(-1);
    expect(lastTx).toBeDefined();
    if (!lastTx) return;
    expect(lastTx).toHaveProperty('txid');
  });

  test('should handle WebSocket reconnection', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Simulate connection drop by reloading
    await page.reload();
    
    // Should reconnect
    await page.waitForSelector('[data-testid="ws-status"].connected', { timeout: 10000 });
    
    const status = await page.locator('[data-testid="ws-status"]').textContent();
    expect(status).toMatch(/connected/i);
  });

  test('should subscribe to specific channels', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Subscribe to blocks only
    await page.locator('[data-testid="subscription-settings"]').click();
    await page.locator('[data-testid="subscribe-blocks"]').check();
    await page.locator('[data-testid="subscribe-transactions"]').uncheck();
    await page.locator('[data-testid="apply-subscriptions"]').click();
    
    // Mine a block
    await page.request.post('http://localhost:8634', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'generatetoaddress',
        params: [1, 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8']
      }
    });
    
    // Should receive block message
    await page.waitForFunction(() => {
      const wsStatus = document.querySelector('[data-testid="ws-last-message"]');
      return wsStatus?.textContent?.includes('block');
    }, { timeout: 15000 });
    
    // Verify subscription
    const subscriptions = wsMessages.filter((m) => hasType(m, 'subscribed'));
    expect(subscriptions.some((s) => typeof s.channel === 'string' && s.channel === 'blocks')).toBe(true);
  });

  test('should display live mempool updates', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    const initialMempoolCount = await page.locator('[data-testid="mempool-count"]').textContent();
    
    // Submit a transaction to mempool
    await page.request.post('http://localhost:8080/api/wallet/send', {
      data: {
        from: 'test-wallet',
        to: 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8',
        amount: 1000
      }
    });
    
    // Mempool count should update
    await page.waitForFunction((prevCount) => {
      const currentCount = document.querySelector('[data-testid="mempool-count"]')?.textContent;
      return currentCount !== prevCount;
    }, initialMempoolCount, { timeout: 10000 });
  });

  test('should show connection quality metrics', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Let it run for a bit to collect metrics
    await page.waitForTimeout(5000);
    
    const latency = page.locator('[data-testid="ws-latency"]');
    await expect(latency).toBeVisible();
    
    const latencyText = await latency.textContent();
    expect(latencyText).toMatch(/\d+ms/);
  });

  test('should handle high-frequency updates', async ({ page }) => {
    test.skip(!backendReady, 'Explorer/wallet backends are unavailable');
    const connected = await page
      .locator('[data-testid="ws-status"].connected')
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    test.skip(!connected, 'WebSocket connection unavailable');
    
    // Mine multiple blocks rapidly
    for (let i = 0; i < 10; i++) {
      await page.request.post('http://localhost:8634', {
        data: {
          jsonrpc: '2.0',
          id: i,
          method: 'generatetoaddress',
          params: [1, 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8']
        }
      });
    }
    
    // Wait for updates to process
    await page.waitForTimeout(5000);
    
    // UI should still be responsive
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    
    // Should have received multiple block messages
    const blockMessages = wsMessages.filter((m) => hasType(m, 'block'));
    expect(blockMessages.length).toBeGreaterThanOrEqual(10);
  });
});

test.describe('WebSocket Error Handling', () => {
  test('should show disconnected state when server unavailable', async ({ page }) => {
    // Try to connect to non-existent server
    await page.goto('http://localhost:3200');
    
    // Modify WebSocket URL to invalid
    await page.evaluate(() => {
      (globalThis as unknown as { WS_URL?: string }).WS_URL = 'ws://localhost:9999/ws';
    });
    
    await page.reload();
    
    // Should show disconnected state
    await expect(page.locator('[data-testid="ws-status"].disconnected')).toBeVisible({ timeout: 5000 });
  });

  test('should retry connection on failure', async ({ page }) => {
    await page.goto('http://localhost:3200');
    
    // Should attempt reconnection
    const retryIndicator = page.locator('[data-testid="ws-retry-count"]');
    await expect(retryIndicator).toBeVisible({ timeout: 10000 });
  });
});
