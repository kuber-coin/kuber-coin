/**
 * Unit Tests for Privacy Tools Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import privacyToolsService from '../../../src/services/privacyTools';

describe('Privacy Tools Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getSettings', () => {
    it('should return privacy settings', () => {
      const settings = privacyToolsService.getSettings();
      
      expect(settings).toHaveProperty('enableTor');
      expect(settings).toHaveProperty('autoMixing');
      expect(settings).toHaveProperty('mixingRounds');
      expect(settings).toHaveProperty('addressRotation');
      expect(settings).toHaveProperty('stealthAddresses');
    });
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      privacyToolsService.updateSettings({ enableTor: true, mixingRounds: 5 });
      
      const settings = privacyToolsService.getSettings();
      expect(settings.enableTor).toBe(true);
      expect(settings.mixingRounds).toBe(5);
    });
  });

  describe('createCoinJoin', () => {
    it('should create CoinJoin transaction', () => {
      const tx = privacyToolsService.createCoinJoin(10, 5);
      
      expect(tx.amount).toBe(10);
      expect(tx.participants).toBe(5);
      expect(tx.type).toBe('coinjoin');
      expect(tx.privacyScore).toBeGreaterThan(0);
    });

    it('should calculate privacy score correctly', () => {
      const tx1 = privacyToolsService.createCoinJoin(10, 5);
      const tx2 = privacyToolsService.createCoinJoin(10, 10);
      
      // More participants = higher privacy score
      expect(tx2.privacyScore).toBeGreaterThan(tx1.privacyScore);
    });

    it('should cap privacy score at 95', () => {
      const tx = privacyToolsService.createCoinJoin(10, 20);
      expect(tx.privacyScore).toBeLessThanOrEqual(95);
    });
  });

  describe('createStealthAddress', () => {
    it('should generate stealth address', () => {
      const stealth = privacyToolsService.createStealthAddress();
      
      expect(stealth).toHaveProperty('address');
      expect(stealth).toHaveProperty('scanKey');
      expect(stealth).toHaveProperty('spendKey');
      expect(stealth.address).toMatch(/^KC/);
    });

    it('should generate unique addresses', () => {
      const stealth1 = privacyToolsService.createStealthAddress();
      const stealth2 = privacyToolsService.createStealthAddress();
      
      expect(stealth1.address).not.toBe(stealth2.address);
    });
  });

  describe('mixTransaction', () => {
    it('should mix transaction', () => {
      const tx = privacyToolsService.mixTransaction('txid123', 3);
      
      expect(tx.txid).toBe('txid123');
      expect(tx.rounds).toBe(3);
      expect(tx.type).toBe('mixed');
      expect(tx.privacyScore).toBeGreaterThan(0);
    });
  });

  describe('enableTorRouting', () => {
    it('should enable Tor', () => {
      privacyToolsService.enableTorRouting();
      
      const settings = privacyToolsService.getSettings();
      expect(settings.enableTor).toBe(true);
    });
  });

  describe('disableTorRouting', () => {
    it('should disable Tor', () => {
      privacyToolsService.enableTorRouting();
      privacyToolsService.disableTorRouting();
      
      const settings = privacyToolsService.getSettings();
      expect(settings.enableTor).toBe(false);
    });
  });

  describe('getPrivacyTransactions', () => {
    it('should return privacy transaction history', () => {
      privacyToolsService.createCoinJoin(5, 5);
      privacyToolsService.mixTransaction('txid456', 3);
      
      const history = privacyToolsService.getPrivacyTransactions();
      
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });
});
