/**
 * Unit Tests for Multi-Sig Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import multisigService from '../../../src/services/multisig';

describe('Multi-Sig Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('createMultisigWallet', () => {
    it('should create 2-of-3 multi-sig wallet', () => {
      const wallet = multisigService.createMultisigWallet(
        'Company Wallet',
        2,
        ['signer1', 'signer2', 'signer3']
      );
      
      expect(wallet.name).toBe('Company Wallet');
      expect(wallet.requiredSignatures).toBe(2);
      expect(wallet.signers).toHaveLength(3);
    });

    it('should throw error for invalid required signatures', () => {
      expect(() => multisigService.createMultisigWallet('Test', 4, ['s1', 's2'])).toThrow();
    });
  });

  describe('signTransaction', () => {
    it('should add signature to transaction', () => {
      const wallet = multisigService.createMultisigWallet('Test', 2, ['s1', 's2']);
      const tx = multisigService.createTransaction(wallet.id, 'KC_recipient', 10);
      
      const result = multisigService.signTransaction(tx.id, 'signer1');
      expect(result).toBe(true);
      
      const updated = multisigService.getPendingTransactions(wallet.id);
      expect(updated[0].signatures).toHaveLength(1);
    });

    it('should not allow duplicate signatures', () => {
      const wallet = multisigService.createMultisigWallet('Test', 2, ['s1', 's2']);
      const tx = multisigService.createTransaction(wallet.id, 'KC_to', 5);
      
      multisigService.signTransaction(tx.id, 'signer1');
      const result = multisigService.signTransaction(tx.id, 'signer1');
      
      expect(result).toBe(false);
    });
  });

  describe('isTransactionComplete', () => {
    it('should return true when enough signatures', () => {
      const wallet = multisigService.createMultisigWallet('Test', 2, ['s1', 's2', 's3']);
      const tx = multisigService.createTransaction(wallet.id, 'KC_to', 10);
      
      multisigService.signTransaction(tx.id, 'signer1');
      multisigService.signTransaction(tx.id, 'signer2');
      
      const complete = multisigService.isTransactionComplete(tx.id);
      expect(complete).toBe(true);
    });

    it('should return false when insufficient signatures', () => {
      const wallet = multisigService.createMultisigWallet('Test', 2, ['s1', 's2']);
      const tx = multisigService.createTransaction(wallet.id, 'KC_to', 10);
      
      multisigService.signTransaction(tx.id, 'signer1');
      
      const complete = multisigService.isTransactionComplete(tx.id);
      expect(complete).toBe(false);
    });
  });
});
