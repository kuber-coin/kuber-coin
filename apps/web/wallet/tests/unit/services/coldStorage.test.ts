/**
 * Unit Tests for Cold Storage Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import coldStorageService from '../../../src/services/coldStorage';

describe('Cold Storage Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generateColdWallet', () => {
    it('should generate cold wallet', () => {
      const wallet = coldStorageService.generateColdWallet('Vault');
      
      expect(wallet.label).toBe('Vault');
      expect(wallet.address).toMatch(/^KC/);
      expect(wallet.balance).toBe(0);
    });

    it('should create offline wallet', () => {
      const wallet = coldStorageService.generateColdWallet('Offline');
      expect(wallet.isOffline).toBe(true);
    });
  });

  describe('generateMnemonic', () => {
    it('should generate 12-word mnemonic', () => {
      const mnemonic = coldStorageService.generateMnemonic();
      
      expect(mnemonic).toHaveLength(12);
      expect(mnemonic.every(word => typeof word === 'string')).toBe(true);
    });

    it('should generate unique mnemonics', () => {
      const mnemonic1 = coldStorageService.generateMnemonic();
      const mnemonic2 = coldStorageService.generateMnemonic();
      
      expect(mnemonic1).not.toEqual(mnemonic2);
    });
  });

  describe('generatePaperWallet', () => {
    it('should generate paper wallet with QR code', () => {
      const paper = coldStorageService.generatePaperWallet();
      
      expect(paper.address).toBeDefined();
      expect(paper.privateKey).toBeDefined();
      expect(paper.qrCode).toBeDefined();
    });
  });

  describe('createUnsignedTransaction', () => {
    it('should create unsigned transaction', () => {
      const tx = coldStorageService.createUnsignedTransaction('KC_from', 'KC_to', 5, 0.001);
      
      expect(tx.from).toBe('KC_from');
      expect(tx.to).toBe('KC_to');
      expect(tx.amount).toBe(5);
      expect(tx.fee).toBe(0.001);
      expect(tx.signed).toBe(false);
    });
  });

  describe('exportForSigning', () => {
    it('should export transaction data', () => {
      const tx = coldStorageService.createUnsignedTransaction('KC_from', 'KC_to', 5, 0.001);
      const exported = coldStorageService.exportForSigning(tx.id);
      
      expect(exported).toContain(tx.id);
      expect(exported).toContain('KC_from');
    });
  });

  describe('importSignedTransaction', () => {
    it('should import signed transaction', () => {
      const tx = coldStorageService.createUnsignedTransaction('KC_from', 'KC_to', 5, 0.001);
      const signature = 'signed_data_' + tx.id;
      
      const result = coldStorageService.importSignedTransaction(tx.id, signature);
      
      expect(result.signed).toBe(true);
      expect(result.signature).toBe(signature);
    });
  });
});
