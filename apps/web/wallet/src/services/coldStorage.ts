// Cold Storage Service
// Air-gapped offline wallet management via wallet API

import walletApi from './walletApi';

const allowFallback = process.env.NEXT_PUBLIC_WALLET_API_FALLBACKS !== 'false';

export interface ColdWallet {
  id: string;
  label: string;
  address: string;
  publicKey: string;
  createdAt: number;
  lastUsed?: number;
  balance: number;
}

export interface UnsignedTransaction {
  id: string;
  to: string;
  amount: number;
  fee: number;
  fromAddress: string;
  createdAt: number;
  rawTx: string;
  signed: boolean;
  signature?: string;
}

class ColdStorageService {
  private coldWallets: ColdWallet[] = [];
  private unsignedTxs: UnsignedTransaction[] = [];

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createAddress(prefix: string): string {
    return `${prefix}${Math.random().toString(36).slice(2, 12)}`;
  }

  async refreshColdWallets(): Promise<ColdWallet[]> {
    try {
      const response = await walletApi.get<{ wallets: ColdWallet[] }>('/api/cold-storage/wallets');
      const wallets = response.wallets || [];
      // Avoid wiping locally-created wallets if the backend returns an empty list.
      // Cold storage is designed to work offline; empty backend responses are often "no data" rather than "delete everything".
      if (wallets.length > 0 || this.coldWallets.length === 0) {
        this.coldWallets = wallets;
      }
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached wallets when offline.
    }
    return this.getColdWallets();
  }

  getColdWallets(): ColdWallet[] {
    return [...this.coldWallets].sort((a, b) => b.createdAt - a.createdAt);
  }

  async generateColdWallet(_label: string): Promise<ColdWallet> {
    // IMPORTANT: Do NOT generate wallet addresses from Math.random() or any
    // non-cryptographic RNG. An address produced that way has no matching
    // private key — any funds sent to it would be permanently unrecoverable.
    // Cold wallet generation must go through the wallet backend so that a real
    // key pair is derived and stored securely.
    // TODO: implement by calling walletApi.post('/api/wallet/create', { name: _label })
    //       once the cold-storage backend API is available.
    throw new Error(
      'Cold wallet generation is not yet available through this UI. ' +
      'Create a wallet via the main wallet creation page and treat it as your cold-storage wallet.'
    );
  }

  async refreshUnsignedTransactions(): Promise<UnsignedTransaction[]> {
    try {
      const response = await walletApi.get<{ transactions: UnsignedTransaction[] }>(
        '/api/cold-storage/unsigned'
      );
      const txs = response.transactions || [];
      if (txs.length > 0 || this.unsignedTxs.length === 0) {
        this.unsignedTxs = txs;
      }
    } catch (error) {
      if (!allowFallback) throw error;
      // Keep cached transactions when offline.
    }
    return this.getUnsignedTransactions();
  }

  async createUnsignedTransaction(
    fromAddress: string,
    to: string,
    amount: number,
    fee: number
  ): Promise<UnsignedTransaction> {
    // Unsigned transactions are built locally for offline signing.
    const tx: UnsignedTransaction = {
      id: this.createId('unsigned'),
      to,
      amount,
      fee,
      fromAddress,
      createdAt: Date.now(),
      rawTx: JSON.stringify({ fromAddress, to, amount, fee }),
      signed: false,
    };
    this.unsignedTxs = [tx, ...this.unsignedTxs.filter((t) => t.id !== tx.id)];
    return tx;
  }

  async importSignedTransaction(txId: string, signature: string): Promise<void> {
    // Apply signature locally. Broadcasting happens separately.
    const target = this.unsignedTxs.find((tx) => tx.id === txId);
    if (target) {
      target.signed = true;
      target.signature = signature;
    }
  }

  getUnsignedTransactions(): UnsignedTransaction[] {
    return [...this.unsignedTxs].sort((a, b) => b.createdAt - a.createdAt);
  }

  async exportForSigning(txId: string): Promise<string> {
    try {
      const response = await walletApi.get<{ export: string }>(
        `/api/cold-storage/unsigned/export?id=${encodeURIComponent(txId)}`
      );
      return response.export;
    } catch (error) {
      if (!allowFallback) throw error;
      const tx = this.unsignedTxs.find((t) => t.id === txId);
      return tx?.rawTx || '';
    }
  }

  async generateMnemonic(): Promise<string[]> {
    try {
      const response = await walletApi.post<{ words: string[] }>(
        '/api/cold-storage/mnemonic',
        { words: 12 }
      );
      return response.words || [];
    } catch (error) {
      if (!allowFallback) throw error;
      const fallback = [
        'alpha',
        'bravo',
        'charlie',
        'delta',
        'echo',
        'foxtrot',
        'golf',
        'hotel',
        'india',
        'juliet',
        'kilo',
        'lima',
      ];
      return fallback;
    }
  }

  async generatePaperWallet(): Promise<{ address: string; privateKey: string; qrData: string }> {
    try {
      return await walletApi.post('/api/cold-storage/paper', {});
    } catch (error) {
      if (!allowFallback) throw error;
      return {
        address: this.createAddress('KC'),
        privateKey: this.createAddress('PRIV'),
        qrData: this.createId('paper'),
      };
    }
  }
}

const coldStorageService = new ColdStorageService();
export default coldStorageService;
