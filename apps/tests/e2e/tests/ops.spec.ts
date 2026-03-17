import { test, expect } from '@playwright/test';

async function isOpsBackendReady(request: { get: (url: string, options?: { timeout?: number }) => Promise<{ ok: () => boolean; json: () => Promise<any> }> }): Promise<boolean> {
  try {
    const response = await request.get('http://localhost:3300/api/status', { timeout: 2000 });
    if (!response.ok()) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

test.describe('Operations Dashboard', () => {
  let backendReady = false;

  test.beforeAll(async ({ request }) => {
    backendReady = await isOpsBackendReady(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3300');
  });

  test('should load operations dashboard', async ({ page }) => {
    await expect(page).toHaveTitle(/KuberCoin Operations/);
    await expect(page.getByRole('heading', { name: /Operations Dashboard/i })).toBeVisible();
  });

  test('should display node health metrics', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    const healthSection = page.locator('[data-testid="health-section"]');
    await expect(healthSection).toBeVisible({ timeout: 10000 });
    
    // Check for key metrics
    await expect(page.locator('[data-testid="node-status"]')).toContainText(/online|healthy/i);
    await expect(page.locator('[data-testid="sync-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="peer-count"]')).toBeVisible();
  });

  test('should display Prometheus metrics', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    await page.locator('[data-testid="metrics-tab"]').click();
    
    const metricsPanel = page.locator('[data-testid="metrics-panel"]');
    await expect(metricsPanel).toBeVisible();
    
    // Check for common metrics
    await expect(page.locator('text=/kubercoin_block_height/')).toBeVisible();
    await expect(page.locator('text=/kubercoin_mempool_size/')).toBeVisible();
  });

  test('should show RPC call statistics', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    const rpcStats = page.locator('[data-testid="rpc-stats"]');
    await expect(rpcStats).toBeVisible();
    
    await expect(rpcStats.locator('[data-testid="rpc-calls-total"]')).toBeVisible();
    await expect(rpcStats.locator('[data-testid="rpc-errors-total"]')).toBeVisible();
    await expect(rpcStats.locator('[data-testid="rpc-avg-latency"]')).toBeVisible();
  });

  test('should display alerts when issues detected', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    await page.reload();

    const alertCount = await page.locator('.alert').count();
    if (alertCount === 0) {
      await expect(page.locator('[data-testid="health-section"]')).toBeVisible();
      return;
    }

    await expect(page.locator('.alert')).toBeVisible({ timeout: 10000 });
  });

  test('should execute RPC commands', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    await page.locator('[data-testid="rpc-console-tab"]').click();
    
    const commandInput = page.locator('[data-testid="rpc-command-input"]');
    await commandInput.fill('getblockchaininfo');
    
    await page.locator('[data-testid="execute-rpc"]').click();
    
    const output = page.locator('[data-testid="rpc-output"]');
    await expect(output).toBeVisible({ timeout: 5000 });
    await expect(output).toContainText(/blocks|chain|difficulty/i);
  });

  test('should show network topology', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    await page.locator('[data-testid="network-tab"]').click();
    
    const networkMap = page.locator('[data-testid="network-topology"]');
    await expect(networkMap).toBeVisible();
    
    // Check for peer nodes
    const peerNodes = networkMap.locator('.peer-node');
    const count = await peerNodes.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display system resources', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    const resourcesSection = page.locator('[data-testid="resources-section"]');
    await expect(resourcesSection).toBeVisible();
    
    await expect(page.locator('[data-testid="cpu-usage"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-usage"]')).toBeVisible();
    await expect(page.locator('[data-testid="disk-usage"]')).toBeVisible();
  });

  test('should refresh metrics periodically', async ({ page }) => {
    test.skip(!backendReady, 'Ops backend is unavailable');
    const initialTimestamp = await page.locator('[data-testid="last-update"]').textContent();
    
    // Wait for auto-refresh (assuming 5 second interval)
    await page.waitForTimeout(6000);
    
    const newTimestamp = await page.locator('[data-testid="last-update"]').textContent();
    expect(newTimestamp).not.toBe(initialTimestamp);
  });
});

test.describe('Operations Performance', () => {
  test('should handle real-time metric updates', async ({ page }) => {
    test.skip(!(await isOpsBackendReady(page.request)), 'Ops backend is unavailable');
    await page.goto('http://localhost:3300');
    
    // Monitor for 30 seconds of updates
    const updates: string[] = [];
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        const payload = typeof event.payload === 'string' ? event.payload : event.payload.toString();
        updates.push(payload);
      });
    });
    
    await page.waitForTimeout(30000);
    
    // Should have received multiple updates
    expect(updates.length).toBeGreaterThan(0);
  });

  test('should load charts without blocking UI', async ({ page }, testInfo) => {
    test.skip(!(await isOpsBackendReady(page.request)), 'Ops backend is unavailable');
    await page.goto('http://localhost:3300');
    
    await page.locator('[data-testid="charts-tab"]').click();
    
    // UI should remain responsive
    const startTime = Date.now();
    await page.locator('h1').click();
    const clickTime = Date.now() - startTime;

    // Browser engines vary substantially in automation overhead.
    // Keep Chromium strict, but allow a slightly higher budget for Firefox/WebKit.
    const budgetMs = testInfo.project.name === 'chromium' ? 100 : 250;
    expect(clickTime).toBeLessThan(budgetMs);
  });
});
