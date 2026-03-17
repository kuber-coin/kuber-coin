// Tax Reporting Service
// Capital gains calculation and tax reports

export interface TaxTransaction {
  id: string;
  type: 'buy' | 'sell' | 'send' | 'receive' | 'mining' | 'staking';
  amount: number;
  fiatValue: number;
  fiatCurrency: string;
  fee: number;
  timestamp: number;
  txHash: string;
  description: string;
  category?: string;
}

export interface CostBasis {
  amount: number;
  costBasis: number;
  acquisitionDate: number;
  method: 'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID';
}

export interface CapitalGain {
  id: string;
  saleDate: number;
  acquisitionDate: number;
  amount: number;
  costBasis: number;
  salePrice: number;
  gain: number;
  holdingPeriod: number; // days
  isLongTerm: boolean; // > 1 year
}

export interface TaxReport {
  year: number;
  jurisdiction: string;
  method: 'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID';
  totalIncome: number;
  totalGains: number;
  totalLosses: number;
  netGains: number;
  shortTermGains: number;
  longTermGains: number;
  transactions: TaxTransaction[];
  capitalGains: CapitalGain[];
  generatedAt: number;
}

class TaxService {
  private transactions: Map<string, TaxTransaction> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_tax_transactions';
  private readonly LONG_TERM_DAYS = 365;
  private hasLoaded = false;

  constructor() {
    this.loadTransactions();
  }

