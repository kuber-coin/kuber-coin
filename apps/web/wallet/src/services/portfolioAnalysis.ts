import walletService from './wallet';
import priceService from './priceService';

export interface AssetAllocation {
  asset: string;
  amount: number;
  value: number;
  percentage: number;
}

export interface DiversificationScore {
  score: number; // 0-100
  rating: string; // Poor, Fair, Good, Excellent
  numAssets: number;
  concentrationRisk: number; // 0-1
  recommendations: string[];
}

export interface RebalanceSuggestion {
  asset: string;
  action: 'buy' | 'sell';
  amount: number;
  currentPercentage: number;
  targetPercentage: number;
  valueUSD: number;
}

export interface RiskMetrics {
  volatility: number; // 30-day volatility
  sharpeRatio: number;
  maxDrawdown: number;
  beta: number;
  valueAtRisk: number; // VaR 95%
  riskLevel: 'Low' | 'Medium' | 'High' | 'Very High';
  riskDescription: string;
  recommendations: string[];
}

class PortfolioAnalysis {
  getAssetAllocation(): AssetAllocation[] {
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) return [];

      const balance = wallet.balance;
      const priceData = priceService.getCurrentPrice();
      const price = priceData?.price || 0;

      // For now, we only have KC
      // In a real implementation, this would track multiple cryptocurrencies
      const totalValueUSD = balance * price;

      const allocations: AssetAllocation[] = [
        {
          asset: 'KC',
          amount: balance,
          value: totalValueUSD,
          percentage: 100,
        },
      ];

      // In production, add other assets from user's holdings
      // This would query other wallet addresses for BTC, ETH, etc.

