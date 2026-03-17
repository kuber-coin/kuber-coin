export type TaxMethod = 'FIFO' | 'LIFO' | 'HIFO' | 'SpecificID';

export interface TaxTransaction {
  id: string;
  date: number;
  type: 'buy' | 'sell' | 'mining' | 'staking' | 'airdrop' | 'interest';
  amount: number;
  price: number;
  costBasis?: number;
  proceeds?: number;
  gainLoss?: number;
  holdingPeriod?: number;
}

export interface TaxYear {
  year: number;
  method: TaxMethod;
  jurisdiction: string;
  transactions: TaxTransaction[];
  totalCapitalGains: number;
  shortTermGains: number;
  longTermGains: number;
  shortTermRate: number;
  longTermRate: number;
  miningIncome: number;
  stakingIncome: number;
  interestIncome: number;
  airdropIncome: number;
  otherIncome: number;
  taxableIncome: number;
  estimatedTax: number;
}

class TaxCalculator {
  async calculateTaxYear(year: number, method: TaxMethod, jurisdiction: string): Promise<TaxYear> {
    const transactions = await this.loadTransactions(year);
    
    // Calculate capital gains based on method
    const processedTxs = this.calculateCapitalGains(transactions, method);
    
    // Separate short-term and long-term gains
    const shortTermGains = processedTxs
      .filter(tx => tx.holdingPeriod !== undefined && tx.holdingPeriod <= 365)
      .reduce((sum, tx) => sum + (tx.gainLoss || 0), 0);
    
    const longTermGains = processedTxs
      .filter(tx => tx.holdingPeriod !== undefined && tx.holdingPeriod > 365)
      .reduce((sum, tx) => sum + (tx.gainLoss || 0), 0);
    
    // Calculate other income
    const miningIncome = processedTxs
      .filter(tx => tx.type === 'mining')
      .reduce((sum, tx) => sum + tx.amount * tx.price, 0);
    
    const stakingIncome = processedTxs
      .filter(tx => tx.type === 'staking')
      .reduce((sum, tx) => sum + tx.amount * tx.price, 0);
    
    const interestIncome = processedTxs
      .filter(tx => tx.type === 'interest')
      .reduce((sum, tx) => sum + tx.amount * tx.price, 0);
    
    const airdropIncome = processedTxs
      .filter(tx => tx.type === 'airdrop')
      .reduce((sum, tx) => sum + tx.amount * tx.price, 0);
    
    const otherIncome = miningIncome + stakingIncome + interestIncome + airdropIncome;
    
    // Get tax rates based on jurisdiction
    const rates = this.getTaxRates(jurisdiction);
    
    // Calculate taxable income and estimated tax
    const totalCapitalGains = shortTermGains + longTermGains;
    const taxableIncome = totalCapitalGains + otherIncome;
    
    const estimatedTax = 
      (shortTermGains > 0 ? shortTermGains * rates.shortTerm / 100 : 0) +
      (longTermGains > 0 ? longTermGains * rates.longTerm / 100 : 0) +
      (otherIncome > 0 ? otherIncome * rates.ordinary / 100 : 0);
    
    return {
      year,
      method,
      jurisdiction,
      transactions: processedTxs,
      totalCapitalGains,
      shortTermGains,
      longTermGains,
      shortTermRate: rates.shortTerm,
      longTermRate: rates.longTerm,
      miningIncome,
      stakingIncome,
      interestIncome,
      airdropIncome,
      otherIncome,
      taxableIncome,
      estimatedTax,
    };
  }

  private calculateCapitalGains(transactions: TaxTransaction[], method: TaxMethod): TaxTransaction[] {
    const processed: TaxTransaction[] = [];
    const inventory: TaxTransaction[] = [];
    
    for (const tx of transactions) {
      if (tx.type === 'buy' || tx.type === 'mining' || tx.type === 'staking' || tx.type === 'airdrop') {
        // Add to inventory
        inventory.push({ ...tx });
        processed.push(tx);
      } else if (tx.type === 'sell') {
        // Match with inventory based on method
        const matched = this.matchInventory(inventory, tx.amount, method);
        
        // Calculate gain/loss
        const costBasis = matched.reduce((sum, m) => sum + m.amount * m.price, 0);
        const proceeds = tx.amount * tx.price;
        const gainLoss = proceeds - costBasis;
        
        // Calculate holding period (weighted average)
        const avgHoldingPeriod = matched.reduce((sum, m) => {
          const days = Math.floor((tx.date - m.date) / (1000 * 60 * 60 * 24));
          return sum + days * m.amount;
        }, 0) / tx.amount;
        
        processed.push({
          ...tx,
          costBasis,
          proceeds,
          gainLoss,
          holdingPeriod: avgHoldingPeriod,
        });
      } else {
        processed.push(tx);
      }
    }
    
    return processed;
  }

  private matchInventory(inventory: TaxTransaction[], amount: number, method: TaxMethod): TaxTransaction[] {
    const matched: TaxTransaction[] = [];
    let remaining = amount;
    
    // Sort inventory based on method
    let sorted = [...inventory];
    
    switch (method) {
      case 'FIFO':
        sorted.sort((a, b) => a.date - b.date);
        break;
      case 'LIFO':
        sorted.sort((a, b) => b.date - a.date);
        break;
      case 'HIFO':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'SpecificID':
        // In production, allow user to select specific lots
        sorted.sort((a, b) => a.date - b.date);
        break;
    }
    
    // Match inventory
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      const available = sorted[i].amount;
      const toTake = Math.min(available, remaining);
      
      matched.push({
        ...sorted[i],
        amount: toTake,
      });
      
      sorted[i].amount -= toTake;
      remaining -= toTake;
      
      if (sorted[i].amount === 0) {
        const idx = inventory.indexOf(sorted[i]);
        if (idx > -1) {
          inventory.splice(idx, 1);
        }
      }
    }
    
    return matched;
  }

  private getTaxRates(jurisdiction: string): { shortTerm: number; longTerm: number; ordinary: number } {
    const rates: Record<string, { shortTerm: number; longTerm: number; ordinary: number }> = {
      US: { shortTerm: 24, longTerm: 15, ordinary: 24 },
      UK: { shortTerm: 20, longTerm: 20, ordinary: 20 },
      EU: { shortTerm: 25, longTerm: 15, ordinary: 25 },
      CA: { shortTerm: 26.5, longTerm: 13.25, ordinary: 26.5 },
      AU: { shortTerm: 32.5, longTerm: 16.25, ordinary: 32.5 },
    };
    
    return rates[jurisdiction] || rates.US;
  }

  private async loadTransactions(_year: number): Promise<TaxTransaction[]> {
    return [];
  }
}

const taxCalculator = new TaxCalculator();
export default taxCalculator;
