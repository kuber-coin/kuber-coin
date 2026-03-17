/**
 * Integration Tests for API Service
 * Exercises live RPC endpoints when available
 */

import { describe, it, expect, beforeAll } from 'vitest';
import api from '../../../src/services/api';

let rpcAvailable = false;

const itRpc = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!rpcAvailable) return;
    await fn();
  });

describe('API Service Integration Tests', () => {
  beforeAll(async () => {
    try {
      await api.getBlockchainInfo();
      rpcAvailable = true;
    } catch {
      rpcAvailable = false;
    }
  });

  itRpc('should fetch blockchain info', async () => {
    const info = await api.getBlockchainInfo();
    expect(info.chain).toBeDefined();
    expect(info.blocks).toBeGreaterThanOrEqual(0);
    expect(info.bestblockhash).toBeDefined();
  });

  itRpc('should fetch block hash and block data', async () => {
    const genesisHash = await api.getBlockHash(0);
    const block = await api.getBlock(genesisHash, 1);
    expect(block.hash).toBe(genesisHash);
    expect(block.height).toBe(0);
  });

  itRpc('should fetch mempool info', async () => {
    const mempool = await api.getMempoolInfo();
    expect(mempool.size).toBeGreaterThanOrEqual(0);
    expect(mempool.bytes).toBeGreaterThanOrEqual(0);
  });

  itRpc('should estimate smart fee', async () => {
    const fee = await api.estimateSmartFee(6);
    expect(typeof fee.blocks).toBe('number');
  });

  itRpc('should validate a freshly generated address', async () => {
    const address = await api.getNewAddress('api-test');
    const validation = await api.validateAddress(address);
    expect(validation.isvalid).toBe(true);
    expect(validation.address).toBe(address);
  });

  itRpc('should list unspent outputs for a new address', async () => {
    const address = await api.getNewAddress('utxo-test');
    const utxos = await api.listUnspent(0, 9999999, [address]);
    expect(Array.isArray(utxos)).toBe(true);
  });
});
    it('should validate confirmation blocks', async () => {
      await expect(api.estimateFee(0)).rejects.toThrow();
      await expect(api.estimateFee(-1)).rejects.toThrow();
    });
  });

  describe('getTransaction', () => {
    it('should fetch transaction details', async () => {
      const mockTx = {
        txid: 'tx_123',
        confirmations: 6,
        inputs: [],
        outputs: [],
        fee: 0.001,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTx,
      });

      const tx = await api.getTransaction('tx_123');
      
      expect(tx).toEqual(mockTx);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      (global.fetch as any).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      await expect(api.getBlockchainInfo()).rejects.toThrow(/timeout/i);
    });

    it('should handle JSON parse errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      await expect(api.getBlockchainInfo()).rejects.toThrow();
    });

    it('should handle network disconnection', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(api.getBlockchainInfo()).rejects.toThrow();
    });
  });

  describe('Response Validation', () => {
    it('should validate blockchain info schema', async () => {
      const invalidResponse = { chain: 'kubercoin' }; // Missing required fields

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      // Should handle missing fields
      const info = await api.getBlockchainInfo();
      expect(info.chain).toBe('kubercoin');
    });

    it('should validate block schema', async () => {
      const mockBlock = {
        height: 1000,
        hash: '0xabc',
        timestamp: Date.now(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBlock,
      });

      const block = await api.getBlock(1000);
      expect(block.height).toBe(1000);
    });
  });

  describe('Request Configuration', () => {
    it('should include proper headers', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.getBlockchainInfo();
      
      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].headers).toBeDefined();
      expect(callArgs[1].headers['Content-Type']).toContain('json');
    });

    it('should use correct HTTP method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ txid: 'abc' }),
      });

      await api.submitTransaction('0x123');
      
      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
    });
  });
});
