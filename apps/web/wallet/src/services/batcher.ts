// Transaction Batcher Service
// Batch multiple payments into single transactions

export interface BatchRecipient {
  id: string;
  address: string;
  amount: number;
  label?: string;
}

export interface Batch {
  id: string;
  name: string;
  recipients: BatchRecipient[];
  totalAmount: number;
  estimatedFee: number;
  createdAt: number;
  executed: boolean;
  executedAt?: number;
  txid?: string;
}

class BatcherService {
  private batches: Map<string, Batch> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_batches';

  constructor() {
    this.loadBatches();
  }

  private loadBatches() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const batches = JSON.parse(stored);
      batches.forEach((b: Batch) => this.batches.set(b.id, b));
    }
  }

  private saveBatches() {
    const batches = Array.from(this.batches.values());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(batches));
  }

  createBatch(name: string, recipients: Omit<BatchRecipient, 'id'>[]): Batch {
    const batch: Batch = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      recipients: recipients.map((r, i) => ({
        ...r,
        id: `recipient_${i}_${Date.now()}`,
      })),
      totalAmount: recipients.reduce((sum, r) => sum + r.amount, 0),
      estimatedFee: recipients.length * 0.0001, // Simple fee estimation
      createdAt: Date.now(),
      executed: false,
    };

    this.batches.set(batch.id, batch);
    this.saveBatches();
    return batch;
  }

  getBatches(): Batch[] {
    return Array.from(this.batches.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getBatch(id: string): Batch | undefined {
    return this.batches.get(id);
  }

  executeBatch(id: string): void {
    const batch = this.batches.get(id);
    if (!batch) throw new Error('Batch not found');
    if (batch.executed) throw new Error('Batch already executed');

    // Do NOT assign a fabricated txid or mark the batch as executed here.
    // A fake txid silently misleads callers into thinking the transactions
    // were broadcast when no network call has been made.
    // TODO: implement by calling the node's sendrawtransaction RPC for each
    //       output in this batch, then storing the real txid(s).
    throw new Error(
      'Batch execution is not yet integrated with the blockchain node. ' +
      'Submit each transaction individually via the Send page.'
    );
  }

  deleteBatch(id: string): void {
    this.batches.delete(id);
    this.saveBatches();
  }

  importCSV(csv: string): Omit<BatchRecipient, 'id'>[] {
    const lines = csv.split('\n').filter((l) => l.trim());
    const recipients: Omit<BatchRecipient, 'id'>[] = [];

    lines.forEach((line, index) => {
      if (index === 0) return; // Skip header
      const [address, amount, label] = line.split(',').map((s) => s.trim());
      if (address && amount) {
        recipients.push({
          address,
          amount: parseFloat(amount),
          label: label || undefined,
        });
      }
    });

    return recipients;
  }
}

const batcherService = new BatcherService();
export default batcherService;
