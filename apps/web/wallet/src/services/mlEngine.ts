// mlEngine.ts - Machine Learning for portfolio optimization and anomaly detection

export interface PortfolioOptimization {
  currentAllocation: { [asset: string]: number };
  recommendedAllocation: { [asset: string]: number };
  expectedReturn: number;
  risk: number;
  sharpeRatio: number;
}

export interface Anomaly {
  id: string;
  type: 'spending_spike' | 'unusual_recipient' | 'suspicious_pattern' | 'time_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: number;
  data: any;
}

export interface PricePrediction {
  current: number;
  predictions: Array<{
    time: string;
    price: number;
    confidence: number;
  }>;
  trend: 'bullish' | 'bearish' | 'neutral';
}

class MLEngine {
  async optimizePortfolio(currentHoldings: { [asset: string]: number }): Promise<PortfolioOptimization> {
    const total = Object.values(currentHoldings).reduce((a, b) => a + b, 0);
    const currentAllocation: { [asset: string]: number } = {};

    if (total <= 0) {
      return {
        currentAllocation,
        recommendedAllocation: {},
        expectedReturn: 0,
        risk: 0,
        sharpeRatio: 0,
      };
    }
    
    for (const [asset, amount] of Object.entries(currentHoldings)) {
      currentAllocation[asset] = (amount / total) * 100;
    }

    const recommendedAllocation: { [asset: string]: number } = { ...currentAllocation };

    return {
      currentAllocation,
      recommendedAllocation,
      expectedReturn: 0,
      risk: 0,
      sharpeRatio: 0
    };
  }

  async detectAnomalies(transactions: Array<{ amount: number; to: string; timestamp: number }>): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Calculate statistics
    const amounts = transactions.map(t => t.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Detect spending spikes (z-score > 2)
    transactions.forEach((tx, i) => {
      const zScore = (tx.amount - mean) / stdDev;
      
      if (zScore > 2) {
        anomalies.push({
          id: `anomaly_${i}`,
          type: 'spending_spike',
          severity: zScore > 3 ? 'high' : 'medium',
          description: `Unusually large transaction: ${tx.amount} KC (${zScore.toFixed(1)}σ above average)`,
          timestamp: tx.timestamp,
          data: { amount: tx.amount, zScore }
        });
      }
    });

    const lateNightTxs = transactions.filter(tx => {
      const hour = new Date(tx.timestamp).getHours();
      return hour >= 2 && hour <= 5;
    });

    if (lateNightTxs.length > 0) {
      anomalies.push({
        id: 'anomaly_time',
        type: 'time_anomaly',
        severity: 'low',
        description: `${lateNightTxs.length} transactions during unusual hours (2-5 AM)`,
        timestamp: Date.now(),
        data: { count: lateNightTxs.length }
      });
    }

    return anomalies;
  }

  async predictPrice(historicalPrices: number[]): Promise<PricePrediction> {
    const current = historicalPrices[historicalPrices.length - 1];

    const shortMA = this.calculateMA(historicalPrices.slice(-5), 5);
    const longMA = this.calculateMA(historicalPrices.slice(-20), 20);
    
    const trend = shortMA > longMA ? 'bullish' : shortMA < longMA ? 'bearish' : 'neutral';

    return {
      current,
      predictions: [],
      trend
    };
  }

  async analyzeSentiment(sources: string[]): Promise<{ score: number; sentiment: 'positive' | 'negative' | 'neutral' }> {
    return {
      score: 0,
      sentiment: 'neutral'
    };
  }

  private calculateMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  async categorizeTransaction(description: string, amount: number): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 200));

    const lower = description.toLowerCase();

    if (lower.includes('salary') || lower.includes('paycheck')) return 'Income';
    if (lower.includes('grocery') || lower.includes('food')) return 'Food & Dining';
    if (lower.includes('rent') || lower.includes('mortgage')) return 'Housing';
    if (lower.includes('gas') || lower.includes('uber')) return 'Transportation';
    if (lower.includes('netflix') || lower.includes('spotify')) return 'Entertainment';
    if (lower.includes('amazon') || lower.includes('shop')) return 'Shopping';
    if (lower.includes('invest') || lower.includes('stock')) return 'Investment';
    if (amount > 1000) return 'Large Transfer';

    return 'Other';
  }
}

const mlEngine = new MLEngine();
export default mlEngine;