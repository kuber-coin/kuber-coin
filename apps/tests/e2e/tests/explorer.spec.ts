import { test, expect } from '@playwright/test';

async function isExplorerBackendReady(request: { get: (url: string, options?: { timeout?: number }) => Promise<{ ok: () => boolean; json: () => Promise<any> }> }): Promise<boolean> {
  try {
    const response = await request.get('http://localhost:3200/api/status', { timeout: 2000 });
    if (!response.ok()) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

test.describe('Explorer Web', () => {
  let backendReady = false;

  test.beforeAll(async ({ request }) => {
    backendReady = await isExplorerBackendReady(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3200');
  });

  test('should load homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/KuberCoin Explorer/);
    await expect(page.locator('h1')).toContainText('KuberCoin Explorer');
  });

  test('should display blockchain height', async ({ page }) => {
    test.skip(!backendReady, 'Explorer backend is unavailable');
    const heightElement = page.locator('[data-testid="blockchain-height"]');
    await expect(heightElement).toBeVisible({ timeout: 10000 });
    const height = await heightElement.textContent();
    expect(Number.parseInt(height || '0', 10)).toBeGreaterThanOrEqual(0);
  });

  test('should display latest blocks', async ({ page }) => {
    test.skip(!backendReady, 'Explorer backend is unavailable');
    const blocksList = page.locator('[data-testid="blocks-list"]');
    await expect(blocksList).toBeVisible({ timeout: 10000 });
    
    const firstBlock = blocksList.locator('.block-item').first();
    await expect(firstBlock).toBeVisible();
    
    // Check block has hash and height
    await expect(firstBlock.locator('.block-hash')).toBeVisible();
    await expect(firstBlock.locator('.block-height')).toBeVisible();
  });

  test('should search for block by hash', async ({ page }) => {
    test.skip(!backendReady, 'Explorer backend is unavailable');
    // Get a block hash from the list
    const firstBlock = page.locator('.block-item').first();
    const blockHash = await firstBlock.locator('.block-hash').textContent();
    
    // Search for it
    await page.locator('[data-testid="search-input"]').fill(blockHash || '');
    await page.locator('[data-testid="search-button"]').click();
    
    // Should navigate to block detail page
    await expect(page).toHaveURL(/\/block\//);
    await expect(page.locator('.block-detail')).toBeVisible();
  });

  test('should receive WebSocket updates', async ({ page }) => {
    test.skip(!backendReady, 'Explorer backend is unavailable');
    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid="ws-status"].connected');
    
    const initialHeight = await page.locator('[data-testid="blockchain-height"]').textContent();
    
    // Trigger a block mine via API
    await page.request.post('http://localhost:8634', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'generatetoaddress',
        params: [1, 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8']
      }
    });
    
    // Wait for WebSocket notification
    await page.waitForFunction((prevHeight) => {
      const currentHeight = document.querySelector('[data-testid="blockchain-height"]')?.textContent;
      return currentHeight && Number.parseInt(currentHeight, 10) > Number.parseInt(prevHeight || '0', 10);
    }, initialHeight, { timeout: 15000 });
  });

  test('should display mempool transactions', async ({ page }) => {
    test.skip(!backendReady, 'Explorer backend is unavailable');
    const mempoolSection = page.locator('[data-testid="mempool-section"]');
    await expect(mempoolSection).toBeVisible();
    
    const txCount = await mempoolSection.locator('[data-testid="mempool-count"]').textContent();
    expect(Number.parseInt(txCount || '0', 10)).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Explorer Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:3200');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
  });

  test('should handle 100 blocks efficiently', async ({ page }) => {
    test.skip(!(await isExplorerBackendReady(page.request)), 'Explorer backend is unavailable');
    await page.goto('http://localhost:3200');
    
    // Scroll through blocks list
    const blocksList = page.locator('[data-testid="blocks-list"]');
    for (let i = 0; i < 10; i++) {
      await blocksList.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(100);
    }
    
    // Should still be responsive
    await expect(page.locator('h1')).toBeVisible();
  });
});
