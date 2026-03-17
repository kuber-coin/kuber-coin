import { TaxTransaction } from './taxCalculator';
import priceService from './priceService';

export interface WashSale {
  saleDate: number;
  amount: number;
  disallowedLoss: number;
  repurchaseDate: number;
}

class CapitalGains {
  detectWashSales(transactions: TaxTransaction[]): WashSale[] {
    const washSales: WashSale[] = [];
    
    // Find all sells with losses
    const sellsWithLoss = transactions.filter(
      tx => tx.type === 'sell' && (tx.gainLoss || 0) < 0
    );
    
    for (const sale of sellsWithLoss) {
      // Look for buys within 30 days before or after
      const washWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      const repurchases = transactions.filter(
        tx => 
          tx.type === 'buy' &&
          Math.abs(tx.date - sale.date) <= washWindow &&
          tx.date !== sale.date
      );
      
      if (repurchases.length > 0) {
        washSales.push({
          saleDate: sale.date,
          amount: sale.amount,
          disallowedLoss: Math.abs(sale.gainLoss || 0),
          repurchaseDate: repurchases[0].date,
        });
      }
    }
    
    return washSales;
  }

  calculateCostBasis(purchases: TaxTransaction[], method: 'FIFO' | 'LIFO' | 'HIFO' | 'SpecificID'): number {
    if (purchases.length === 0) return 0;
    
    const totalAmount = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalCost = purchases.reduce((sum, p) => sum + p.amount * p.price, 0);
    
    return totalCost / totalAmount;
  }

  adjustForWashSales(gains: number, washSales: WashSale[]): number {
    const totalDisallowed = washSales.reduce((sum, ws) => sum + ws.disallowedLoss, 0);
    return gains + totalDisallowed;
  }

  calculateHoldingPeriod(buyDate: number, sellDate: number): number {
    return Math.floor((sellDate - buyDate) / (1000 * 60 * 60 * 24));
  }

  isLongTerm(holdingPeriod: number): boolean {
    return holdingPeriod > 365;
  }

  optimizeTaxLoss(transactions: TaxTransaction[]): {
    sellRecommendations: { tx: TaxTransaction; expectedLoss: number }[];
    totalLossHarvest: number;
  } {
    // Find positions with unrealized losses
    const currentPrice = priceService.getCurrentPrice()?.price || 0;
    if (currentPrice <= 0) {
      return { sellRecommendations: [], totalLossHarvest: 0 };
    }
    
    const recommendations = transactions
      .filter(tx => tx.type === 'buy' && tx.price > currentPrice)
      .map(tx => ({
        tx,
        expectedLoss: (currentPrice - tx.price) * tx.amount,
      }))
      .sort((a, b) => a.expectedLoss - b.expectedLoss);
    
    const totalLossHarvest = recommendations.reduce((sum, r) => sum + Math.abs(r.expectedLoss), 0);
    
    return {
      sellRecommendations: recommendations,
      totalLossHarvest,
    };
  }
}

const capitalGains = new CapitalGains();
export default capitalGains;
