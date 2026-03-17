// Advanced Fee Management Service
// Real-time fee market data and estimation

export interface FeeEstimate {
  targetBlocks: number;
  feeRate: number; // satoshis per vByte
  estimatedTime: string;
}

export interface FeeMarketData {
  timestamp: number;
  slow: FeeEstimate;
  medium: FeeEstimate;
  fast: FeeEstimate;
  urgent: FeeEstimate;
  mempoolSize: number;
  mempoolBytes: number;
}

export interface FeeHistoryPoint {
  timestamp: number;
  slow: number;
  medium: number;
  fast: number;
}

class FeeManagerService {
  private currentMarket: FeeMarketData | null = null;
  private history: FeeHistoryPoint[] = [];
  private readonly MAX_HISTORY = 144; // 24 hours at 10-minute intervals
  private readonly STORAGE_KEY = 'kubercoin_fee_history';

  constructor() {
    this.loadHistory();
    this.startMonitoring();
  }

  private loadHistory() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      this.history = JSON.parse(stored);
    }
  }

  private saveHistory() {
    // Keep only last 24 hours
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history));
  }

  private startMonitoring() {
    // Update fee estimates every 60 seconds
    setInterval(() => {
      this.updateFeeMarket();
    }, 60000);

    // Initial update
    this.updateFeeMarket();
  }

  async updateFeeMarket(): Promise<FeeMarketData> {
    try {
      // In production, fetch from API
      // For now, simulate realistic fee market
      const baseRate = 10 + Math.random() * 50; // 10-60 sat/vB

      this.currentMarket = {
        timestamp: Date.now(),
        slow: {
          targetBlocks: 144, // ~24 hours
          feeRate: Math.round(baseRate * 0.5),
          estimatedTime: '~24 hours',
        },
        medium: {
          targetBlocks: 6, // ~1 hour
          feeRate: Math.round(baseRate),
          estimatedTime: '~1 hour',
        },
        fast: {
          targetBlocks: 2, // ~20 minutes
          feeRate: Math.round(baseRate * 1.5),
          estimatedTime: '~20 minutes',
        },
        urgent: {
          targetBlocks: 1, // next block
          feeRate: Math.round(baseRate * 2.5),
          estimatedTime: 'Next block',
        },
        mempoolSize: Math.round(5000 + Math.random() * 50000),
        mempoolBytes: Math.round(10000000 + Math.random() * 100000000),
      };

      // Add to history
      this.history.push({
        timestamp: Date.now(),
        slow: this.currentMarket.slow.feeRate,
        medium: this.currentMarket.medium.feeRate,
        fast: this.currentMarket.fast.feeRate,
      });

      this.saveHistory();
      return this.currentMarket;
    } catch (error) {
      console.error('Failed to update fee market:', error);
      throw error;
    }
  }

  getCurrentMarket(): FeeMarketData | null {
    return this.currentMarket;
  }

  getFeeHistory(hours: number = 24): FeeHistoryPoint[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.history.filter((point) => point.timestamp >= cutoff);
  }

  estimateFee(targetBlocks: number): FeeEstimate {
    if (!this.currentMarket) {
      // Fallback estimates
      return {
        targetBlocks,
        feeRate: Math.round(20 / Math.sqrt(targetBlocks)),
        estimatedTime: this.estimateTime(targetBlocks),
      };
    }

    // Interpolate between known points
    if (targetBlocks >= 144)
      return this.currentMarket.slow;
    if (targetBlocks >= 6)
      return this.interpolate(
        this.currentMarket.medium,
        this.currentMarket.slow,
        targetBlocks,
        6,
        144
      );
    if (targetBlocks >= 2)
      return this.interpolate(
        this.currentMarket.fast,
        this.currentMarket.medium,
        targetBlocks,
        2,
        6
      );
    return this.currentMarket.urgent;
  }

  private interpolate(
    lower: FeeEstimate,
    upper: FeeEstimate,
    target: number,
    lowerBlocks: number,
    upperBlocks: number
  ): FeeEstimate {
    const ratio = (target - lowerBlocks) / (upperBlocks - lowerBlocks);
    const feeRate = Math.round(
      lower.feeRate + (upper.feeRate - lower.feeRate) * ratio
    );

    return {
      targetBlocks: target,
      feeRate,
      estimatedTime: this.estimateTime(target),
    };
  }

  private estimateTime(blocks: number): string {
    const minutes = blocks * 10; // Assume 10-minute blocks
    if (minutes < 60) return `~${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `~${hours} hour${hours > 1 ? 's' : ''}`;
    const days = Math.round(hours / 24);
    return `~${days} day${days > 1 ? 's' : ''}`;
  }

  calculateTxFee(
    inputCount: number,
    outputCount: number,
    feeRatePerVByte: number
  ): number {
    // Estimate transaction size in vBytes
    // Base: 10 bytes (version, locktime, etc.)
    // Each input: ~148 bytes (typical P2PKH)
    // Each output: ~34 bytes (typical P2PKH)
    const vBytes = 10 + inputCount * 148 + outputCount * 34;
    const fee = (vBytes * feeRatePerVByte) / 100000000; // Convert sat to KC
    return fee;
  }

  // Replace-By-Fee (RBF) - calculate new fee for replacement
  calculateRBFFee(
    originalFee: number,
    inputCount: number,
    outputCount: number
  ): number {
    const vBytes = 10 + inputCount * 148 + outputCount * 34;
    const originalFeeRate = (originalFee * 100000000) / vBytes;

    // RBF requires at least 1 sat/vB increase
    const newFeeRate = originalFeeRate + 5; // Add 5 sat/vB for better chance
    return this.calculateTxFee(inputCount, outputCount, newFeeRate);
  }

  // Child-Pays-For-Parent (CPFP) - calculate child fee
  calculateCPFPFee(
    parentFee: number,
    parentSize: number,
    childInputCount: number,
    childOutputCount: number,
    targetFeeRate: number
  ): number {
    const childSize = 10 + childInputCount * 148 + childOutputCount * 34;
    const totalSize = parentSize + childSize;

    // Total fee needed for both transactions
    const totalFeeNeeded = (totalSize * targetFeeRate) / 100000000;

    // Child must pay for itself and cover parent deficit
    const childFee = totalFeeNeeded - parentFee;
    return Math.max(childFee, 0.00001); // Minimum dust limit
  }

  getMempoolInfo(): { size: number; bytes: number } {
    return {
      size: this.currentMarket?.mempoolSize || 0,
      bytes: this.currentMarket?.mempoolBytes || 0,
    };
  }

  getRecommendedFee(urgency: 'slow' | 'medium' | 'fast' | 'urgent'): number {
    if (!this.currentMarket) return 20; // Default fallback
    return this.currentMarket[urgency].feeRate;
  }

  async forceMerkUpdate(): Promise<void> {
    await this.updateFeeMarket();
  }

  clearHistory(): void {
    this.history = [];
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

const feeManagerService = new FeeManagerService();
export default feeManagerService;
