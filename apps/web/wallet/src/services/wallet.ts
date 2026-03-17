/**
 * Wallet Service Layer for KuberCoin
 * Handles wallet operations, key management, and transaction creation
 */

import api from './api';

export interface WalletInfo {
  address: string;
  label: string;
  balance: number;
  unconfirmedBalance: number;
  privateKey?: string;
  publicKey?: string;
  createdAt: number;
  watchOnly?: boolean;
  xpub?: string;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptPubKey: string;
  amount: number;
  address: string;
}

export interface TransactionOutput {
  address: string;
  amount: number;
}

export interface WalletTransactionRecord {
  txid: string;
  address?: string;
  amount: number;
  confirmations: number;
  fee?: number;
  type: 'received' | 'sent' | 'other';
  timestamp?: number;
  inputs?: Array<{ address?: string; amount?: number }>;
  outputs?: Array<{ address?: string; amount?: number }>;
}

export interface UnsignedTransaction {
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;
  hex?: string;
}

export interface SignedTransaction {
  hex: string;
  txid: string;
  complete: boolean;
}

class WalletService {
  private wallets: Map<string, WalletInfo> = new Map();
  private activeWallet: string | null = null;
  private storageSnapshot: { wallets: string | null; active: string | null } = {
    wallets: null,
    active: null,
  };

  private hasStorage(): boolean {
    return typeof globalThis.localStorage !== 'undefined';
  }

  private readStorageSnapshot(): { wallets: string | null; active: string | null } {
    if (!this.hasStorage()) {
      return { wallets: null, active: null };
    }

    return {
      wallets: globalThis.localStorage.getItem('kubercoin_wallets'),
      active: globalThis.localStorage.getItem('kubercoin_active_wallet'),
    };
  }

  private refreshFromStorageIfNeeded(): void {
    if (!this.hasStorage()) return;

    const snapshot = this.readStorageSnapshot();
    if (
      snapshot.wallets !== this.storageSnapshot.wallets ||
      snapshot.active !== this.storageSnapshot.active
    ) {
      this.loadWalletsFromStorage();
    }
  }

