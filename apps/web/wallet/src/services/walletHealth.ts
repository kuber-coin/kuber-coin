import walletService from './wallet';

export interface HealthScore {
  score: number; // 0-100
  rating: string; // Excellent, Good, Fair, Poor
  summary: string;
  metrics: {
    utxoCount: number;
    utxoScore: number;
    dustAmount: number;
    dustScore: number;
    averageFee: number;
    feeEfficiencyScore: number;
    addressReuse: number;
    privacyScore: number;
    walletAge: number;
    transactionCount: number;
    totalFeesPaid: number;
    walletSize: number; // bytes
  };
}

export interface OptimizationSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
  impact?: string;
  estimatedSavings?: number;
  action?: () => void;
}

class WalletHealth {
  async calculateHealthScore(): Promise<HealthScore> {
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) {
        return this.getEmptyHealthScore();
      }

      const utxos = await this.getUTXOs();
      const transactions = await walletService.getTransactionHistory(wallet.address);

      // Calculate individual scores
      const utxoScore = this.calculateUTXOScore(utxos.length);
      const dustScore = this.calculateDustScore(utxos);
      const feeEfficiencyScore = this.calculateFeeEfficiencyScore(transactions);
      const privacyScore = this.calculatePrivacyScore(transactions);

      // Calculate overall score (weighted average)
      const overallScore = Math.round(
        utxoScore * 0.3 +
        dustScore * 0.2 +
        feeEfficiencyScore * 0.3 +
        privacyScore * 0.2
      );

      // Determine rating
      let rating: string;
      if (overallScore >= 80) rating = 'Excellent';
      else if (overallScore >= 60) rating = 'Good';
      else if (overallScore >= 40) rating = 'Fair';
      else rating = 'Poor';

      // Generate summary
      const summary = this.generateSummary(overallScore, rating);

      // Calculate metrics
      const dustAmount = this.calculateDustAmount(utxos);
      const averageFee = this.calculateAverageFee(transactions);
      const addressReuse = this.countAddressReuse(transactions);
      const walletAge = this.calculateWalletAge(wallet);
      const totalFeesPaid = this.calculateTotalFees(transactions);
      const walletSize = this.estimateWalletSize(wallet, transactions);

