// DeFi Service
// Decentralized finance integrations

export interface LendingPosition {
  id: string;
  protocol: string;
  asset: string;
  amount: number;
  apy: number;
  startDate: number;
  interestEarned: number;
  status: 'active' | 'withdrawn';
}

export interface BorrowPosition {
  id: string;
  protocol: string;
  borrowedAsset: string;
  borrowedAmount: number;
  collateralAsset: string;
  collateralAmount: number;
  interestRate: number;
  liquidationPrice: number;
  healthFactor: number;
  startDate: number;
  status: 'active' | 'repaid' | 'liquidated';
}

export interface LiquidityPool {
  id: string;
  protocol: string;
  name: string;
  token0: string;
  token1: string;
  token0Reserve: number;
  token1Reserve: number;
  apy: number;
  totalValueLocked: number;
}

export interface LiquidityPosition {
  id: string;
  poolId: string;
  token0Amount: number;
  token1Amount: number;
  lpTokens: number;
  addedAt: number;
  feesEarned: number;
}

class DeFiService {
  private lendingPositions: Map<string, LendingPosition> = new Map();
  private borrowPositions: Map<string, BorrowPosition> = new Map();
  private liquidityPools: Map<string, LiquidityPool> = new Map();
  private liquidityPositions: Map<string, LiquidityPosition> = new Map();
  
  private readonly STORAGE_KEY_LENDING = 'kubercoin_defi_lending';
  private readonly STORAGE_KEY_BORROW = 'kubercoin_defi_borrow';
  private readonly STORAGE_KEY_POOLS = 'kubercoin_defi_pools';
  private readonly STORAGE_KEY_LIQUIDITY = 'kubercoin_defi_liquidity';

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadData();
  }

  private loadData() {
    if (!this.isBrowser()) return;
    try {
      const lending = localStorage.getItem(this.STORAGE_KEY_LENDING);
      if (lending) {
        const positions = JSON.parse(lending);
        positions.forEach((p: LendingPosition) => this.lendingPositions.set(p.id, p));
      }

      const borrow = localStorage.getItem(this.STORAGE_KEY_BORROW);
      if (borrow) {
        const positions = JSON.parse(borrow);
        positions.forEach((p: BorrowPosition) => this.borrowPositions.set(p.id, p));
      }

      const pools = localStorage.getItem(this.STORAGE_KEY_POOLS);
      if (pools) {
        const poolList = JSON.parse(pools);
        poolList.forEach((p: LiquidityPool) => this.liquidityPools.set(p.id, p));
      }

      const liquidity = localStorage.getItem(this.STORAGE_KEY_LIQUIDITY);
      if (liquidity) {
        const positions = JSON.parse(liquidity);
        positions.forEach((p: LiquidityPosition) => this.liquidityPositions.set(p.id, p));
      }
    } catch {
      // Ignore storage/parse errors
    }
  }

  private saveData() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(
        this.STORAGE_KEY_LENDING,
        JSON.stringify(Array.from(this.lendingPositions.values()))
      );
      localStorage.setItem(
        this.STORAGE_KEY_BORROW,
        JSON.stringify(Array.from(this.borrowPositions.values()))
      );
      localStorage.setItem(
        this.STORAGE_KEY_POOLS,
        JSON.stringify(Array.from(this.liquidityPools.values()))
      );
      localStorage.setItem(
        this.STORAGE_KEY_LIQUIDITY,
        JSON.stringify(Array.from(this.liquidityPositions.values()))
      );
    } catch {
      // Ignore storage write errors
    }
  }


  // Lending
  lend(protocol: string, asset: string, amount: number, apy: number): LendingPosition {
    const position: LendingPosition = {
      id: `lend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      protocol,
      asset,
      amount,
      apy,
      startDate: Date.now(),
      interestEarned: 0,
      status: 'active',
    };

    this.lendingPositions.set(position.id, position);
    this.saveData();
    return position;
  }

  getLendingPositions(): LendingPosition[] {
    return Array.from(this.lendingPositions.values()).sort((a, b) => b.startDate - a.startDate);
  }

  calculateLendingInterest(positionId: string): number {
    const position = this.lendingPositions.get(positionId);
    if (!position) return 0;

    const daysLending = (Date.now() - position.startDate) / (24 * 60 * 60 * 1000);
    const interest = (position.amount * position.apy / 100 / 365) * daysLending;
    
    position.interestEarned = interest;
    this.saveData();
    return interest;
  }

  // Borrowing
  borrow(
    protocol: string,
    borrowedAsset: string,
    borrowedAmount: number,
    collateralAsset: string,
    collateralAmount: number,
    interestRate: number
  ): BorrowPosition {
    const liquidationPrice = (borrowedAmount * 1.5) / collateralAmount;
    const healthFactor = (collateralAmount * 0.75) / borrowedAmount;

    const position: BorrowPosition = {
      id: `borrow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      protocol,
      borrowedAsset,
      borrowedAmount,
      collateralAsset,
      collateralAmount,
      interestRate,
      liquidationPrice,
      healthFactor,
      startDate: Date.now(),
      status: 'active',
    };

    this.borrowPositions.set(position.id, position);
    this.saveData();
    return position;
  }

  getBorrowPositions(): BorrowPosition[] {
    return Array.from(this.borrowPositions.values()).sort((a, b) => b.startDate - a.startDate);
  }

  // Liquidity Pools
  getLiquidityPools(): LiquidityPool[] {
    return Array.from(this.liquidityPools.values()).sort((a, b) => b.apy - a.apy);
  }

  addLiquidity(poolId: string, token0Amount: number, token1Amount: number): LiquidityPosition {
    const pool = this.liquidityPools.get(poolId);
    if (!pool) throw new Error('Pool not found');

    const lpTokens = Math.sqrt(token0Amount * token1Amount);

    const position: LiquidityPosition = {
      id: `liq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      poolId,
      token0Amount,
      token1Amount,
      lpTokens,
      addedAt: Date.now(),
      feesEarned: 0,
    };

    pool.token0Reserve += token0Amount;
    pool.token1Reserve += token1Amount;

    this.liquidityPositions.set(position.id, position);
    this.saveData();
    return position;
  }

  getLiquidityPositions(): LiquidityPosition[] {
    return Array.from(this.liquidityPositions.values()).sort((a, b) => b.addedAt - a.addedAt);
  }

  calculateLiquidityFees(positionId: string): number {
    const position = this.liquidityPositions.get(positionId);
    if (!position) return 0;

    const pool = this.liquidityPools.get(position.poolId);
    if (!pool) return 0;

    const daysProviding = (Date.now() - position.addedAt) / (24 * 60 * 60 * 1000);
    const fees = (position.lpTokens * pool.apy / 100 / 365) * daysProviding;

    position.feesEarned = fees;
    this.saveData();
    return fees;
  }
}

const defiService = new DeFiService();
export default defiService;
