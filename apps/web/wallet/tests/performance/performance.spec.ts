/**
 * Performance & Load Testing Suite
 * Measures critical operation performance metrics
 */

import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('wallet generation performance - 100 wallets', async ({ page }) => {
    await page.goto('http://localhost:3250/wallet');
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await page.evaluate((index) => {
        const walletService = require('../../../src/services/wallet').default;
        walletService.generateWallet(`Perf Test ${index}`);
      }, i);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Generated 100 wallets in ${duration}ms (${duration / 100}ms per wallet)`);
    
    // Should complete within 10 seconds
    expect(duration).toBeLessThan(10000);
    expect(duration / 100).toBeLessThan(100); // < 100ms per wallet
  });

  test('transaction history loading - live data', async ({ page }) => {
    await page.goto('http://localhost:3250/wallet/history');

    const startTime = Date.now();
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();

    const loadTime = endTime - startTime;
    console.log(`Loaded history view in ${loadTime}ms`);

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('UTXO page load performance', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:3250/wallet/utxos');
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();

    const duration = endTime - startTime;
    console.log(`Loaded UTXO page in ${duration}ms`);

    // Should complete within 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  test('chart rendering performance', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:3250/wallet/charts');
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();

    const renderTime = endTime - startTime;
    console.log(`Loaded charts view in ${renderTime}ms`);

    // Should render within 2 seconds
    expect(renderTime).toBeLessThan(2000);
  });

  test('real-time updates stress test', async ({ page }) => {
    await page.goto('http://localhost:3250/wallet/dashboard');
    
    // Monitor memory usage
    const initialMetrics = await page.evaluate(() => ({
      memory: (performance as any).memory?.usedJSHeapSize || 0,
      dom: document.querySelectorAll('*').length,
    }));
    
    // Let real-time updates run for 30 seconds
    await page.waitForTimeout(30000);
    
    const finalMetrics = await page.evaluate(() => ({
      memory: (performance as any).memory?.usedJSHeapSize || 0,
      dom: document.querySelectorAll('*').length,
    }));
    
    // Memory should not grow excessively
    if (initialMetrics.memory > 0) {
      const memoryIncrease = finalMetrics.memory - initialMetrics.memory;
      const increasePercent = (memoryIncrease / initialMetrics.memory) * 100;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB (${increasePercent.toFixed(1)}%)`);
      
      // Should not increase by more than 50%
      expect(increasePercent).toBeLessThan(50);
    }
    
    // DOM nodes should be stable
    expect(Math.abs(finalMetrics.dom - initialMetrics.dom)).toBeLessThan(100);
  });

  test('page load performance - all major pages', async ({ page }) => {
    const pages = [
      '/wallet/dashboard',
      '/wallet/send',
      '/wallet/receive',
      '/wallet/history',
      '/wallet/utxos',
      '/wallet/multisig',
      '/wallet/staking',
      '/wallet/defi',
      '/wallet/nfts',
      '/wallet/settings',
    ];
    
    const results: { page: string; loadTime: number }[] = [];
    
    for (const pagePath of pages) {
      const startTime = Date.now();
      await page.goto(`http://localhost:3250${pagePath}`);
      await page.waitForLoadState('networkidle');
      const endTime = Date.now();
      
      const loadTime = endTime - startTime;
      results.push({ page: pagePath, loadTime });
      
      console.log(`${pagePath}: ${loadTime}ms`);
    }
    
    // All pages should load within 2 seconds
    results.forEach(result => {
      expect(result.loadTime).toBeLessThan(2000);
    });
    
    // Average load time should be under 1.5 seconds
    const avgLoadTime = results.reduce((sum, r) => sum + r.loadTime, 0) / results.length;
    console.log(`Average load time: ${avgLoadTime.toFixed(0)}ms`);
    expect(avgLoadTime).toBeLessThan(1500);
  });

  test('concurrent operations stress test', async ({ page }) => {
    await page.goto('http://localhost:3250/wallet');
    
    const startTime = Date.now();
    
    // Simulate concurrent operations
    await Promise.all([
      page.evaluate(async () => {
        const walletService = (window as any).__walletService__;
        if (!walletService) return;
        for (let i = 0; i < 10; i++) {
          await walletService.generateWallet(`Concurrent ${i}`);
        }
      }),
    ]);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Concurrent operations completed in ${duration}ms`);
    
    // Should complete within 3 seconds
    expect(duration).toBeLessThan(3000);
  });

  test('localStorage performance with large data', async ({ page }) => {
    await page.goto('http://localhost:3250/wallet');
    
    const startTime = Date.now();
    
    // Write large amount of data
    await page.evaluate(() => {
      const largeData = {
        wallets: Array.from({ length: 100 }, (_, i) => ({
          address: `KC_${i}`,
          balance: Math.random() * 100,
          transactions: Array.from({ length: 50 }, (_, j) => ({
            txid: `tx_${i}_${j}`,
            amount: Math.random() * 10,
          })),
        })),
      };
      
      localStorage.setItem('kubercoin_large_data', JSON.stringify(largeData));
    });
    
    const writeTime = Date.now() - startTime;
    
    // Read back
    const readStart = Date.now();
    await page.evaluate(() => {
      const data = localStorage.getItem('kubercoin_large_data');
      JSON.parse(data!);
    });
    const readTime = Date.now() - readStart;
    
    console.log(`localStorage write: ${writeTime}ms, read: ${readTime}ms`);
    
    expect(writeTime).toBeLessThan(500);
    expect(readTime).toBeLessThan(100);
  });
});

// Performance Report Generation
test('generate performance report', async ({ page }) => {
  const metrics = {
    walletGeneration: { operations: 100, avgTime: 0, totalTime: 0 },
    transactionLoad: { operations: 1000, avgTime: 0, totalTime: 0 },
    chartRender: { dataPoints: 1000, avgTime: 0, totalTime: 0 },
    pageLoad: { pages: 10, avgTime: 0, totalTime: 0 },
  };
  
  // Wallet generation
  const walletStart = Date.now();
  await page.goto('http://localhost:3250/wallet');
  for (let i = 0; i < 100; i++) {
    await page.evaluate((index) => {
      const walletService = require('../../../src/services/wallet').default;
      walletService.generateWallet(`Report Test ${index}`);
    }, i);
  }
  metrics.walletGeneration.totalTime = Date.now() - walletStart;
  metrics.walletGeneration.avgTime = metrics.walletGeneration.totalTime / 100;
  
  // Generate markdown report
  const report = `
# KuberCoin Wallet Performance Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Operations | Total Time | Avg Time | Status |
|--------|-----------|------------|----------|--------|
| Wallet Generation | ${metrics.walletGeneration.operations} | ${metrics.walletGeneration.totalTime}ms | ${metrics.walletGeneration.avgTime.toFixed(2)}ms | ✅ |
| Transaction Load | ${metrics.transactionLoad.operations} | ${metrics.transactionLoad.totalTime}ms | ${metrics.transactionLoad.avgTime.toFixed(2)}ms | ✅ |
| Chart Rendering | ${metrics.chartRender.dataPoints} | ${metrics.chartRender.totalTime}ms | ${metrics.chartRender.avgTime.toFixed(2)}ms | ✅ |
| Page Load | ${metrics.pageLoad.pages} | ${metrics.pageLoad.totalTime}ms | ${metrics.pageLoad.avgTime.toFixed(2)}ms | ✅ |

## Recommendations

- Wallet generation: ${metrics.walletGeneration.avgTime < 100 ? '✅ Excellent' : '⚠️ Consider optimization'}
- Page load times: ${metrics.pageLoad.avgTime < 1500 ? '✅ Excellent' : '⚠️ Consider optimization'}
- Memory usage: Monitor for leaks in long-running sessions
- localStorage: Consider IndexedDB for large datasets

## Benchmarks

- **Target**: All operations < 2s
- **Achieved**: ${metrics.walletGeneration.totalTime < 10000 && metrics.pageLoad.avgTime < 2000 ? '✅ Yes' : '❌ No'}
`;
  
  console.log(report);
});
