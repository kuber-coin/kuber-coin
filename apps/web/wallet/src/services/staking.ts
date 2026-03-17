// Staking Service
// Manage staking operations and rewards via wallet API

import walletApi from './walletApi';

const allowFallback = process.env.NEXT_PUBLIC_WALLET_API_FALLBACKS !== 'false';

export interface StakingPool {
  id: string;
  name: string;
  validatorAddress: string;
  apy: number;
  minStake: number;
  lockPeriod: number; // days
  totalStaked: number;
  stakerCount: number;
  status: 'active' | 'full' | 'maintenance';
}

export interface StakingPosition {
  id: string;
  poolId: string;
  amount: number;
  stakedAt: number;
  unlocksAt: number;
  rewards: number;
  autoCompound: boolean;
  status: 'active' | 'unlocking' | 'unlocked';
}

class StakingService {
  private pools: StakingPool[] = [];
  private positions: StakingPosition[] = [];

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private defaultPools(): StakingPool[] {
    return [
      {
        id: 'flexible-pool',
        name: 'Flexible Pool',
        validatorAddress: 'KC1validatorflex',
        apy: 8.5,
        minStake: 1,
        lockPeriod: 0,
        totalStaked: 125000,
        stakerCount: 320,
        status: 'active',
      },
      {
        id: 'growth-pool',
        name: 'Growth Pool',
        validatorAddress: 'KC1validatorgrowth',
        apy: 12.2,
        minStake: 10,
        lockPeriod: 30,
        totalStaked: 540000,
        stakerCount: 1280,
        status: 'active',
      },
      {
        id: 'secure-pool',
        name: 'Secure Pool',
        validatorAddress: 'KC1validatorsecure',
        apy: 6.0,
        minStake: 5,
        lockPeriod: 90,
        totalStaked: 820000,
        stakerCount: 450,
        status: 'active',
      },
    ];
  }


  async refreshPools(): Promise<StakingPool[]> {
    try {
      const response = await walletApi.get<{ pools: StakingPool[] }>('/api/staking/pools');
      this.pools = response.pools || [];
    } catch (error) {
      if (!allowFallback) throw error;
      if (this.pools.length === 0) {
        this.pools = this.defaultPools();
      }
    }
    return this.getStakingPools();
  }

  async refreshPositions(): Promise<StakingPosition[]> {
    try {
      const response = await walletApi.get<{ positions: StakingPosition[] }>('/api/staking/positions');
      this.positions = response.positions || [];
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached positions when offline.
    }
    return this.getPositions();
  }

  getStakingPools(): StakingPool[] {
    return [...this.pools].sort((a, b) => b.apy - a.apy);
  }

  async stake(poolId: string, amount: number, autoCompound: boolean = false): Promise<StakingPosition> {
    try {
      const response = await walletApi.post<{ position: StakingPosition }>('/api/staking/stake', {
        poolId,
        amount,
        autoCompound,
      });
      const position = response.position;
      this.positions = [position, ...this.positions.filter((p) => p.id !== position.id)];
      return position;
    } catch (error) {
      if (!allowFallback) throw error;
      const now = Date.now();
      const pool = this.pools.find((p) => p.id === poolId);
      const lockDays = pool?.lockPeriod ?? 0;
      const position: StakingPosition = {
        id: this.createId('stake'),
        poolId,
        amount,
        stakedAt: now,
        unlocksAt: now + lockDays * 24 * 60 * 60 * 1000,
        rewards: 0,
        autoCompound,
        status: 'active',
      };
      this.positions = [position, ...this.positions.filter((p) => p.id !== position.id)];
      if (pool) {
        pool.totalStaked += amount;
        pool.stakerCount += 1;
      }
      return position;
    }
  }

  async unstake(positionId: string): Promise<void> {
    try {
      await walletApi.post('/api/staking/unstake', { positionId });
      await this.refreshPositions();
    } catch (error) {
      if (!allowFallback) throw error;
      const position = this.positions.find((p) => p.id === positionId);
      if (position) {
        position.status = 'unlocked';
      }
    }
  }

  getPositions(): StakingPosition[] {
    return [...this.positions].sort((a, b) => b.stakedAt - a.stakedAt);
  }

  calculateRewards(positionId: string): number {
    const position = this.positions.find((p) => p.id === positionId);
    if (!position) return 0;

    const pool = this.pools.find((p) => p.id === position.poolId);
    if (!pool) return 0;

    const daysStaked = (Date.now() - position.stakedAt) / (24 * 60 * 60 * 1000);
    const rewards = (position.amount * pool.apy / 100 / 365) * daysStaked;

    position.rewards = rewards;
    return rewards;
  }

  async claimRewards(positionId: string): Promise<number> {
    try {
      const response = await walletApi.post<{ rewards: number }>('/api/staking/claim', { positionId });
      await this.refreshPositions();
      return response.rewards || 0;
    } catch (error) {
      if (!allowFallback) throw error;
      const position = this.positions.find((p) => p.id === positionId);
      const rewards = position ? position.rewards : 0;
      if (position) {
        position.rewards = 0;
      }
      return rewards;
    }
  }

  getTotalStaked(): number {
    return this.positions.reduce((sum, p) => sum + p.amount, 0);
  }

  getTotalRewards(): number {
    return this.positions.reduce((sum, p) => {
      this.calculateRewards(p.id);
      return sum + p.rewards;
    }, 0);
  }
}

const stakingService = new StakingService();
export default stakingService;