  private loadTransactions() {
    if (!this.canUseStorage() || this.hasLoaded) {
      return;
    }
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const txArray = JSON.parse(stored);
      txArray.forEach((tx: TaxTransaction) => {
        this.transactions.set(tx.id, tx);
      });
    }
    this.hasLoaded = true;
  }

  private saveTransactions() {
    if (!this.canUseStorage()) {
      return;
    }
    const txArray = Array.from(this.transactions.values());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txArray));
  }

  private canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  // Transaction Management
  addTransaction(
    type: TaxTransaction['type'],
    amount: number,
    fiatValue: number,
    fiatCurrency: string,
    fee: number,
    txHash: string,
    description: string,
    category?: string
  ): TaxTransaction {
    const tx: TaxTransaction = {
      id: `tax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      amount,
      fiatValue,
      fiatCurrency,
      fee,
      timestamp: Date.now(),
      txHash,
      description,
      category,
    };

    this.transactions.set(tx.id, tx);
    this.saveTransactions();
    return tx;
  }

  getTransaction(id: string): TaxTransaction | undefined {
    return this.transactions.get(id);
  }

  getAllTransactions(): TaxTransaction[] {
    this.loadTransactions();
    return Array.from(this.transactions.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  getTransactionsByYear(year: number): TaxTransaction[] {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();

    return this.getAllTransactions().filter(
      (tx) => tx.timestamp >= start && tx.timestamp < end
    );
  }

  getTransactionsByType(type: TaxTransaction['type']): TaxTransaction[] {
    return this.getAllTransactions().filter((tx) => tx.type === type);
  }

  updateTransaction(id: string, updates: Partial<TaxTransaction>): boolean {
    const tx = this.transactions.get(id);
    if (!tx) return false;

    Object.assign(tx, updates);
    this.saveTransactions();
    return true;
  }

  deleteTransaction(id: string): boolean {
    const deleted = this.transactions.delete(id);
    if (deleted) {
      this.saveTransactions();
    }
    return deleted;
  }

  // Capital Gains Calculation
  calculateCapitalGains(
    year: number,
    method: 'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID' = 'FIFO'
  ): CapitalGain[] {
    const txs = this.getTransactionsByYear(year);
    const gains: CapitalGain[] = [];
    const inventory: CostBasis[] = [];

    // Build inventory from acquisitions (buys, receives, mining, staking)
    txs.forEach((tx) => {
      if (['buy', 'receive', 'mining', 'staking'].includes(tx.type)) {
        inventory.push({
          amount: tx.amount,
          costBasis: tx.fiatValue + tx.fee,
          acquisitionDate: tx.timestamp,
          method,
        });
      }
    });

    // Calculate gains from disposals (sells, sends)
    txs.forEach((tx) => {
      if (['sell', 'send'].includes(tx.type)) {
        const disposal = this.matchDisposal(tx, inventory, method);
        if (disposal) {
          gains.push(disposal);
        }
      }
    });

    return gains;
  }

  private matchDisposal(
    disposal: TaxTransaction,
    inventory: CostBasis[],
    method: 'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID'
  ): CapitalGain | null {
    if (inventory.length === 0) return null;

    let match: CostBasis;

    switch (method) {
      case 'FIFO':
        // First In First Out - oldest first
        match = inventory[0];
        break;
      case 'LIFO':
        // Last In First Out - newest first
        match = inventory[inventory.length - 1];
        break;
      case 'HIFO':
        // Highest In First Out - highest cost basis first
        match = inventory.reduce((max, curr) => (curr.costBasis > max.costBasis ? curr : max));
        break;
      case 'Specific ID':
        // Specific Identification - user chooses
        match = inventory[0]; // Default to FIFO if not specified
        break;
    }

    // Remove from inventory
    const index = inventory.indexOf(match);
    inventory.splice(index, 1);

    const holdingPeriod = Math.floor((disposal.timestamp - match.acquisitionDate) / (24 * 60 * 60 * 1000));
    const isLongTerm = holdingPeriod > this.LONG_TERM_DAYS;

    return {
      id: `gain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      saleDate: disposal.timestamp,
      acquisitionDate: match.acquisitionDate,
      amount: disposal.amount,
      costBasis: match.costBasis,
      salePrice: disposal.fiatValue - disposal.fee,
      gain: disposal.fiatValue - disposal.fee - match.costBasis,
      holdingPeriod,
      isLongTerm,
    };
  }

  // Tax Report Generation
  generateReport(
    year: number,
    jurisdiction: string = 'US',
    method: 'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID' = 'FIFO'
  ): TaxReport {
    const transactions = this.getTransactionsByYear(year);
    const capitalGains = this.calculateCapitalGains(year, method);

    // Calculate income (mining, staking, received)
    const income = transactions
      .filter((tx) => ['mining', 'staking', 'receive'].includes(tx.type))
      .reduce((sum, tx) => sum + tx.fiatValue, 0);

    // Calculate gains and losses
    const gains = capitalGains.filter((g) => g.gain > 0);
    const losses = capitalGains.filter((g) => g.gain < 0);
    const totalGains = gains.reduce((sum, g) => sum + g.gain, 0);
    const totalLosses = Math.abs(losses.reduce((sum, g) => sum + g.gain, 0));
    const netGains = totalGains - totalLosses;

    // Separate short-term and long-term
    const shortTermGains = capitalGains
      .filter((g) => !g.isLongTerm)
      .reduce((sum, g) => sum + g.gain, 0);
    const longTermGains = capitalGains
      .filter((g) => g.isLongTerm)
      .reduce((sum, g) => sum + g.gain, 0);

    return {
      year,
      jurisdiction,
      method,
      totalIncome: income,
      totalGains,
      totalLosses,
      netGains,
      shortTermGains,
      longTermGains,
      transactions,
      capitalGains,
      generatedAt: Date.now(),
    };
  }

  // Export Functions
  exportToCSV(report: TaxReport): string {
    const lines: string[] = [];

    // Header
    lines.push('Tax Report - ' + report.year);
    lines.push('Method: ' + report.method);
    lines.push('Jurisdiction: ' + report.jurisdiction);
    lines.push('');

    // Summary
    lines.push('Summary');
    lines.push('Total Income,' + report.totalIncome.toFixed(2));
    lines.push('Total Gains,' + report.totalGains.toFixed(2));
    lines.push('Total Losses,' + report.totalLosses.toFixed(2));
    lines.push('Net Gains,' + report.netGains.toFixed(2));
    lines.push('Short-Term Gains,' + report.shortTermGains.toFixed(2));
    lines.push('Long-Term Gains,' + report.longTermGains.toFixed(2));
    lines.push('');

    // Transactions
    lines.push('Transactions');
    lines.push('Date,Type,Amount,Fiat Value,Fee,Description');
    report.transactions.forEach((tx) => {
      const date = new Date(tx.timestamp).toISOString().split('T')[0];
      lines.push(
        `${date},${tx.type},${tx.amount},${tx.fiatValue},${tx.fee},"${tx.description}"`
      );
    });
    lines.push('');

    // Capital Gains
    lines.push('Capital Gains/Losses');
    lines.push('Sale Date,Acquisition Date,Amount,Cost Basis,Sale Price,Gain/Loss,Holding Period,Term');
    report.capitalGains.forEach((gain) => {
      const saleDate = new Date(gain.saleDate).toISOString().split('T')[0];
      const acqDate = new Date(gain.acquisitionDate).toISOString().split('T')[0];
      const term = gain.isLongTerm ? 'Long-Term' : 'Short-Term';
      lines.push(
        `${saleDate},${acqDate},${gain.amount},${gain.costBasis},${gain.salePrice},${gain.gain},${gain.holdingPeriod},${term}`
      );
    });

    return lines.join('\n');
  }

  exportToPDF(report: TaxReport): string {
    // In production, generate actual PDF
    // For now, return formatted text
    let pdf = `TAX REPORT - ${report.year}\n\n`;
    pdf += `Method: ${report.method}\n`;
    pdf += `Jurisdiction: ${report.jurisdiction}\n`;
    pdf += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n\n`;

    pdf += `SUMMARY\n`;
    pdf += `Total Income: $${report.totalIncome.toFixed(2)}\n`;
    pdf += `Total Gains: $${report.totalGains.toFixed(2)}\n`;
    pdf += `Total Losses: $${report.totalLosses.toFixed(2)}\n`;
    pdf += `Net Gains: $${report.netGains.toFixed(2)}\n`;
    pdf += `Short-Term Gains: $${report.shortTermGains.toFixed(2)}\n`;
    pdf += `Long-Term Gains: $${report.longTermGains.toFixed(2)}\n\n`;

    pdf += `TRANSACTIONS: ${report.transactions.length}\n`;
    pdf += `CAPITAL GAINS/LOSSES: ${report.capitalGains.length}\n`;

    return pdf;
  }

  // Form 8949 Export (US)
  exportForm8949(report: TaxReport): string {
    const lines: string[] = [];
    lines.push('Form 8949 - Sales and Other Dispositions of Capital Assets');
    lines.push(`Tax Year: ${report.year}`);
    lines.push('');
    lines.push('Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss');

    report.capitalGains.forEach((gain) => {
      const acqDate = new Date(gain.acquisitionDate).toLocaleDateString();
      const saleDate = new Date(gain.saleDate).toLocaleDateString();
      lines.push(
        `"${gain.amount} KC",${acqDate},${saleDate},${gain.salePrice.toFixed(2)},${gain.costBasis.toFixed(2)},${gain.gain.toFixed(2)}`
      );
    });

    return lines.join('\n');
  }

  clearAllData(): void {
    this.transactions.clear();
    this.hasLoaded = true;
    if (this.canUseStorage()) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }
}

const taxService = new TaxService();
export default taxService;