  constructor() {
    this.loadWalletsFromStorage();

    // Keep the E2E hook out of production builds.
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      (window as any).__walletService__ = this;

      window.addEventListener('storage', (event) => {
        if (
          event.key === 'kubercoin_wallets' ||
          event.key === 'kubercoin_active_wallet' ||
          event.key === null
        ) {
          this.loadWalletsFromStorage();
        }
      });
    }
  }

  private sanitizeWalletForStorage(wallet: WalletInfo): WalletInfo {
    const { privateKey: _privateKey, ...safeWallet } = wallet;
    return safeWallet;
  }

  /**
   * Load wallets from localStorage
   */
  private loadWalletsFromStorage(): void {
    if (!this.hasStorage()) {
      this.storageSnapshot = { wallets: null, active: null };
      return;
    }

    this.storageSnapshot = this.readStorageSnapshot();

    this.wallets = new Map();
    this.activeWallet = null;

    try {
      const stored = localStorage.getItem('kubercoin_wallets');
      let shouldRewriteStorage = false;

      if (stored) {
        const wallets = JSON.parse(stored) as Record<string, WalletInfo>;
        const sanitizedEntries = Object.entries(wallets)
          .filter(([, wallet]) => wallet && typeof wallet === 'object')
          .map(([address, wallet]) => {
            const sanitizedWallet = this.sanitizeWalletForStorage(wallet);
            if ('privateKey' in wallet) {
              shouldRewriteStorage = true;
            }
            return [address, sanitizedWallet] as const;
          });

        this.wallets = new Map(sanitizedEntries);
      }

      const activeAddress = localStorage.getItem('kubercoin_active_wallet');
      if (activeAddress && this.wallets.has(activeAddress)) {
        this.activeWallet = activeAddress;
      } else if (activeAddress) {
        shouldRewriteStorage = true;
      }

      if (shouldRewriteStorage) {
        this.saveWalletsToStorage();
      }
    } catch (error) {
      console.error('Failed to load wallets from storage:', error);
      this.wallets = new Map();
      this.activeWallet = null;
    }
  }
  
  /**
   * Reload wallets from localStorage (primarily for E2E testing)
   */
  public reloadFromStorage(): void {
    this.loadWalletsFromStorage();
  }

  /**
   * Save wallets to localStorage
   */
  private saveWalletsToStorage(): void {
    if (!this.hasStorage()) return;

    try {
      const walletsObj = Object.fromEntries(
        Array.from(this.wallets.entries()).map(([address, wallet]) => [
          address,
          this.sanitizeWalletForStorage(wallet),
        ])
      );
      localStorage.setItem('kubercoin_wallets', JSON.stringify(walletsObj));

      if (this.activeWallet) {
        localStorage.setItem('kubercoin_active_wallet', this.activeWallet);
      } else {
        localStorage.removeItem('kubercoin_active_wallet');
      }

      this.storageSnapshot = this.readStorageSnapshot();
    } catch (error) {
      console.error('Failed to save wallets to storage:', error);
    }
  }

  /**
   * Generate a new wallet address
   */
  async generateWallet(label: string = 'My Wallet'): Promise<WalletInfo> {
    try {
      const address = await api.getNewAddress(label);
      
      const wallet: WalletInfo = {
        address,
        label,
        balance: 0,
        unconfirmedBalance: 0,
        createdAt: Date.now(),
      };

      this.wallets.set(address, wallet);
      
      if (!this.activeWallet) {
        this.activeWallet = address;
      }

      this.saveWalletsToStorage();
      return wallet;
    } catch (error) {
      throw new Error(`Failed to generate wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import a wallet using private key
   */
  async importWallet(privateKey: string, label: string = 'Imported Wallet', rescan: boolean = false): Promise<WalletInfo> {
    try {
      await api.importPrivKey(privateKey, label, rescan);
      
      // Get the address for this private key
      const addressInfo = await api.validateAddress(privateKey);
      const address = addressInfo.address || '';

      const wallet: WalletInfo = {
        address,
        label,
        balance: 0,
        unconfirmedBalance: 0,
        privateKey,
        createdAt: Date.now(),
      };

      this.wallets.set(address, wallet);
      
      if (!this.activeWallet) {
        this.activeWallet = address;
      }

      this.saveWalletsToStorage();
      await this.updateWalletBalance(address);
      
      return wallet;
    } catch (error) {
      throw new Error(`Failed to import wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register wallet metadata produced by a trusted backend flow.
   */
  registerWallet(wallet: WalletInfo, options?: { setActive?: boolean }): WalletInfo {
    const sanitizedWallet = this.sanitizeWalletForStorage(wallet);
    this.wallets.set(sanitizedWallet.address, sanitizedWallet);

    if (options?.setActive !== false || !this.activeWallet) {
      this.activeWallet = sanitizedWallet.address;
    }

    this.saveWalletsToStorage();
    return sanitizedWallet;
  }

  /**
   * Get all wallets
   */
  getWallets(): WalletInfo[] {
    this.refreshFromStorageIfNeeded();
    return Array.from(this.wallets.values());
  }

  /**
   * Get total balance across all wallets
   */
  getTotalBalance(): number {
    return Array.from(this.wallets.values()).reduce(
      (sum, wallet) => sum + wallet.balance + wallet.unconfirmedBalance,
      0
    );
  }

  /**
   * Get active wallet
   */
  getActiveWallet(): WalletInfo | null {
    this.refreshFromStorageIfNeeded();
    if (!this.activeWallet) return null;
    return this.wallets.get(this.activeWallet) || null;
  }

  /**
   * Set active wallet
   */
  setActiveWallet(address: string): boolean {
    this.refreshFromStorageIfNeeded();
    if (!this.wallets.has(address)) {
      return false;
    }

    this.activeWallet = address;
    this.saveWalletsToStorage();
    return true;
  }

  /**
   * Update wallet balance
   */
  async updateWalletBalance(address: string): Promise<void> {
    try {
      const wallet = this.wallets.get(address);
      if (!wallet) return;

      const utxos = await api.listUnspent(0, 9999999, [address]);
      
      const balance = utxos
        .filter(utxo => utxo.confirmations >= 1)
        .reduce((sum, utxo) => sum + utxo.amount, 0);
      
      const unconfirmedBalance = utxos
        .filter(utxo => utxo.confirmations === 0)
        .reduce((sum, utxo) => sum + utxo.amount, 0);

      wallet.balance = balance;
      wallet.unconfirmedBalance = unconfirmedBalance;
      
      this.wallets.set(address, wallet);
      this.saveWalletsToStorage();
    } catch (error) {
      console.error(`Failed to update balance for ${address}:`, error);
    }
  }

  /**
   * Update all wallet balances
   */
  async updateAllBalances(): Promise<void> {
    const addresses = Array.from(this.wallets.keys());
    await Promise.all(addresses.map(addr => this.updateWalletBalance(addr)));
  }

  /**
   * Get transaction history for a wallet
   */
  async getTransactionHistory(address: string, limit: number = 50): Promise<WalletTransactionRecord[]> {
    try {
      const list = await api.listTransactions(address, limit, 0, true);
      const filtered = list;

      const detailed = await Promise.all(
        filtered.map(async (tx) => {
          try {
            const raw = await api.getRawTransaction(tx.txid, true);
            if (typeof raw === 'string') return null;

            const inputs = raw.vin?.map(() => ({
              address: undefined,
              amount: undefined,
            })) || [];
            const outputs = raw.vout?.map((vout) => ({
              address: vout.scriptPubKey?.address,
              amount: vout.value,
            })) || [];

            return { inputs, outputs };
          } catch {
            return null;
          }
        })
      );

      return filtered.map((tx, idx) => {
        const type = tx.category === 'send' || tx.amount < 0 ? 'sent' : tx.category === 'receive' ? 'received' : 'other';
        const timestampSeconds = tx.time || tx.timereceived;
        return {
          txid: tx.txid,
          address: tx.address,
          amount: Math.abs(tx.amount),
          confirmations: tx.confirmations || 0,
          fee: tx.fee ? Math.abs(tx.fee) : undefined,
          type,
          timestamp: timestampSeconds ? timestampSeconds * 1000 : undefined,
          inputs: detailed[idx]?.inputs,
          outputs: detailed[idx]?.outputs,
        };
      });
    } catch (error) {
      throw new Error(`Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUtxos(address: string, minConfirmations: number = 0): Promise<any[]> {
    try {
      return await api.listUnspent(minConfirmations, 9999999, [address]);
    } catch (error) {
      throw new Error(`Failed to get UTXOs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async consolidateUtxos(
    fromAddress: string,
    utxos: Array<{ txid: string; vout: number; amount: number; scriptPubKey: string }>,
    destinationAddress: string,
    feeRate?: number
  ): Promise<string> {
    if (utxos.length === 0) {
      throw new Error('No UTXOs selected for consolidation');
    }

    const toValid = await api.validateAddress(destinationAddress);
    if (!toValid.isvalid) {
      throw new Error('Invalid destination address');
    }

    const effectiveFeeRate = feeRate || (await this.estimateFee(6));
    const totalAmount = utxos.reduce((sum, u) => sum + u.amount, 0);
    const estimatedSize = 148 * utxos.length + 34 + 10;
    const fee = (effectiveFeeRate * estimatedSize) / 100000000;
    const outputAmount = totalAmount - fee;

    if (outputAmount <= 0) {
      throw new Error('Insufficient funds to cover consolidation fee');
    }

    const inputs = utxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
    }));

    const outputs: Record<string, number> = {
      [destinationAddress]: outputAmount,
    };

    const rawTx = await api.createRawTransaction(inputs, outputs);
    const signedTx = await api.signRawTransactionWithWallet(rawTx);

    if (!signedTx.complete) {
      throw new Error('Failed to sign consolidation transaction');
    }

    const txid = await api.sendRawTransaction(signedTx.hex);
    await this.updateWalletBalance(fromAddress);
    return txid;
  }

  /**
   * Estimate fee for a transaction
   */
  async estimateFee(targetBlocks: number = 6): Promise<number> {
    try {
      const feeRate = await api.estimateSmartFee(targetBlocks);
      return feeRate.feerate || 0.00001; // Default to 1 sat/vB if estimate fails
    } catch (error) {
      console.error('Fee estimation failed, using default:', error);
      return 0.00001; // 1 sat/vB default
    }
  }

  /**
   * Create an unsigned transaction
   */
  async createTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    feeRate?: number
  ): Promise<UnsignedTransaction> {
    try {
      // Validate addresses
      const fromValid = await api.validateAddress(fromAddress);
      const toValid = await api.validateAddress(toAddress);

      if (!fromValid.isvalid) {
        throw new Error('Invalid sender address');
      }

      if (!toValid.isvalid) {
        throw new Error('Invalid recipient address');
      }

      // Get UTXOs for the sender
      const utxos = await api.listUnspent(1, 9999999, [fromAddress]);
      
      if (utxos.length === 0) {
        throw new Error('No spendable UTXOs available');
      }

      // Calculate total available
      const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);

      // Estimate fee if not provided
      if (!feeRate) {
        const estimate = await this.estimateFee(6);
        feeRate = estimate;
      }

      // Select UTXOs (simple: take enough to cover amount + estimated fee)
      let selectedAmount = 0;
      const selectedUtxos: TransactionInput[] = [];
      
      for (const utxo of utxos) {
        if (selectedAmount >= amount + (feeRate * 250 / 100000000)) break; // Rough estimate
        
        selectedUtxos.push({
          txid: utxo.txid,
          vout: utxo.vout,
          scriptPubKey: utxo.scriptPubKey,
          amount: utxo.amount,
          address: fromAddress,
        });
        
        selectedAmount += utxo.amount;
      }

      if (selectedAmount < amount) {
        throw new Error(`Insufficient funds. Available: ${totalAvailable.toFixed(8)} KBC, Required: ${amount.toFixed(8)} KBC`);
      }

      // Calculate actual fee (250 bytes is rough estimate for 2-in-2-out tx)
      const estimatedSize = 148 * selectedUtxos.length + 34 * 2 + 10;
      const fee = (feeRate * estimatedSize) / 100000000;

      if (selectedAmount < amount + fee) {
        throw new Error(`Insufficient funds to cover fee. Available: ${totalAvailable.toFixed(8)} KBC, Required: ${(amount + fee).toFixed(8)} KBC`);
      }

      // Create outputs
      const outputs: TransactionOutput[] = [
        { address: toAddress, amount },
      ];

      // Add change output if needed
      const change = selectedAmount - amount - fee;
      if (change > 0.00001) { // Dust threshold
        outputs.push({ address: fromAddress, amount: change });
      }

      return {
        inputs: selectedUtxos,
        outputs,
        fee,
      };
    } catch (error) {
      throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign a transaction (requires wallet to have private key)
   */
  async signTransaction(unsignedTx: UnsignedTransaction): Promise<SignedTransaction> {
    try {
      // Create raw transaction
      const inputs = unsignedTx.inputs.map(input => ({
        txid: input.txid,
        vout: input.vout,
      }));

      const outputs: Record<string, number> = {};
      unsignedTx.outputs.forEach(output => {
        outputs[output.address] = output.amount;
      });

      const rawTx = await api.createRawTransaction(inputs, outputs);
      
      // Sign the transaction
      const signedTx = await api.signRawTransactionWithWallet(rawTx);

      return {
        hex: signedTx.hex,
        txid: '', // Will be set after broadcast
        complete: signedTx.complete,
      };
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast a signed transaction
   */
  async broadcastTransaction(signedTx: SignedTransaction): Promise<string> {
    try {
      const txid = await api.sendRawTransaction(signedTx.hex);
      return txid;
    } catch (error) {
      throw new Error(`Failed to broadcast transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send transaction (create, sign, and broadcast in one call)
   */
  async sendTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    feeRate?: number
  ): Promise<string> {
    try {
      // Create unsigned transaction
      const unsignedTx = await this.createTransaction(fromAddress, toAddress, amount, feeRate);
      
      // Sign transaction
      const signedTx = await this.signTransaction(unsignedTx);
      
      if (!signedTx.complete) {
        throw new Error('Transaction signing incomplete');
      }
      
      // Broadcast transaction
      const txid = await this.broadcastTransaction(signedTx);
      
      // Update wallet balance
      await this.updateWalletBalance(fromAddress);
      
      return txid;
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch send transaction to multiple recipients
   */
  async batchSend(
    fromAddress: string,
    recipients: Array<{ address: string; amount: number }>,
    feeRate?: number
  ): Promise<string> {
    try {
      const wallet = this.wallets.get(fromAddress);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Calculate total amount needed
      const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);

      // Validate recipients
      for (const recipient of recipients) {
        const validation = await api.validateAddress(recipient.address);
        if (!validation.isvalid) {
          throw new Error(`Invalid recipient address: ${recipient.address}`);
        }
        if (recipient.amount <= 0) {
          throw new Error(`Invalid amount for ${recipient.address}`);
        }
      }

      // Get UTXOs for the wallet
      const utxos = await api.listUnspent(0, 9999999, [fromAddress]);
      if (utxos.length === 0) {
        throw new Error('No UTXOs available');
      }

      // Select UTXOs (greedy algorithm)
      const selectedUtxos: typeof utxos = [];
      let selectedAmount = 0;

      // Estimate fee
      const estimatedSize = 148 * utxos.length + 34 * (recipients.length + 1) + 10;
      const effectiveFeeRate = feeRate || 0.00001;
      const estimatedFee = (effectiveFeeRate * estimatedSize) / 100000000;

      const requiredAmount = totalAmount + estimatedFee;

      for (const utxo of utxos) {
        if (selectedAmount >= requiredAmount) break;
        selectedUtxos.push(utxo);
        selectedAmount += utxo.amount;
      }

      if (selectedAmount < requiredAmount) {
        throw new Error(`Insufficient funds. Need ${requiredAmount.toFixed(8)}, have ${selectedAmount.toFixed(8)} KBC`);
      }

      // Create transaction inputs
      const inputs: TransactionInput[] = selectedUtxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptPubKey: utxo.scriptPubKey,
        amount: utxo.amount,
        address: utxo.address,
      }));

      // Create outputs for recipients
      const outputs: TransactionOutput[] = recipients.map(r => ({
        address: r.address,
        amount: r.amount,
      }));

      // Add change output if needed
      const change = selectedAmount - totalAmount - estimatedFee;
      const dustThreshold = 0.00001;
      
      if (change > dustThreshold) {
        outputs.push({
          address: fromAddress,
          amount: change,
        });
      }

      // Create unsigned transaction
      const unsignedTx: UnsignedTransaction = {
        inputs,
        outputs,
        fee: estimatedFee,
      };

      // Sign and broadcast
      const signedTx = await this.signTransaction(unsignedTx);
      
      if (!signedTx.complete) {
        throw new Error('Transaction signing incomplete');
      }
      
      const txid = await this.broadcastTransaction(signedTx);
      
      // Update wallet balance
      await this.updateWalletBalance(fromAddress);
      
      return txid;
    } catch (error) {
      throw new Error(`Failed to batch send: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Replace-By-Fee (RBF) - Replace a stuck transaction with higher fee
   */
  async replaceTransaction(
    originalTxid: string,
    newFeeRate: number
  ): Promise<string> {
    try {
      // In a full implementation, this would:
      // 1. Get the original transaction details
      // 2. Check if it's RBF-enabled (sequence number < 0xfffffffe)
      // 3. Create a new transaction with same inputs but higher fee
      // 4. Broadcast the replacement
      
      // For now, throw a not implemented error with guidance
      throw new Error('RBF requires transaction indexing. Use the send page to create a new transaction with higher fee.');
    } catch (error) {
      throw new Error(`Failed to replace transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Child-Pays-For-Parent (CPFP) - Bump fee by spending unconfirmed output
   */
  async bumpFee(
    parentTxid: string,
    parentVout: number,
    feeRate: number
  ): Promise<string> {
    try {
      // In a full implementation, this would:
      // 1. Get the unconfirmed UTXO from parent tx
      // 2. Create a child transaction spending it with high fee
      // 3. Miners will include both to get the combined fee
      
      // For now, throw a not implemented error with guidance
      throw new Error('CPFP requires spending unconfirmed outputs. Use the send page to spend from this transaction with higher fee.');
    } catch (error) {
      throw new Error(`Failed to bump fee: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a wallet
   */
  deleteWallet(address: string): boolean {
    this.refreshFromStorageIfNeeded();
    if (!this.wallets.has(address)) {
      return false;
    }

    this.wallets.delete(address);

    if (this.activeWallet === address) {
      const remaining = this.getWallets();
      this.activeWallet = remaining.length > 0 ? remaining[0].address : null;
    }

    this.saveWalletsToStorage();
    return true;
  }

  /**
   * Export wallet (for backup)
   */
  exportWallet(address: string): string | null {
    this.refreshFromStorageIfNeeded();
    const wallet = this.wallets.get(address);
    if (!wallet) return null;

    return JSON.stringify(wallet, null, 2);
  }

  /**
   * Get wallet by address
   */
  getWallet(address: string): WalletInfo | undefined {
    this.refreshFromStorageIfNeeded();
    return this.wallets.get(address);
  }

  /**
   * Import watch-only wallet (address only, no private key)
   */
  importWatchOnlyWallet(address: string, label: string, xpub?: string): WalletInfo {
    if (this.wallets.has(address)) {
      throw new Error('Wallet address already exists');
    }

    const wallet: WalletInfo = {
      address,
      label,
      balance: 0,
      unconfirmedBalance: 0,
      createdAt: Date.now(),
      watchOnly: true,
      xpub,
    };

    this.wallets.set(address, wallet);
    this.saveWalletsToStorage();

    // Set as active if it's the first wallet
    if (this.wallets.size === 1) {
      this.activeWallet = address;
    }

    return wallet;
  }

  /**
   * Check if wallet is watch-only
   */
  isWatchOnly(address: string): boolean {
    const wallet = this.wallets.get(address);
    return wallet?.watchOnly || false;
  }

  /**
   * Get all watch-only wallets
   */
  getWatchOnlyWallets(): WalletInfo[] {
    return Array.from(this.wallets.values()).filter(w => w.watchOnly);
  }

  /**
   * Get all regular (non-watch-only) wallets
   */
  getRegularWallets(): WalletInfo[] {
    return Array.from(this.wallets.values()).filter(w => !w.watchOnly);
  }
}

// Export singleton instance
const walletService = new WalletService();
export default walletService;
