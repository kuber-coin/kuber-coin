/**
 * Unit Tests for NFT Manager Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import nftManager from '../../../src/services/nftManager';

describe('NFT Manager Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getNFTs', () => {
    it('should return NFT list', () => {
      const nfts = nftManager.getNFTs();
      expect(Array.isArray(nfts)).toBe(true);
    });

    it('should filter by collection', () => {
      const nfts = nftManager.getNFTs('Crypto Punks');
      nfts.forEach(nft => {
        expect(nft.collection).toBe('Crypto Punks');
      });
    });

    it('should filter by rarity', () => {
      const nfts = nftManager.getNFTs(undefined, 'legendary');
      nfts.forEach(nft => {
        expect(nft.rarity).toBe('legendary');
      });
    });
  });

  describe('transferNFT', () => {
    it('should transfer NFT to recipient', () => {
      const nfts = nftManager.getNFTs();
      if (nfts.length > 0) {
        const nft = nfts[0];
        const result = nftManager.transferNFT(nft.id, 'KC_recipient123');
        
        expect(result).toBe(true);
      }
    });

    it('should validate recipient address', () => {
      const nfts = nftManager.getNFTs();
      if (nfts.length > 0) {
        expect(() => nftManager.transferNFT(nfts[0].id, '')).toThrow();
      }
    });
  });

  describe('getCollections', () => {
    it('should return unique collections', () => {
      const collections = nftManager.getCollections();
      
      expect(Array.isArray(collections)).toBe(true);
      const unique = new Set(collections);
      expect(unique.size).toBe(collections.length);
    });
  });

  describe('getCollectionStats', () => {
    it('should return collection statistics', () => {
      const collections = nftManager.getCollections();
      if (collections.length > 0) {
        const stats = nftManager.getCollectionStats(collections[0]);
        
        expect(stats).toHaveProperty('totalNFTs');
        expect(stats).toHaveProperty('owners');
        expect(stats).toHaveProperty('floorPrice');
        expect(stats).toHaveProperty('totalVolume');
      }
    });
  });
});
