import walletService from './wallet';

class Optimizer {
  private readonly DUST_THRESHOLD = 0.0001; // KC
  private readonly MIN_FEE = 0.00001; // KC

  async analyzeDustConsolidation(): Promise<{
    dustUtxoCount: number;
    totalDustAmount: number;
    estimatedFee: number;
    worthConsolidating: boolean;
  }> {
    const utxos = await this.getUTXOs();
    const dustUtxos = utxos.filter(utxo => utxo.amount < this.DUST_THRESHOLD);

    const totalDustAmount = dustUtxos.reduce((sum, utxo) => sum + utxo.amount, 0);
    const estimatedFee = await this.estimateConsolidationFee(dustUtxos.length);
    const worthConsolidating = totalDustAmount > estimatedFee * 2; // At least 2x fee recovery

    return {
      dustUtxoCount: dustUtxos.length,
      totalDustAmount,
      estimatedFee,
      worthConsolidating,
    };
  }

  async consolidateDust(): Promise<string> {
    const analysis = await this.analyzeDustConsolidation();

    if (!analysis.worthConsolidating) {
      throw new Error('Dust consolidation is not worth it at current fee rates');
    }

    if (analysis.dustUtxoCount === 0) {
      throw new Error('No dust UTXOs to consolidate');
    }

    const wallet = walletService.getActiveWallet();
    if (!wallet) {
      throw new Error('No active wallet');
    }

    const utxos = await this.getUTXOs();
    const dustUtxos = utxos.filter(utxo => utxo.amount < this.DUST_THRESHOLD);
    return walletService.consolidateUtxos(wallet.address, dustUtxos, wallet.address);
  }

  async optimizeUTXOs(): Promise<string> {
    const utxos = await this.getUTXOs();

    if (utxos.length <= 5) {
      throw new Error('Not enough UTXOs to optimize (already optimal)');
    }

    const totalAmount = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
    const estimatedFee = await this.estimateConsolidationFee(utxos.length);

    if (totalAmount <= estimatedFee) {
      throw new Error('Insufficient balance to cover consolidation fee');
    }

    const wallet = walletService.getActiveWallet();
    if (!wallet) {
      throw new Error('No active wallet');
    }

    return walletService.consolidateUtxos(wallet.address, utxos, wallet.address);
  }

  async resolveStuckTransactionCPFP(parentTxId: string): Promise<string> {
    // CPFP (Child Pays For Parent)
    // Create a child transaction with higher fee to incentivize mining of parent

    const parentTx = await this.getTransaction(parentTxId);
    if (!parentTx) {
      throw new Error('Parent transaction not found');
    }

    // Calculate required fee bump
    const currentFee = parentTx.fee || this.MIN_FEE;
    const targetFee = currentFee * 3; // 3x the original fee
    const childFee = targetFee + this.MIN_FEE;

    return walletService.bumpFee(parentTxId, 0, childFee);
  }

  async resolveStuckTransactionRBF(txId: string): Promise<string> {
    // RBF (Replace By Fee)
    // Replace existing transaction with higher fee version

    const tx = await this.getTransaction(txId);
    if (!tx) {
      throw new Error('Transaction not found');
    }

    if (!tx.rbfEnabled) {
      throw new Error('Transaction does not support RBF (Replace-By-Fee)');
    }

    // Calculate new fee (double the original)
    const currentFee = tx.fee || this.MIN_FEE;
    const newFee = currentFee * 2;

    return walletService.replaceTransaction(txId, newFee);
  }

  getFeeOptimizationTips(): string[] {
    return [
      '🎯 Use SegWit addresses for 30% fee savings',
      '📦 Batch multiple payments into one transaction',
      '⏰ Send transactions during off-peak hours (weekends)',
      '🧹 Consolidate UTXOs during low-fee periods',
      '⚡ Use Lightning Network for small payments',
      '🔄 Enable RBF to adjust fees after sending',
      '📊 Monitor mempool to choose optimal fee rates',
      '💡 Avoid creating dust outputs (< 0.0001 KC)',
    ];
  }

  async estimateOptimalFeeRate(): Promise<number> {
    try {
      return await walletService.estimateFee(6);
    } catch {
      return this.MIN_FEE;
    }
  }

  async analyzeTransactionSize(inputCount: number, outputCount: number): Promise<{
    estimatedSize: number; // bytes
    estimatedFee: number;
    feeRate: number;
  }> {
    // Rough estimate: input ~150 bytes, output ~50 bytes, overhead ~10 bytes
    const estimatedSize = inputCount * 150 + outputCount * 50 + 10;
    const feeRate = await this.estimateOptimalFeeRate();
    const estimatedFee = (estimatedSize / 1000) * feeRate; // Fee per KB

    return {
      estimatedSize,
      estimatedFee,
      feeRate,
    };
  }

  async suggestOptimalUTXOSelection(targetAmount: number): Promise<{
    utxos: any[];
    totalAmount: number;
    estimatedFee: number;
    change: number;
  }> {
    const utxos = await this.getUTXOs();
    
    // Sort UTXOs by size (largest first for efficiency)
    const sorted = [...utxos].sort((a, b) => b.amount - a.amount);

    // Select UTXOs to meet target amount
    const selected: any[] = [];
    let totalAmount = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      totalAmount += utxo.amount;

      if (totalAmount >= targetAmount) {
        break;
      }
    }

    if (totalAmount < targetAmount) {
      throw new Error('Insufficient balance');
    }

    const estimatedFee = await this.estimateConsolidationFee(selected.length);
    const change = totalAmount - targetAmount - estimatedFee;

    return {
      utxos: selected,
      totalAmount,
      estimatedFee,
      change,
    };
  }

  private async getUTXOs(): Promise<any[]> {
    const wallet = walletService.getActiveWallet();
    if (!wallet) return [];
    return walletService.getUtxos(wallet.address, 0);
  }

  private async getTransaction(txId: string): Promise<any> {
    const wallet = walletService.getActiveWallet();
    if (!wallet) return null;
    const transactions = await walletService.getTransactionHistory(wallet.address);
    return transactions.find((tx: any) => tx.txid === txId);
  }

  private async estimateConsolidationFee(utxoCount: number): Promise<number> {
    // Rough estimate: 150 bytes per input + 50 bytes output + 10 bytes overhead
    const txSize = utxoCount * 150 + 50 + 10;
    const feeRate = await this.estimateOptimalFeeRate();
    return (txSize / 1000) * feeRate; // Fee per KB
  }
}

const optimizer = new Optimizer();
export default optimizer;
