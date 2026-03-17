import { test, expect, Page } from '@playwright/test';

type UnavailableRoute = {
  path: string;
  title: string;
  summaryFragment: string;
};

const unavailableRoutes: UnavailableRoute[] = [
  {
    path: '/wallet/multisig',
    title: 'Multisig workflows are not backed by the current wallet backend',
    summaryFragment: 'browser storage',
  },
  {
    path: '/wallet/cold-storage',
    title: 'Cold storage workflows are not implemented as verified offline signing',
    summaryFragment: 'offline-signing flow',
  },
  {
    path: '/wallet/swaps',
    title: 'Atomic swaps are not wired to a real backend',
    summaryFragment: 'swap endpoints',
  },
  {
    path: '/wallet/portfolio',
    title: 'Portfolio tracking is not backed by the node',
    summaryFragment: 'arbitrary token balances and prices in the browser',
  },
  {
    path: '/wallet/contracts',
    title: 'Smart contract interaction is not supported by the current backend',
    summaryFragment: 'simulated read and write calls',
  },
  {
    path: '/wallet/staking',
    title: 'Staking pools are not wired to real consensus mechanics',
    summaryFragment: 'client-side service',
  },
  {
    path: '/wallet/defi',
    title: 'DeFi workflows are not implemented in KuberCoin',
    summaryFragment: 'DeFi',
  },
  {
    path: '/wallet/nfts',
    title: 'NFT features are not implemented on the current chain',
    summaryFragment: 'browser-local NFT objects',
  },
  {
    path: '/wallet/privacy',
    title: 'Advanced privacy tooling is not wired to the current node',
    summaryFragment: 'Tor, CoinJoin, stealth addresses',
  },
  {
    path: '/wallet/mobile',
    title: 'Mobile sync is not implemented as a real device service',
    summaryFragment: 'generated QR codes',
  },
  {
    path: '/wallet/audit',
    title: 'Security audit logging is not connected to a durable backend',
    summaryFragment: 'client-side audit log service',
  },
];

async function gotoUnavailableRoute(page: Page, route: UnavailableRoute) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${route.path.replace('/', '\\/')}$`));
  await expect(page.getByText('Route retained, feature not shipped', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('h1')).toHaveText(route.title, { timeout: 15000 });
  await expect(page.locator('p').filter({ hasText: route.summaryFragment }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Available now' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What would make this real' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open live dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View wallet history' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Check node status' })).toBeVisible();
}

test.describe('Advanced Wallet Routes', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of unavailableRoutes) {
    test(`renders unavailable feature state for ${route.path}`, async ({ page }) => {
      await gotoUnavailableRoute(page, route);
    });
  }

  test('unavailable routes link back to live wallet history', async ({ page }) => {
    await gotoUnavailableRoute(page, unavailableRoutes[0]);
    await page.getByRole('link', { name: 'View wallet history' }).click();
    await expect(page).toHaveURL(/\/wallet\/history$/);
    await expect(page.locator('h1')).toContainText(/History|Transactions/i, { timeout: 15000 });
  });

  test('unavailable routes link back to dashboard', async ({ page }) => {
    await gotoUnavailableRoute(page, unavailableRoutes[1]);
    await page.getByRole('link', { name: 'Open live dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