      return allocations;
    } catch {
      return [];
    }
  }

  getDiversificationScore(): DiversificationScore {
    const allocation = this.getAssetAllocation();
    
    if (allocation.length === 0) {
      return {
        score: 0,
        rating: 'Poor',
        numAssets: 0,
        concentrationRisk: 1,
        recommendations: ['Add assets to your portfolio to begin diversification'],
      };
    }

    // Calculate Herfindahl-Hirschman Index (HHI) for concentration
    const hhi = allocation.reduce((sum, asset) => {
      const weight = asset.percentage / 100;
      return sum + (weight * weight);
    }, 0);

    // Convert HHI to concentration risk (0 = well diversified, 1 = highly concentrated)
    const concentrationRisk = Math.min(hhi, 1);

    // Calculate score (inverse of concentration risk)
    const baseScore = (1 - concentrationRisk) * 100;
    
    // Adjust score based on number of assets
    const assetCountBonus = Math.min(allocation.length * 5, 20);
    const finalScore = Math.min(baseScore + assetCountBonus, 100);

    // Determine rating
    let rating: string;
    if (finalScore >= 80) rating = 'Excellent';
    else if (finalScore >= 60) rating = 'Good';
    else if (finalScore >= 40) rating = 'Fair';
    else rating = 'Poor';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (allocation.length === 1) {
      recommendations.push('Consider diversifying into other cryptocurrencies (BTC, ETH)');
      recommendations.push('Single-asset portfolios carry the highest risk');
    }
    
    if (concentrationRisk > 0.5) {
      const topAsset = allocation.reduce((max, asset) => 
        asset.percentage > max.percentage ? asset : max
      );
      recommendations.push(`${topAsset.asset} represents ${topAsset.percentage.toFixed(1)}% of your portfolio - consider rebalancing`);
    }

    if (allocation.length < 5) {
      recommendations.push('Aim for at least 5 different assets for better diversification');
    }

    if (recommendations.length === 0) {
      recommendations.push('Your portfolio is well diversified');
    }

    return {
      score: Math.round(finalScore),
      rating,
      numAssets: allocation.length,
      concentrationRisk,
      recommendations,
    };
  }

  getRebalanceSuggestions(targetAllocation: Record<string, number>): RebalanceSuggestion[] {
    const currentAllocation = this.getAssetAllocation();
    const suggestions: RebalanceSuggestion[] = [];

    // Normalize target allocation to 100%
    const totalTarget = Object.values(targetAllocation).reduce((sum, val) => sum + val, 0);
    const normalizedTarget: Record<string, number> = {};
    Object.entries(targetAllocation).forEach(([asset, percentage]) => {
      normalizedTarget[asset] = (percentage / totalTarget) * 100;
    });

    // Calculate total portfolio value
    const totalValue = currentAllocation.reduce((sum, asset) => sum + asset.value, 0);

    // Generate suggestions for each asset
    Object.entries(normalizedTarget).forEach(([asset, targetPercentage]) => {
      const current = currentAllocation.find(a => a.asset === asset);
      const currentPercentage = current?.percentage || 0;
      const currentValue = current?.value || 0;

      const targetValue = (targetPercentage / 100) * totalValue;
      const difference = targetValue - currentValue;

      // Only suggest if difference is significant (> 5% of target or > $100)
      if (Math.abs(difference) > totalValue * 0.05 || Math.abs(difference) > 100) {
        const price = this.getAssetPrice(asset);
        suggestions.push({
          asset,
          action: difference > 0 ? 'buy' : 'sell',
          amount: Math.abs(difference / price),
          currentPercentage,
          targetPercentage,
          valueUSD: Math.abs(difference),
        });
      }
    });

    return suggestions;
  }

  executeRebalance(targetAllocation: Record<string, number>): any[] {
    const suggestions = this.getRebalanceSuggestions(targetAllocation);
    const transactions: any[] = [];

    // In a real implementation, this would create actual transactions
    suggestions.forEach(suggestion => {
      transactions.push({
        asset: suggestion.asset,
        action: suggestion.action,
        amount: suggestion.amount,
        status: 'pending',
        timestamp: new Date(),
      });
    });

    return transactions;
  }

  calculateRiskMetrics(): RiskMetrics {
    const priceHistory = priceService.getPriceHistory(30); // 30 days
    
    if (priceHistory.length < 2) {
      return {
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        beta: 1,
        valueAtRisk: 0,
        riskLevel: 'Low',
        riskDescription: 'Insufficient data to calculate risk metrics',
        recommendations: ['More price history needed for accurate risk assessment'],
      };
    }

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < priceHistory.length; i++) {
      const dailyReturn = (priceHistory[i].price - priceHistory[i - 1].price) / priceHistory[i - 1].price;
      returns.push(dailyReturn);
    }

    // Calculate volatility (standard deviation of returns)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Calculate Sharpe Ratio (assuming 2% risk-free rate annually)
    const riskFreeRate = 0.02 / 365; // Daily risk-free rate
    const excessReturn = avgReturn - riskFreeRate;
    const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;

    // Calculate Maximum Drawdown
    let peak = priceHistory[0].price;
    let maxDrawdown = 0;
    priceHistory.forEach(point => {
      if (point.price > peak) {
        peak = point.price;
      }
      const drawdown = (peak - point.price) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calculate Beta (assuming market beta of 1 for simplicity)
    // In production, this would compare against a market index
    const beta = 1 + (volatility - 0.02); // Simplified beta calculation

    // Calculate Value at Risk (VaR) at 95% confidence
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95Index = Math.floor(returns.length * 0.05);
    const var95 = sortedReturns[var95Index];
    const currentValue = this.getAssetAllocation().reduce((sum, asset) => sum + asset.value, 0);
    const valueAtRisk = Math.abs(var95 * currentValue);

    // Determine risk level
    let riskLevel: 'Low' | 'Medium' | 'High' | 'Very High';
    let riskDescription: string;
    const recommendations: string[] = [];

    if (volatility < 0.02) {
      riskLevel = 'Low';
      riskDescription = 'Your portfolio has low volatility and stable returns';
      recommendations.push('Consider adding higher-return assets for potential growth');
    } else if (volatility < 0.05) {
      riskLevel = 'Medium';
      riskDescription = 'Your portfolio has moderate volatility with balanced risk/reward';
      recommendations.push('Maintain current diversification strategy');
    } else if (volatility < 0.10) {
      riskLevel = 'High';
      riskDescription = 'Your portfolio experiences significant price swings';
      recommendations.push('Consider reducing exposure to volatile assets');
      recommendations.push('Implement stop-loss strategies');
    } else {
      riskLevel = 'Very High';
      riskDescription = 'Your portfolio is highly volatile with extreme price movements';
      recommendations.push('Urgently consider diversifying into stable assets');
      recommendations.push('Review your risk tolerance');
      recommendations.push('Implement strict risk management rules');
    }

    if (sharpeRatio < 0) {
      recommendations.push('Negative risk-adjusted returns - consider rebalancing');
    } else if (sharpeRatio > 2) {
      recommendations.push('Excellent risk-adjusted returns - maintain strategy');
    }

    if (maxDrawdown > 0.3) {
      recommendations.push(`Maximum drawdown of ${(maxDrawdown * 100).toFixed(1)}% is high - implement drawdown limits`);
    }

    return {
      volatility,
      sharpeRatio,
      maxDrawdown,
      beta,
      valueAtRisk,
      riskLevel,
      riskDescription,
      recommendations,
    };
  }

  getCorrelationMatrix(): { assets: string[]; matrix: number[][] } {
    const allocation = this.getAssetAllocation();
    const assets = allocation.map(a => a.asset);

    const matrix: number[][] = [];
    
    assets.forEach((asset1, i) => {
      matrix[i] = [];
      assets.forEach((asset2, j) => {
        if (i === j) {
          matrix[i][j] = 1; // Perfect correlation with self
        } else {
          matrix[i][j] = 0;
        }
      });
    });

    return { assets, matrix };
  }

  compareToMarket(marketTicker: string = 'BTC'): any {
    // Compare portfolio performance to market index
    // Implementation would fetch market data and compare returns
    
    return {
      portfolioReturn: 0,
      marketReturn: 0,
      alpha: 0,
      correlation: 0,
    };
  }

  private getAssetPrice(asset: string): number {
    // In production, fetch real-time prices for different assets
    if (asset === 'KC') {
      const priceData = priceService.getCurrentPrice();
      return priceData?.price || 0;
    }
    
    return 0;
  }

  calculateTargetAllocation(riskProfile: 'conservative' | 'moderate' | 'aggressive'): Record<string, number> {
    // Preset allocation strategies based on risk profile
    const strategies = {
      conservative: {
        KC: 40,
        BTC: 35,
        ETH: 20,
        OTHER: 5,
      },
      moderate: {
        KC: 50,
        BTC: 25,
        ETH: 20,
        OTHER: 5,
      },
      aggressive: {
        KC: 60,
        BTC: 20,
        ETH: 15,
        OTHER: 5,
      },
    };

    return strategies[riskProfile];
  }
}

const portfolioAnalysis = new PortfolioAnalysis();
export default portfolioAnalysis;
