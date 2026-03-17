// UTXO Manager Service
// Advanced coin control and UTXO management

export interface UTXO {
  id: string;
  txid: string;
  vout: number;
  address: string;
  amount: number;
  confirmations: number;
  script: string;
  locked: boolean;
  label?: string;
  note?: string;
  privacyScore: number; // 0-100
  ageInBlocks: number;
}

export interface UTXOFilter {
  minAmount?: number;
  maxAmount?: number;
  minConfirmations?: number;
  address?: string;
  locked?: boolean;
}

class UTXOManagerService {
  private utxos: Map<string, UTXO> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_utxos';

  constructor() {
    this.loadUTXOs();
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private loadUTXOs() {
    if (!this.isBrowser()) return;
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const utxos = JSON.parse(stored);
      utxos.forEach((u: UTXO) => {
        this.utxos.set(u.id, u);
      });
    }
  }

  private saveUTXOs() {
    if (!this.isBrowser()) return;
    const utxos = Array.from(this.utxos.values());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(utxos));
  }

  getAllUTXOs(filter?: UTXOFilter): UTXO[] {
    let utxos = Array.from(this.utxos.values());

    if (filter) {
      if (filter.minAmount !== undefined) {
        utxos = utxos.filter((u) => u.amount >= filter.minAmount!);
      }
      if (filter.maxAmount !== undefined) {
        utxos = utxos.filter((u) => u.amount <= filter.maxAmount!);
      }
      if (filter.minConfirmations !== undefined) {
        utxos = utxos.filter((u) => u.confirmations >= filter.minConfirmations!);
      }
      if (filter.address) {
        utxos = utxos.filter((u) => u.address.includes(filter.address!));
      }
      if (filter.locked !== undefined) {
        utxos = utxos.filter((u) => u.locked === filter.locked);
      }
    }

    return utxos;
  }

  getUTXO(id: string): UTXO | undefined {
    return this.utxos.get(id);
  }

  lockUTXO(id: string): void {
    const utxo = this.utxos.get(id);
    if (utxo) {
      utxo.locked = true;
      this.saveUTXOs();
    }
  }

  unlockUTXO(id: string): void {
    const utxo = this.utxos.get(id);
    if (utxo) {
      utxo.locked = false;
      this.saveUTXOs();
    }
  }

  setUTXOLabel(id: string, label: string): void {
    const utxo = this.utxos.get(id);
    if (utxo) {
      utxo.label = label;
      this.saveUTXOs();
    }
  }

  setUTXONote(id: string, note: string): void {
    const utxo = this.utxos.get(id);
    if (utxo) {
      utxo.note = note;
      this.saveUTXOs();
    }
  }

  // Select UTXOs for a transaction using various strategies
  selectUTXOs(
    targetAmount: number,
    strategy: 'largest-first' | 'smallest-first' | 'oldest-first' | 'best-privacy' = 'largest-first'
  ): UTXO[] {
    let available = this.getAllUTXOs({ locked: false });

    // Sort based on strategy
    switch (strategy) {
      case 'largest-first':
        available.sort((a, b) => b.amount - a.amount);
        break;
      case 'smallest-first':
        available.sort((a, b) => a.amount - b.amount);
        break;
      case 'oldest-first':
        available.sort((a, b) => b.ageInBlocks - a.ageInBlocks);
        break;
      case 'best-privacy':
        available.sort((a, b) => b.privacyScore - a.privacyScore);
        break;
    }

    const selected: UTXO[] = [];
    let total = 0;

    for (const utxo of available) {
      if (total >= targetAmount) break;
      selected.push(utxo);
      total += utxo.amount;
    }

    if (total < targetAmount) {
      throw new Error('Insufficient funds');
    }

    return selected;
  }

  // Consolidate dust UTXOs
  consolidateDust(dustThreshold: number = 0.01): {
    utxos: UTXO[];
    totalAmount: number;
  } {
    const dustUTXOs = this.getAllUTXOs({ maxAmount: dustThreshold, locked: false });
    const totalAmount = dustUTXOs.reduce((sum, u) => sum + u.amount, 0);

    return {
      utxos: dustUTXOs,
      totalAmount,
    };
  }

  getStatistics(): {
    totalUTXOs: number;
    totalValue: number;
    lockedUTXOs: number;
    lockedValue: number;
    averageValue: number;
    averageAge: number;
  } {
    const allUTXOs = this.getAllUTXOs();
    const locked = allUTXOs.filter((u) => u.locked);

    return {
      totalUTXOs: allUTXOs.length,
      totalValue: allUTXOs.reduce((sum, u) => sum + u.amount, 0),
      lockedUTXOs: locked.length,
      lockedValue: locked.reduce((sum, u) => sum + u.amount, 0),
      averageValue:
        allUTXOs.length > 0
          ? allUTXOs.reduce((sum, u) => sum + u.amount, 0) / allUTXOs.length
          : 0,
      averageAge:
        allUTXOs.length > 0
          ? allUTXOs.reduce((sum, u) => sum + u.ageInBlocks, 0) / allUTXOs.length
          : 0,
    };
  }

  clearAllData(): void {
    this.utxos.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

const utxoManager = new UTXOManagerService();
export default utxoManager;
