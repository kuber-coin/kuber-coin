// multisigWallet.ts - Multi-signature wallet management service

export interface CoSigner {
  id: string;
  name: string;
  address: string;
  role: 'admin' | 'signer' | 'viewer';
  addedDate: number;
}

export interface MultiSigWallet {
  id: string;
  name: string;
  address: string;
  requiredSignatures: number;
  totalSigners: number;
  coSigners: CoSigner[];
  balance: number;
  spendingLimit?: number;
  timeLockHours?: number;
  createdDate: number;
}

export interface PendingTransaction {
  id: string;
  walletId: string;
  to: string;
  amount: number;
  fee: number;
  description: string;
  createdBy: string;
  createdDate: number;
  executionDate?: number;
  signatures: {
    signerId: string;
    signerName: string;
    signature: string;
    signedDate: number;
  }[];
  rejections: {
    signerId: string;
    signerName: string;
    rejectedDate: number;
    reason?: string;
  }[];
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
}

class MultiSigWalletService {
  private wallets: Map<string, MultiSigWallet>;
  private pendingTransactions: Map<string, PendingTransaction>;

  constructor() {
    this.wallets = new Map();
    this.pendingTransactions = new Map();
  }

  getAllWallets(): MultiSigWallet[] {
    return Array.from(this.wallets.values());
  }

  getWallet(walletId: string): MultiSigWallet | undefined {
    return this.wallets.get(walletId);
  }

  async createWallet(
    name: string,
    requiredSignatures: number,
    coSigners: { name: string; address: string; role: 'admin' | 'signer' | 'viewer' }[],
    spendingLimit?: number,
    timeLockHours?: number
  ): Promise<MultiSigWallet> {
    if (requiredSignatures > coSigners.length) {
      throw new Error('Required signatures cannot exceed total signers');
    }
    if (requiredSignatures < 1) {
      throw new Error('At least 1 signature is required');
    }

    const walletId = `msw_${Date.now()}`;
    const address = 'KC1' + Math.random().toString(16).substring(2, 40) + '_msig';

    const wallet: MultiSigWallet = {
      id: walletId,
      name,
      address,
      requiredSignatures,
      totalSigners: coSigners.length,
      coSigners: coSigners.map((cs, index) => ({
        id: `cs_${walletId}_${index}`,
        name: cs.name,
        address: cs.address,
        role: cs.role,
        addedDate: Date.now(),
      })),
      balance: 0,
      spendingLimit,
      timeLockHours,
      createdDate: Date.now(),
    };

    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async createTransaction(
    walletId: string,
    to: string,
    amount: number,
    description: string,
    createdBy: string
  ): Promise<PendingTransaction> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.spendingLimit && amount > wallet.spendingLimit) {
      throw new Error(`Amount exceeds spending limit of ${wallet.spendingLimit} KC`);
    }
    if (amount > wallet.balance) throw new Error('Insufficient balance');

    const txId = `tx_pending_${Date.now()}`;
    const fee = Math.max(0.1, amount * 0.0001);
    let executionDate: number | undefined;
    if (wallet.timeLockHours) {
      executionDate = Date.now() + wallet.timeLockHours * 60 * 60 * 1000;
    }

    const transaction: PendingTransaction = {
      id: txId,
      walletId,
      to,
      amount,
      fee,
      description,
      createdBy,
      createdDate: Date.now(),
      executionDate,
      signatures: [],
      rejections: [],
      status: 'pending',
    };

    this.pendingTransactions.set(txId, transaction);
    return transaction;
  }

  getPendingTransactions(walletId?: string): PendingTransaction[] {
    const allTransactions = Array.from(this.pendingTransactions.values());
    if (walletId) {
      return allTransactions.filter(tx => tx.walletId === walletId && tx.status === 'pending');
    }
    return allTransactions.filter(tx => tx.status === 'pending');
  }

  async signTransaction(txId: string, signerId: string, signature: string): Promise<PendingTransaction> {
    const tx = this.pendingTransactions.get(txId);
    if (!tx) throw new Error('Transaction not found');

    const wallet = this.wallets.get(tx.walletId);
    if (!wallet) throw new Error('Wallet not found');

    const signer = wallet.coSigners.find(cs => cs.id === signerId);
    if (!signer) throw new Error('Signer not found in wallet');
    if (signer.role === 'viewer') throw new Error('Viewers cannot sign transactions');
    if (tx.signatures.some(s => s.signerId === signerId)) {
      throw new Error('Already signed by this signer');
    }

    tx.signatures.push({
      signerId,
      signerName: signer.name,
      signature,
      signedDate: Date.now(),
    });

    if (tx.signatures.length >= wallet.requiredSignatures) {
      tx.status = 'approved';
    }

    this.pendingTransactions.set(txId, tx);
    return tx;
  }

  async rejectTransaction(txId: string, signerId: string, reason?: string): Promise<PendingTransaction> {
    const tx = this.pendingTransactions.get(txId);
    if (!tx) throw new Error('Transaction not found');

    const wallet = this.wallets.get(tx.walletId);
    if (!wallet) throw new Error('Wallet not found');

    const signer = wallet.coSigners.find(cs => cs.id === signerId);
    if (!signer) throw new Error('Signer not found in wallet');

    tx.rejections.push({
      signerId,
      signerName: signer.name,
      rejectedDate: Date.now(),
      reason,
    });

    tx.status = 'rejected';
    this.pendingTransactions.set(txId, tx);
    return tx;
  }

  async addCoSigner(
    walletId: string,
    name: string,
    address: string,
    role: 'admin' | 'signer' | 'viewer'
  ): Promise<MultiSigWallet> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.coSigners.some(cs => cs.address === address)) {
      throw new Error('Co-signer already exists');
    }

    const coSigner: CoSigner = {
      id: `cs_${walletId}_${Date.now()}`,
      name,
      address,
      role,
      addedDate: Date.now(),
    };

    wallet.coSigners.push(coSigner);
    wallet.totalSigners = wallet.coSigners.length;
    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async removeCoSigner(walletId: string, coSignerId: string): Promise<MultiSigWallet> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');

    const newCoSigners = wallet.coSigners.filter(cs => cs.id !== coSignerId);
    if (newCoSigners.length < wallet.requiredSignatures) {
      throw new Error('Cannot remove co-signer: would drop below required signatures');
    }

    wallet.coSigners = newCoSigners;
    wallet.totalSigners = newCoSigners.length;
    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async updateSpendingLimit(walletId: string, limit?: number): Promise<MultiSigWallet> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.spendingLimit = limit;
    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async updateTimeLock(walletId: string, hours?: number): Promise<MultiSigWallet> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.timeLockHours = hours;
    this.wallets.set(walletId, wallet);
    return wallet;
  }

  getTotalBalance(): number {
    return Array.from(this.wallets.values()).reduce((sum, wallet) => sum + wallet.balance, 0);
  }

  getPendingApprovalsCount(): number {
    return Array.from(this.pendingTransactions.values()).filter(tx => tx.status === 'pending').length;
  }
}

const multiSigWalletService = new MultiSigWalletService();
export default multiSigWalletService;