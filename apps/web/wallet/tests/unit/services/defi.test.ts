/**
 * Unit Tests for DeFi Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import defiService from '../../../src/services/defi';

describe('DeFi Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('lend', () => {
    it('should create lending position', () => {
      const position = defiService.lend('KuberLend', 'KC', 100, 8.5);
      
      expect(position.protocol).toBe('KuberLend');
      expect(position.asset).toBe('KC');
      expect(position.amount).toBe(100);
      expect(position.apy).toBe(8.5);
      expect(position.interest).toBe(0);
    });

    it('should throw error for invalid amount', () => {
      expect(() => defiService.lend('KuberLend', 'KC', -10, 8.5)).toThrow();
      expect(() => defiService.lend('KuberLend', 'KC', 0, 8.5)).toThrow();
    });
  });

  describe('calculateLendingInterest', () => {
    it('should calculate interest based on APY', () => {
      const position = defiService.lend('KuberLend', 'KC', 100, 10); // 10% APY
      
      // Simulate 365 days
      position.startedAt = Date.now() - (365 * 24 * 60 * 60 * 1000);
      
      defiService.calculateLendingInterest(position.id);
      
      const updated = defiService.getLendingPositions().find(p => p.id === position.id);
      expect(updated!.interest).toBeCloseTo(10, 1); // ~10% of 100
    });

    it('should calculate pro-rated interest', () => {
      const position = defiService.lend('KuberLend', 'KC', 100, 12); // 12% APY
      
      // Simulate 30 days
      position.startedAt = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      defiService.calculateLendingInterest(position.id);
      
      const updated = defiService.getLendingPositions().find(p => p.id === position.id);
      const expected = 100 * 0.12 * (30 / 365);
      expect(updated!.interest).toBeCloseTo(expected, 2);
    });
  });

  describe('borrow', () => {
    it('should create borrow position', () => {
      const position = defiService.borrow('KuberLend', 'USDC', 100, 'KC', 200, 5);
      
      expect(position.borrowedAsset).toBe('USDC');
      expect(position.borrowedAmount).toBe(100);
      expect(position.collateralAsset).toBe('KC');
      expect(position.collateralAmount).toBe(200);
      expect(position.interestRate).toBe(5);
    });

    it('should calculate health factor', () => {
      const position = defiService.borrow('KuberLend', 'USDC', 100, 'KC', 200, 5);
      
      // Health factor = (collateral * 0.75) / borrowed
      // = (200 * 0.75) / 100 = 1.5
      expect(position.healthFactor).toBe(1.5);
    });

    it('should throw error for insufficient collateral', () => {
      // Health factor < 1.2 should fail
      expect(() => defiService.borrow('KuberLend', 'USDC', 100, 'KC', 100, 5)).toThrow(/collateral/i);
    });
  });

  describe('addLiquidity', () => {
    it('should create liquidity position', () => {
      const pools = defiService.getLiquidityPools();
      const pool = pools[0];
      
      const position = defiService.addLiquidity(pool.id, 10, 10);
      
      expect(position.poolId).toBe(pool.id);
      expect(position.token0Amount).toBe(10);
      expect(position.token1Amount).toBe(10);
      expect(position.lpTokens).toBeGreaterThan(0);
    });

    it('should calculate LP tokens correctly', () => {
      const pools = defiService.getLiquidityPools();
      const pool = pools[0];
      
      const position = defiService.addLiquidity(pool.id, 100, 100);
      
      // LP tokens = sqrt(token0 * token1)
      const expected = Math.sqrt(100 * 100);
      expect(position.lpTokens).toBe(expected);
    });
  });

  describe('calculateLiquidityFees', () => {
    it('should calculate fees based on pool APY', () => {
      const pools = defiService.getLiquidityPools();
      const pool = pools[0];
      
      const position = defiService.addLiquidity(pool.id, 100, 100);
      
      // Simulate 30 days
      position.addedAt = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      defiService.calculateLiquidityFees(position.id);
      
      const updated = defiService.getLiquidityPositions().find(p => p.id === position.id);
      expect(updated!.feesEarned).toBeGreaterThan(0);
    });
  });

  describe('withdrawLending', () => {
    it('should withdraw lending position with interest', () => {
      const position = defiService.lend('KuberLend', 'KC', 100, 10);
      position.interest = 5.5;
      
      const result = defiService.withdrawLending(position.id);
      
      expect(result.principal).toBe(100);
      expect(result.interest).toBe(5.5);
      expect(result.total).toBe(105.5);
      
      const positions = defiService.getLendingPositions();
      expect(positions.find(p => p.id === position.id)).toBeUndefined();
    });
  });

  describe('repayBorrow', () => {
    it('should repay borrow and release collateral', () => {
      const position = defiService.borrow('KuberLend', 'USDC', 100, 'KC', 200, 5);
      
      const result = defiService.repayBorrow(position.id);
      
      expect(result.repaidAmount).toBe(100);
      expect(result.collateralReturned).toBe(200);
      
      const positions = defiService.getBorrowPositions();
      expect(positions.find(p => p.id === position.id)).toBeUndefined();
    });
  });

  describe('removeLiquidity', () => {
    it('should remove liquidity and return tokens', () => {
      const pools = defiService.getLiquidityPools();
      const pool = pools[0];
      
      const position = defiService.addLiquidity(pool.id, 100, 100);
      position.feesEarned = 5.5;
      
      const result = defiService.removeLiquidity(position.id);
      
      expect(result.token0Amount).toBe(100);
      expect(result.token1Amount).toBe(100);
      expect(result.feesEarned).toBe(5.5);
    });
  });
});
