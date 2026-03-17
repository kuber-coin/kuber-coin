// Portfolio Rebalancer Service
// Automated portfolio allocation and rebalancing

export interface Asset {
  symbol: string;
  balance: number;
  value: number;
  percentage: number;
}

export interface TargetAllocation {
  symbol: string;
  targetPercentage: number;
}

export interface RebalanceAction {
  from: string;
  to: string;
  amount: number;
  value: number;
}

export interface RebalanceLog {
  id: string;
  timestamp: number;
  actions: RebalanceAction[];
  portfolioValueBefore: number;
  portfolioValueAfter: number;
  gainsLosses: number;
}

class RebalancerService {
  private targetAllocations: Map<string, number> = new Map();
  private rebalanceHistory: RebalanceLog[] = [];
  private readonly STORAGE_KEY_TARGETS = 'kubercoin_target_allocations';
  private readonly STORAGE_KEY_HISTORY = 'kubercoin_rebalance_history';

  constructor() {
    // Client components can be pre-rendered on the server; avoid localStorage there.
    if (typeof window === 'undefined') return;

    this.loadTargetAllocations();
    this.loadHistory();
  }

  private loadTargetAllocations() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_TARGETS);
      if (stored) {
        const allocations = JSON.parse(stored);
        allocations.forEach((a: TargetAllocation) => {
          this.targetAllocations.set(a.symbol, a.targetPercentage);
        });
      }
    } catch (error) {
      console.error('Failed to load target allocations:', error);
    }
  }

  private saveTargetAllocations() {
    if (typeof window === 'undefined') return;

    const allocations = Array.from(this.targetAllocations.entries()).map(
      ([symbol, targetPercentage]) => ({ symbol, targetPercentage })
    );
    try {
      localStorage.setItem(this.STORAGE_KEY_TARGETS, JSON.stringify(allocations));
    } catch (error) {
      console.error('Failed to save target allocations:', error);
    }
  }

  private loadHistory() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_HISTORY);
      if (stored) {
        this.rebalanceHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load rebalance history:', error);
    }
  }

  private saveHistory() {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.STORAGE_KEY_HISTORY, JSON.stringify(this.rebalanceHistory));
    } catch (error) {
      console.error('Failed to save rebalance history:', error);
    }
  }

  // Calculate current portfolio allocation
  calculateCurrentAllocation(wallets: any[]): Asset[] {
    const totalValue = wallets.reduce((sum, w) => sum + w.balance, 0);
    
    return wallets.map((wallet) => ({
      symbol: wallet.label || wallet.address.substring(0, 8),
      balance: wallet.balance,
      value: wallet.balance, // In production, multiply by price
      percentage: totalValue > 0 ? (wallet.balance / totalValue) * 100 : 0,
    }));
  }

  // Set target allocation
  setTargetAllocation(symbol: string, percentage: number) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    this.targetAllocations.set(symbol, percentage);
    this.saveTargetAllocations();
  }

  getTargetAllocation(symbol: string): number {
    return this.targetAllocations.get(symbol) || 0;
  }

  getAllTargetAllocations(): TargetAllocation[] {
    return Array.from(this.targetAllocations.entries()).map(
      ([symbol, targetPercentage]) => ({ symbol, targetPercentage })
    );
  }

  // Calculate rebalancing actions needed
  calculateRebalanceActions(currentAssets: Asset[]): RebalanceAction[] {
    const actions: RebalanceAction[] = [];
    const totalValue = currentAssets.reduce((sum, a) => sum + a.value, 0);

    if (totalValue === 0) return actions;

    // Calculate differences
    const differences = currentAssets.map((asset) => {
      const targetPercentage = this.getTargetAllocation(asset.symbol);
      const targetValue = (totalValue * targetPercentage) / 100;
      const diff = targetValue - asset.value;

      return {
        symbol: asset.symbol,
        currentValue: asset.value,
        targetValue,
        diff,
      };
    });

    // Find assets to sell (negative diff) and buy (positive diff)
    const toSell = differences.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff);
    const toBuy = differences.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff);

    // Create rebalancing actions
    let sellIndex = 0;
    let buyIndex = 0;

    while (sellIndex < toSell.length && buyIndex < toBuy.length) {
      const seller = toSell[sellIndex];
      const buyer = toBuy[buyIndex];

      const sellAmount = Math.abs(seller.diff);
      const buyAmount = buyer.diff;
      const transferAmount = Math.min(sellAmount, buyAmount);

      actions.push({
        from: seller.symbol,
        to: buyer.symbol,
        amount: transferAmount / totalValue, // As a fraction
        value: transferAmount,
      });

      seller.diff += transferAmount;
      buyer.diff -= transferAmount;

      if (Math.abs(seller.diff) < 0.01) sellIndex++;
      if (Math.abs(buyer.diff) < 0.01) buyIndex++;
    }

    return actions;
  }

  // Execute rebalancing
  executeRebalance(
    currentAssets: Asset[],
    actions: RebalanceAction[]
  ): RebalanceLog {
    const totalValueBefore = currentAssets.reduce((sum, a) => sum + a.value, 0);

    const log: RebalanceLog = {
      id: `rebalance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      actions,
      portfolioValueBefore: totalValueBefore,
      portfolioValueAfter: totalValueBefore, // In production, recalculate after
      gainsLosses: 0,
    };

    this.rebalanceHistory.push(log);
    this.saveHistory();

    return log;
  }

  // Get rebalancing history
  getRebalanceHistory(): RebalanceLog[] {
    return this.rebalanceHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Calculate portfolio metrics
  calculateMetrics(currentAssets: Asset[]): {
    totalValue: number;
    diversification: number;
    imbalanceScore: number;
  } {
    const totalValue = currentAssets.reduce((sum, a) => sum + a.value, 0);

    // Diversification (Herfindahl index)
    const herfindahl = currentAssets.reduce(
      (sum, a) => sum + Math.pow(a.percentage / 100, 2),
      0
    );
    const diversification = (1 - herfindahl) * 100;

    // Imbalance score (sum of absolute differences from target)
    const imbalanceScore = currentAssets.reduce((sum, asset) => {
      const target = this.getTargetAllocation(asset.symbol);
      return sum + Math.abs(asset.percentage - target);
    }, 0);

    return {
      totalValue,
      diversification,
      imbalanceScore,
    };
  }

  // Auto-rebalance threshold check
  shouldRebalance(currentAssets: Asset[], threshold: number = 5): boolean {
    const metrics = this.calculateMetrics(currentAssets);
    return metrics.imbalanceScore > threshold;
  }

  clearAllData(): void {
    this.targetAllocations.clear();
    this.rebalanceHistory = [];
    localStorage.removeItem(this.STORAGE_KEY_TARGETS);
    localStorage.removeItem(this.STORAGE_KEY_HISTORY);
  }
}

const rebalancerService = new RebalancerService();
export default rebalancerService;
