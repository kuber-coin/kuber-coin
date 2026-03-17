/**
 * Unit Tests for Staking Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import stakingService from '../../../src/services/staking';

describe('Staking Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getStakingPools', () => {
    it('should return available staking pools', () => {
      const pools = stakingService.getStakingPools();
      
      expect(pools.length).toBeGreaterThan(0);
      expect(pools[0]).toHaveProperty('name');
      expect(pools[0]).toHaveProperty('apy');
      expect(pools[0]).toHaveProperty('minStake');
    });
  });

  describe('stake', () => {
    it('should create staking position', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      expect(position.poolId).toBe(pools[0].id);
      expect(position.amount).toBe(100);
      expect(position.autoCompound).toBe(false);
      expect(position.rewards).toBe(0);
    });

    it('should enforce minimum stake', () => {
      const pools = stakingService.getStakingPools();
      const minStake = pools[0].minStake;
      
      expect(() => stakingService.stake(pools[0].id, minStake - 1, false)).toThrow();
    });

    it('should set unlock date based on lock period', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      const expectedUnlock = Date.now() + (pools[0].lockPeriod * 24 * 60 * 60 * 1000);
      expect(position.unlocksAt).toBeGreaterThan(Date.now());
      expect(position.unlocksAt).toBeLessThanOrEqual(expectedUnlock + 1000);
    });
  });

  describe('calculateRewards', () => {
    it('should calculate rewards based on APY', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      // Simulate time passing
      position.stakedAt = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
      
      stakingService.calculateRewards(position.id);
      const updated = stakingService.getPositions().find(p => p.id === position.id);
      
      expect(updated!.rewards).toBeGreaterThan(0);
    });

    it('should compound rewards if auto-compound enabled', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, true);
      
      position.stakedAt = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      stakingService.calculateRewards(position.id);
      const updated = stakingService.getPositions().find(p => p.id === position.id);
      
      if (updated!.rewards > 0) {
        expect(updated!.amount).toBeGreaterThan(100);
      }
    });
  });

  describe('unstake', () => {
    it('should not allow unstaking before unlock', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      expect(() => stakingService.unstake(position.id)).toThrow(/locked|unlock/i);
    });

    it('should allow unstaking after unlock period', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      // Manually set unlock time to past
      position.unlocksAt = Date.now() - 1000;
      
      const result = stakingService.unstake(position.id);
      expect(result).toBe(true);
      
      const positions = stakingService.getPositions();
      expect(positions.find(p => p.id === position.id)).toBeUndefined();
    });
  });

  describe('claimRewards', () => {
    it('should claim accumulated rewards', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      // Set some rewards
      position.rewards = 5.5;
      
      const claimed = stakingService.claimRewards(position.id);
      
      expect(claimed).toBe(5.5);
      
      const updated = stakingService.getPositions().find(p => p.id === position.id);
      expect(updated!.rewards).toBe(0);
    });

    it('should return 0 for no rewards', () => {
      const pools = stakingService.getStakingPools();
      const position = stakingService.stake(pools[0].id, 100, false);
      
      const claimed = stakingService.claimRewards(position.id);
      expect(claimed).toBe(0);
    });
  });

  describe('getTotalStaked', () => {
    it('should sum all staked amounts', () => {
      const pools = stakingService.getStakingPools();
      
      stakingService.stake(pools[0].id, 100, false);
      stakingService.stake(pools[0].id, 200, false);
      stakingService.stake(pools[0].id, 300, false);
      
      const total = stakingService.getTotalStaked();
      expect(total).toBe(600);
    });
  });

  describe('getTotalRewards', () => {
    it('should sum all rewards', () => {
      const pools = stakingService.getStakingPools();
      
      const pos1 = stakingService.stake(pools[0].id, 100, false);
      const pos2 = stakingService.stake(pools[0].id, 100, false);
      
      pos1.rewards = 5;
      pos2.rewards = 10;
      
      const total = stakingService.getTotalRewards();
      expect(total).toBe(15);
    });
  });
});
