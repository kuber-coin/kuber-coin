// Multi-Signature Wallet Service
// Multi-sig wallet management helpers

export interface CoSigner {
  id: string;
  name: string;
  publicKey: string;
  email?: string;
  addedAt: number;
}

export interface MultiSigWallet {
  id: string;
  label: string;
  address: string;
  requiredSignatures: number;
  totalSigners: number;
  coSigners: CoSigner[];
  createdAt: number;
  balance: number;
}

export interface PendingTransaction {
  id: string;
  walletId: string;
  to: string;
  amount: number;
  fee: number;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  signatures: { signerId: string; signature: string; signedAt: number }[];
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  description?: string;
}

class MultiSigService {
  private wallets: Map<string, MultiSigWallet> = new Map();
  private pendingTxs: Map<string, PendingTransaction> = new Map();
  private readonly STORAGE_KEY_WALLETS = 'kubercoin_multisig_wallets';
  private readonly STORAGE_KEY_PENDING = 'kubercoin_multisig_pending';

  constructor() {
    this.loadWallets();
    this.loadPendingTransactions();
  }

  private loadWallets() {
    const stored = localStorage.getItem(this.STORAGE_KEY_WALLETS);
    if (stored) {
      const wallets = JSON.parse(stored);
      wallets.forEach((w: MultiSigWallet) => {
        this.wallets.set(w.id, w);
      });
    }
  }

  private saveWallets() {
    const wallets = Array.from(this.wallets.values());
    localStorage.setItem(this.STORAGE_KEY_WALLETS, JSON.stringify(wallets));
  }

  private loadPendingTransactions() {
    const stored = localStorage.getItem(this.STORAGE_KEY_PENDING);
    if (stored) {
      const txs = JSON.parse(stored);
      txs.forEach((tx: PendingTransaction) => {
        this.pendingTxs.set(tx.id, tx);
      });
    }
  }

  private savePendingTransactions() {
    const txs = Array.from(this.pendingTxs.values());
    localStorage.setItem(this.STORAGE_KEY_PENDING, JSON.stringify(txs));
  }

  createMultiSigWallet(
    label: string,
    requiredSignatures: number,
    coSigners: Omit<CoSigner, 'id' | 'addedAt'>[]
  ): MultiSigWallet {
    if (requiredSignatures < 1 || requiredSignatures > coSigners.length) {
      throw new Error('Invalid signature requirement');
    }

    // IMPORTANT: Multisig addresses must be derived from the combined public
    // keys of all co-signers by the node (P2SH / P2WSH). A fabricated string
    // from Math.random() is not a valid address — funds sent there are lost.
    // TODO: call walletApi.post('/api/multisig/create', { label, requiredSignatures, coSigners })
    //       and use the address returned by the node.
    throw new Error(
      'Multisig wallet creation is not yet integrated with the blockchain node. ' +
      'Please use the node CLI to create a multisig wallet.'
    );
    /* remove the unreachable block below once the API is wired in
    const wallet: MultiSigWallet = {
      id: `multisig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label,
      address: 'REPLACE_WITH_NODE_DERIVED_ADDRESS',
      requiredSignatures,
      totalSigners: coSigners.length,
      coSigners: coSigners.map((cs, i) => ({
        ...cs,
        id: `signer_${i}_${Date.now()}`,
        addedAt: Date.now(),
      })),
      createdAt: Date.now(),
      balance: 0,
    };

    this.wallets.set(wallet.id, wallet);
    this.saveWallets();
    return wallet;
    */
  }

  getMultiSigWallets(): MultiSigWallet[] {
    return Array.from(this.wallets.values());
  }

  getMultiSigWallet(id: string): MultiSigWallet | undefined {
    return this.wallets.get(id);
  }

  addCoSigner(walletId: string, coSigner: Omit<CoSigner, 'id' | 'addedAt'>): void {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');

    const newCoSigner: CoSigner = {
      ...coSigner,
      id: `signer_${wallet.coSigners.length}_${Date.now()}`,
      addedAt: Date.now(),
    };

    wallet.coSigners.push(newCoSigner);
    wallet.totalSigners = wallet.coSigners.length;
    this.saveWallets();
  }

  removeCoSigner(walletId: string, signerId: string): void {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');

    wallet.coSigners = wallet.coSigners.filter((cs) => cs.id !== signerId);
    wallet.totalSigners = wallet.coSigners.length;

    if (wallet.requiredSignatures > wallet.totalSigners) {
      throw new Error('Cannot remove signer: would make wallet unusable');
    }

    this.saveWallets();
  }

  createPendingTransaction(
    walletId: string,
    to: string,
    amount: number,
    fee: number,
    createdBy: string,
    description?: string
  ): PendingTransaction {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');

    const tx: PendingTransaction = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletId,
      to,
      amount,
      fee,
      createdBy,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      signatures: [],
      status: 'pending',
      description,
    };

    this.pendingTxs.set(tx.id, tx);
    this.savePendingTransactions();
    return tx;
  }

  signTransaction(txId: string, signerId: string, signature: string): PendingTransaction {
    const tx = this.pendingTxs.get(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.status !== 'pending') throw new Error('Transaction is not pending');

    const wallet = this.wallets.get(tx.walletId);
    if (!wallet) throw new Error('Wallet not found');

    // Check if signer is valid
    const signer = wallet.coSigners.find((cs) => cs.id === signerId);
    if (!signer) throw new Error('Invalid signer');

    // Check if already signed
    if (tx.signatures.some((s) => s.signerId === signerId)) {
      throw new Error('Already signed by this signer');
    }

    tx.signatures.push({
      signerId,
      signature,
      signedAt: Date.now(),
    });

    // Check if we have enough signatures
    if (tx.signatures.length >= wallet.requiredSignatures) {
      tx.status = 'completed';
    }

    this.savePendingTransactions();
    return tx;
  }

  getPendingTransactions(walletId?: string): PendingTransaction[] {
    let txs = Array.from(this.pendingTxs.values());
    if (walletId) {
      txs = txs.filter((tx) => tx.walletId === walletId);
    }
    return txs.sort((a, b) => b.createdAt - a.createdAt);
  }

  cancelTransaction(txId: string): void {
    const tx = this.pendingTxs.get(txId);
    if (!tx) throw new Error('Transaction not found');
    tx.status = 'cancelled';
    this.savePendingTransactions();
  }

  updateThreshold(walletId: string, newThreshold: number): void {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');

    if (newThreshold < 1 || newThreshold > wallet.totalSigners) {
      throw new Error('Invalid threshold');
    }

    wallet.requiredSignatures = newThreshold;
    this.saveWallets();
  }

  deleteWallet(walletId: string): void {
    this.wallets.delete(walletId);
    // Also delete pending transactions
    Array.from(this.pendingTxs.values())
      .filter((tx) => tx.walletId === walletId)
      .forEach((tx) => this.pendingTxs.delete(tx.id));
    this.saveWallets();
    this.savePendingTransactions();
  }
}

const multisigService = new MultiSigService();
export default multisigService;