      return {
        score: overallScore,
        rating,
        summary,
        metrics: {
          utxoCount: utxos.length,
          utxoScore,
          dustAmount,
          dustScore,
          averageFee,
          feeEfficiencyScore,
          addressReuse,
          privacyScore,
          walletAge,
          transactionCount: transactions.length,
          totalFeesPaid,
          walletSize,
        },
      };
    } catch {
      return this.getEmptyHealthScore();
    }
  }

  private getEmptyHealthScore(): HealthScore {
    return {
      score: 0,
      rating: 'N/A',
      summary: 'No wallet data available',
      metrics: {
        utxoCount: 0,
        utxoScore: 0,
        dustAmount: 0,
        dustScore: 0,
        averageFee: 0,
        feeEfficiencyScore: 0,
        addressReuse: 0,
        privacyScore: 0,
        walletAge: 0,
        transactionCount: 0,
        totalFeesPaid: 0,
        walletSize: 0,
      },
    };
  }

  private async getUTXOs(): Promise<any[]> {
    const wallet = walletService.getActiveWallet();
    if (!wallet) return [];
    return walletService.getUtxos(wallet.address, 0);
  }

  private calculateUTXOScore(count: number): number {
    // Optimal UTXO count is 5-20
    // Too few: limits flexibility
    // Too many: increases transaction size and fees
    if (count >= 5 && count <= 20) return 100;
    if (count < 5) return Math.max(50, count * 20);
    if (count <= 50) return 100 - ((count - 20) * 2);
    if (count <= 100) return 50 - ((count - 50) * 1);
    return Math.max(0, 50 - (count - 100));
  }

  private calculateDustScore(utxos: any[]): number {
    const dustThreshold = 0.0001; // KC
    const dustUtxos = utxos.filter(utxo => utxo.amount < dustThreshold);
    const dustPercentage = (dustUtxos.length / utxos.length) * 100;
    
    // Lower dust percentage = higher score
    return Math.max(0, 100 - dustPercentage * 2);
  }

  private calculateDustAmount(utxos: any[]): number {
    const dustThreshold = 0.0001; // KC
    return utxos
      .filter(utxo => utxo.amount < dustThreshold)
      .reduce((sum, utxo) => sum + utxo.amount, 0);
  }

  private calculateFeeEfficiencyScore(transactions: any[]): number {
    if (transactions.length === 0) return 100;

    const fees = transactions.map(tx => tx.fee || 0);
    const avgFee = fees.reduce((sum, fee) => sum + fee, 0) / fees.length;

    // Ideal fee is 0.00001 KC (0.001%)
    const idealFee = 0.00001;
    const efficiency = idealFee / (avgFee || idealFee);
    
    return Math.min(100, efficiency * 100);
  }

  private calculateAverageFee(transactions: any[]): number {
    if (transactions.length === 0) return 0;
    const fees = transactions.map(tx => tx.fee || 0);
    return fees.reduce((sum, fee) => sum + fee, 0) / fees.length;
  }

  private calculatePrivacyScore(transactions: any[]): number {
    const addressReuse = this.countAddressReuse(transactions);
    
    // Penalize address reuse
    const reuseScore = Math.max(0, 100 - addressReuse * 10);
    
    // Check for other privacy issues
    // In production: check for mixing, coin selection strategy, etc.
    
    return reuseScore;
  }

  private countAddressReuse(transactions: any[]): number {
    const addressCounts: Record<string, number> = {};
    
    transactions.forEach(tx => {
      tx.inputs?.forEach((inp: any) => {
        addressCounts[inp.address] = (addressCounts[inp.address] || 0) + 1;
      });
      tx.outputs?.forEach((out: any) => {
        addressCounts[out.address] = (addressCounts[out.address] || 0) + 1;
      });
    });

    return Object.values(addressCounts).filter(count => count > 1).length;
  }

  private calculateWalletAge(wallet: any): number {
    const created = new Date(wallet.createdAt || Date.now());
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calculateTotalFees(transactions: any[]): number {
    return transactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  }

  private estimateWalletSize(wallet: any, transactions: any[]): number {
    // Rough estimate: wallet metadata + transaction data
    const walletData = JSON.stringify(wallet).length;
    const txData = transactions.length * 250; // ~250 bytes per transaction
    return walletData + txData;
  }

  private generateSummary(score: number, rating: string): string {
    if (score >= 80) {
      return 'Your wallet is in excellent condition! Keep up the good maintenance practices.';
    } else if (score >= 60) {
      return 'Your wallet is in good shape, but there are some optimizations you can make.';
    } else if (score >= 40) {
      return 'Your wallet needs attention. Consider optimizing UTXOs and consolidating dust.';
    } else {
      return 'Your wallet requires immediate maintenance to improve efficiency and reduce fees.';
    }
  }

  async getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const healthScore = await this.calculateHealthScore();

    // UTXO optimization
    if (healthScore.metrics.utxoCount > 50) {
      suggestions.push({
        title: 'High UTXO Count',
        description: `You have ${healthScore.metrics.utxoCount} UTXOs. Consolidating them will reduce future transaction fees.`,
        priority: 'high',
        icon: '⚡',
        impact: 'Reduces transaction size and fees by up to 50%',
        estimatedSavings: healthScore.metrics.utxoCount * 0.00001,
      });
    }

    // Dust consolidation
    if (healthScore.metrics.dustAmount > 0.001) {
      suggestions.push({
        title: 'Dust Consolidation Needed',
        description: `You have ${healthScore.metrics.dustAmount.toFixed(6)} KC in dust. Consolidate to improve efficiency.`,
        priority: 'medium',
        icon: '🧹',
        impact: 'Recovers unusable small amounts',
        estimatedSavings: healthScore.metrics.dustAmount * 0.8, // 80% recovery after fees
      });
    }

    // Fee efficiency
    if (healthScore.metrics.feeEfficiencyScore < 60) {
      suggestions.push({
        title: 'High Transaction Fees',
        description: `Your average fee (${healthScore.metrics.averageFee.toFixed(6)} KC) is higher than optimal.`,
        priority: 'medium',
        icon: '💸',
        impact: 'Can reduce fees by up to 30%',
      });
    }

    // Address reuse
    if (healthScore.metrics.addressReuse > 0) {
      suggestions.push({
        title: 'Address Reuse Detected',
        description: `${healthScore.metrics.addressReuse} addresses have been reused, reducing privacy.`,
        priority: 'low',
        icon: '🔒',
        impact: 'Improves transaction privacy',
      });
    }

    // Wallet size
    if (healthScore.metrics.walletSize > 1024 * 100) { // > 100 KB
      suggestions.push({
        title: 'Large Wallet Size',
        description: `Your wallet is ${(healthScore.metrics.walletSize / 1024).toFixed(2)} KB. Consider archiving old transactions.`,
        priority: 'low',
        icon: '📦',
        impact: 'Improves wallet loading speed',
      });
    }

    return suggestions;
  }

  async checkAddressReuse(): Promise<{ reused: string[]; count: number }> {
    const wallet = walletService.getActiveWallet();
    if (!wallet) return { reused: [], count: 0 };
    
    const transactions = await walletService.getTransactionHistory(wallet.address);
    const addressCounts: Record<string, number> = {};

    transactions.forEach(tx => {
      tx.inputs?.forEach((inp: any) => {
        addressCounts[inp.address] = (addressCounts[inp.address] || 0) + 1;
      });
      tx.outputs?.forEach((out: any) => {
        addressCounts[out.address] = (addressCounts[out.address] || 0) + 1;
      });
    });

    const reused = Object.entries(addressCounts)
      .filter(([_, count]) => count > 1)
      .map(([address]) => address);

    return { reused, count: reused.length };
  }

  async generateAnalyticsReport(): Promise<any> {
    const healthScore = await this.calculateHealthScore();
    const suggestions = await this.getOptimizationSuggestions();

    return {
      timestamp: new Date().toISOString(),
      healthScore: healthScore.score,
      rating: healthScore.rating,
      summary: healthScore.summary,
      metrics: healthScore.metrics,
      suggestions: suggestions.length,
      criticalIssues: suggestions.filter(s => s.priority === 'high').length,
      estimatedTotalSavings: suggestions
        .reduce((sum, s) => sum + (s.estimatedSavings || 0), 0)
        .toFixed(6),
    };
  }
}

const walletHealth = new WalletHealth();
export default walletHealth;
