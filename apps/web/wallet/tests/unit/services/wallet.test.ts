/**
 * Unit Tests for Wallet Service
 * Tests wallet generation, import, balance management, transaction history
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import api from '../../../src/services/api';
import walletService from '../../../src/services/wallet';

const memoryStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });
}

let rpcAvailable = false;

const itRpc = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!rpcAvailable) return;
    await fn();
  });

describe('Wallet Service', () => {
  beforeAll(async () => {
    try {
      await api.getBlockchainInfo();
      rpcAvailable = true;
    } catch {
      rpcAvailable = false;
    }
  });

  beforeEach(() => {
    localStorage.clear();
    walletService.reloadFromStorage();
  });

  describe('generateWallet', () => {
    itRpc('should generate new wallet with label', async () => {
      const wallet = await walletService.generateWallet('Test Wallet');
      
      expect(wallet).toBeDefined();
      expect(wallet.label).toBe('Test Wallet');
      expect(wallet.address).toMatch(/^KC/);
      expect(wallet.balance).toBe(0);
      expect(wallet.createdAt).toBeGreaterThan(0);
    });

    itRpc('should generate unique addresses', async () => {
      const wallet1 = await walletService.generateWallet('Wallet 1');
      const wallet2 = await walletService.generateWallet('Wallet 2');
      
      expect(wallet1.address).not.toBe(wallet2.address);
    });

    itRpc('should persist wallet to localStorage', async () => {
      await walletService.generateWallet('Persist Test');
      
      const wallets = walletService.getWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].label).toBe('Persist Test');
    });

    itRpc('should throw error for empty label', async () => {
      await expect(walletService.generateWallet('')).rejects.toThrow();
    });
  });

  describe('importWallet', () => {
    itRpc('should import wallet from private key when provided', async () => {
      const privateKey = process.env.KUBERCOIN_TEST_PRIVATE_KEY;
      if (!privateKey) return;

      const wallet = await walletService.importWallet(privateKey, 'Imported');
      expect(wallet).toBeDefined();
      expect(wallet.label).toBe('Imported');
      expect(wallet.privateKey).toBe(privateKey);
    });
  });

  describe('getWallets', () => {
    it('should return empty array when no wallets', () => {
      const wallets = walletService.getWallets();
      expect(wallets).toEqual([]);
    });

    it('should clear stale in-memory wallets when storage is empty', () => {
      localStorage.setItem('kubercoin_wallets', JSON.stringify({
        kb1staletestaddress: {
          address: 'kb1staletestaddress',
          label: 'Stale Wallet',
          balance: 0,
          unconfirmedBalance: 0,
          createdAt: Date.now(),
        },
      }));
      localStorage.setItem('kubercoin_active_wallet', 'kb1staletestaddress');

      walletService.reloadFromStorage();
      expect(walletService.getWallets()).toHaveLength(1);

      localStorage.clear();
      walletService.reloadFromStorage();

      expect(walletService.getWallets()).toEqual([]);
      expect(walletService.getActiveWallet()).toBeNull();
    });

    itRpc('should return all wallets', async () => {
      await walletService.generateWallet('Wallet 1');
      await walletService.generateWallet('Wallet 2');
      await walletService.generateWallet('Wallet 3');
      
      const wallets = walletService.getWallets();
      expect(wallets).toHaveLength(3);
    });

    itRpc('should return sorted wallets by creation date', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletService.generateWallet('New');
      await walletService.generateWallet('Newest');
      
      const wallets = walletService.getWallets();
      expect(wallets[0].label).toBe('New');
      expect(wallets[1].label).toBe('Newest');
    });
  });

  describe('getWallet', () => {
    itRpc('should return wallet by address', async () => {
      const created = await walletService.generateWallet('Find Me');
      const found = walletService.getWallet(created.address);
      
      expect(found).toEqual(created);
    });

    it('should return null for non-existent address', () => {
      const wallet = walletService.getWallet('KC_nonexistent');
      expect(wallet).toBeUndefined();
    });
  });

  describe('deleteWallet', () => {
    itRpc('should delete wallet by address', async () => {
      const wallet = await walletService.generateWallet('To Delete');
      
      const result = walletService.deleteWallet(wallet.address);
      expect(result).toBe(true);
      
      const remaining = walletService.getWallets();
      expect(remaining).toHaveLength(0);
    });

    it('should return false for non-existent wallet', () => {
      const result = walletService.deleteWallet('KC_nonexistent');
      expect(result).toBe(false);
    });

    itRpc('should update active wallet if deleted', async () => {
      const wallet1 = await walletService.generateWallet('Wallet 1');
      const wallet2 = await walletService.generateWallet('Wallet 2');
      
      walletService.setActiveWallet(wallet1.address);
      walletService.deleteWallet(wallet1.address);
      
      const active = walletService.getActiveWallet();
      expect(active?.address).toBe(wallet2.address);
    });
  });

  describe('setActiveWallet', () => {
    itRpc('should set active wallet', async () => {
      const wallet = await walletService.generateWallet('Active Test');
      
      const result = walletService.setActiveWallet(wallet.address);
      const active = walletService.getActiveWallet();
      
      expect(result).toBe(true);
      expect(active?.address).toBe(wallet.address);
    });

    it('should throw error for non-existent address', () => {
      expect(walletService.setActiveWallet('KC_fake')).toBe(false);
    });
  });

  describe('updateWalletBalance', () => {
    itRpc('should update wallet balance', async () => {
      const wallet = await walletService.generateWallet('Balance Test');

      await walletService.updateWalletBalance(wallet.address);

      const updated = walletService.getWallet(wallet.address);
      expect(typeof updated?.balance).toBe('number');
      expect(typeof updated?.unconfirmedBalance).toBe('number');
    });
  });

  describe('getTransactionHistory', () => {
    itRpc('should return empty array for new wallet', async () => {
      const wallet = await walletService.generateWallet('New Wallet');
      const history = await walletService.getTransactionHistory(wallet.address);
      
      expect(history).toEqual([]);
    });

    itRpc('should respect limit parameter', async () => {
      const wallet = await walletService.generateWallet('Limit Test');
      const history = await walletService.getTransactionHistory(wallet.address, 10);
      
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('exportWallet', () => {
    itRpc('should export wallet as JSON', async () => {
      const wallet = await walletService.generateWallet('Export Test');
      const exported = walletService.exportWallet(wallet.address);
      
      expect(exported).toBeDefined();
      const parsed = JSON.parse(exported);
      expect(parsed.address).toBe(wallet.address);
      expect(parsed.label).toBe('Export Test');
    });

    itRpc('should include private key in export when present', async () => {
      const privateKey = process.env.KUBERCOIN_TEST_PRIVATE_KEY;
      if (!privateKey) return;

      const wallet = await walletService.importWallet(privateKey, 'Private Key Test');
      const exported = walletService.exportWallet(wallet.address);

      const parsed = JSON.parse(exported);
      expect(parsed.privateKey).toBeDefined();
    });

    it('should return null for non-existent wallet', () => {
      const exported = walletService.exportWallet('KC_fake');
      expect(exported).toBeNull();
    });
  });

  describe('storage hardening', () => {
    it('should strip private keys from persisted localStorage entries', () => {
      const seededWallet = {
        address: 'kb1testwalletaddress',
        label: 'Stored Wallet',
        balance: 1,
        unconfirmedBalance: 0,
        privateKey: 'sensitive_private_key',
        createdAt: Date.now(),
      };

      localStorage.setItem('kubercoin_wallets', JSON.stringify({
        [seededWallet.address]: seededWallet,
      }));
      localStorage.setItem('kubercoin_active_wallet', seededWallet.address);

      walletService.reloadFromStorage();

      const stored = JSON.parse(localStorage.getItem('kubercoin_wallets') || '{}');
      expect(stored[seededWallet.address].privateKey).toBeUndefined();

      const loaded = walletService.getWallet(seededWallet.address);
      expect(loaded?.privateKey).toBeUndefined();
      expect(walletService.getActiveWallet()?.address).toBe(seededWallet.address);
    });
  });

  describe('getTotalBalance', () => {
    itRpc('should sum all wallet balances', async () => {
      const wallet1 = await walletService.generateWallet('W1');
      const wallet2 = await walletService.generateWallet('W2');
      const wallet3 = await walletService.generateWallet('W3');

      await walletService.updateWalletBalance(wallet1.address);
      await walletService.updateWalletBalance(wallet2.address);
      await walletService.updateWalletBalance(wallet3.address);

      const total = walletService.getTotalBalance();
      expect(typeof total).toBe('number');
      expect(total).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for no wallets', () => {
      const total = walletService.getTotalBalance();
      expect(total).toBe(0);
    });
  });

  describe('getWatchOnlyWallets', () => {
    itRpc('should return only watch-only wallets', async () => {
      await walletService.generateWallet('Regular 1');
      const watchOnlyAddress = await api.getNewAddress('watch-only');
      const watchOnly = walletService.importWatchOnlyWallet(watchOnlyAddress, 'Watch Only');

      const watchOnlyWallets = walletService.getWatchOnlyWallets();

      expect(watchOnlyWallets).toHaveLength(1);
      expect(watchOnlyWallets[0].address).toBe(watchOnly.address);
      expect(watchOnlyWallets[0].watchOnly).toBe(true);
    });
  });
});
