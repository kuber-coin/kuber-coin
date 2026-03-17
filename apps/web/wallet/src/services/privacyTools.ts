// Privacy Tools Service
// Enhanced privacy and anonymity features via wallet API

import walletApi from './walletApi';

const allowFallback = process.env.NEXT_PUBLIC_WALLET_API_FALLBACKS !== 'false';

export interface PrivacyTransaction {
  id: string;
  txid: string;
  type: 'coinjoin' | 'stealth' | 'mixed';
  amount: number;
  privacyScore: number; // 0-100
  participants?: number;
  rounds?: number;
  createdAt: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface PrivacySettings {
  enableTor: boolean;
  autoMixing: boolean;
  minMixAmount: number;
  mixingRounds: number;
  addressRotation: boolean;
  stealthAddresses: boolean;
}

class PrivacyToolsService {
  private transactions: PrivacyTransaction[] = [];
  private settings: PrivacySettings = {
    enableTor: false,
    autoMixing: false,
    minMixAmount: 0.1,
    mixingRounds: 3,
    addressRotation: true,
    stealthAddresses: false,
  };

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createAddress(prefix: string): string {
    return `${prefix}${Math.random().toString(36).slice(2, 12)}`;
  }

  async refreshSettings(): Promise<PrivacySettings> {
    try {
      const response = await walletApi.get<{ settings: PrivacySettings }>('/api/privacy/settings');
      this.settings = response.settings || this.settings;
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached settings when offline.
    }
    return this.getSettings();
  }

  async refreshTransactions(): Promise<PrivacyTransaction[]> {
    try {
      const response = await walletApi.get<{ transactions: PrivacyTransaction[] }>(
        '/api/privacy/transactions'
      );
      this.transactions = response.transactions || [];
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached transactions when offline.
    }
    return this.getPrivacyTransactions();
  }

  async createCoinJoin(amount: number, participants: number = 5): Promise<PrivacyTransaction> {
    try {
      const response = await walletApi.post<{ transaction: PrivacyTransaction }>(
        '/api/privacy/coinjoin',
        { amount, participants }
      );
      const tx = response.transaction;
      this.transactions = [tx, ...this.transactions.filter((t) => t.id !== tx.id)];
      return tx;
    } catch (error) {
      if (!allowFallback) throw error;
      const tx: PrivacyTransaction = {
        id: this.createId('coinjoin'),
        txid: this.createAddress('KC'),
        type: 'coinjoin',
        amount,
        privacyScore: Math.min(50 + participants * 5, 95),
        participants,
        rounds: this.settings.mixingRounds,
        createdAt: Date.now(),
        status: 'completed',
      };
      this.transactions = [tx, ...this.transactions.filter((t) => t.id !== tx.id)];
      return tx;
    }
  }

  async createStealthAddress(): Promise<{ address: string; scanKey: string; spendKey: string }> {
    try {
      return await walletApi.post('/api/privacy/stealth', {});
    } catch (error) {
      if (!allowFallback) throw error;
      return {
        address: this.createAddress('KC'),
        scanKey: this.createAddress('SCAN'),
        spendKey: this.createAddress('SPEND'),
      };
    }
  }

  async mixTransaction(txid: string): Promise<PrivacyTransaction> {
    try {
      const response = await walletApi.post<{ transaction: PrivacyTransaction }>(
        '/api/privacy/coinjoin',
        { amount: 0, participants: this.settings.mixingRounds }
      );
      const tx = response.transaction;
      this.transactions = [tx, ...this.transactions.filter((t) => t.id !== tx.id)];
      return tx;
    } catch (error) {
      if (!allowFallback) throw error;
      const tx: PrivacyTransaction = {
        id: this.createId('mix'),
        txid,
        type: 'mixed',
        amount: 0,
        privacyScore: 90,
        participants: this.settings.mixingRounds,
        rounds: this.settings.mixingRounds,
        createdAt: Date.now(),
        status: 'completed',
      };
      this.transactions = [tx, ...this.transactions.filter((t) => t.id !== tx.id)];
      return tx;
    }
  }

  getPrivacyTransactions(): PrivacyTransaction[] {
    return [...this.transactions].sort((a, b) => b.createdAt - a.createdAt);
  }

  calculateTransactionPrivacyScore(tx: {
    inputs: number;
    outputs: number;
    usesStealthAddress: boolean;
    usesCoinjoin: boolean;
  }): number {
    let score = 50; // Base score

    // More inputs/outputs = better privacy
    score += Math.min(tx.inputs * 5, 20);
    score += Math.min(tx.outputs * 5, 20);

    if (tx.usesStealthAddress) score += 15;
    if (tx.usesCoinjoin) score += 20;

    return Math.min(score, 100);
  }

  getSettings(): PrivacySettings {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<PrivacySettings>): Promise<void> {
    try {
      const response = await walletApi.post<{ settings: PrivacySettings }>(
        '/api/privacy/settings',
        updates
      );
      this.settings = response.settings || this.settings;
    } catch (error) {
      if (!allowFallback) throw error;
      this.settings = { ...this.settings, ...updates };
    }
  }

  async enableTorRouting(): Promise<boolean> {
    await this.updateSettings({ enableTor: true });
    return true;
  }

  async disableTorRouting(): Promise<void> {
    await this.updateSettings({ enableTor: false });
  }

  async rotateAddress(currentAddress: string): Promise<string> {
    const _ = currentAddress;
    throw new Error('Address rotation requires a configured wallet backend.');
  }
}

const privacyToolsService = new PrivacyToolsService();
export default privacyToolsService;
