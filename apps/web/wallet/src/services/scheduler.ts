// Transaction Scheduler Service
// Schedule future and recurring transactions

export interface ScheduledTransaction {
  id: string;
  to: string;
  amount: number;
  fee: number;
  label?: string;
  scheduledDate: number;
  recurring: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly';
  nextExecution?: number;
  executed: boolean;
  executedAt?: number;
  txid?: string;
  createdAt: number;
}

class SchedulerService {
  private scheduled: Map<string, ScheduledTransaction> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_scheduled';

  constructor() {
    this.loadScheduled();
  }

  private loadScheduled() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const txs = JSON.parse(stored);
      txs.forEach((tx: ScheduledTransaction) => this.scheduled.set(tx.id, tx));
    }
  }

  private saveScheduled() {
    const txs = Array.from(this.scheduled.values());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(txs));
  }

  scheduleTransaction(
    to: string,
    amount: number,
    fee: number,
    scheduledDate: number,
    label?: string,
    recurring?: { frequency: 'daily' | 'weekly' | 'monthly' }
  ): ScheduledTransaction {
    const tx: ScheduledTransaction = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      to,
      amount,
      fee,
      label,
      scheduledDate,
      recurring: !!recurring,
      frequency: recurring?.frequency,
      nextExecution: recurring ? this.calculateNextExecution(scheduledDate, recurring.frequency) : undefined,
      executed: false,
      createdAt: Date.now(),
    };

    this.scheduled.set(tx.id, tx);
    this.saveScheduled();
    return tx;
  }

  private calculateNextExecution(current: number, frequency: 'daily' | 'weekly' | 'monthly'): number {
    const date = new Date(current);
    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date.getTime();
  }

  getScheduledTransactions(): ScheduledTransaction[] {
    return Array.from(this.scheduled.values()).sort((a, b) => a.scheduledDate - b.scheduledDate);
  }

  executeTransaction(id: string): void {
    const tx = this.scheduled.get(id);
    if (!tx) throw new Error('Scheduled transaction not found');

    tx.executed = true;
    tx.executedAt = Date.now();
    tx.txid = `tx${Math.random().toString(36).substr(2, 16)}`;

    if (tx.recurring && tx.frequency && tx.nextExecution) {
      // Create next recurring transaction
      this.scheduleTransaction(tx.to, tx.amount, tx.fee, tx.nextExecution, tx.label, {
        frequency: tx.frequency,
      });
    }

    this.saveScheduled();
  }

  cancelScheduled(id: string): void {
    this.scheduled.delete(id);
    this.saveScheduled();
  }
}

const schedulerService = new SchedulerService();
export default schedulerService;
