'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { MultiSigSetup } from '@/components/MultiSigSetup';
import { ApprovalFlow } from '@/components/ApprovalFlow';
import multisigWallet, { MultiSigWallet, PendingTransaction, CoSigner } from '@/services/multisigWallet';

export default function MultiSigPage() {
  const [wallets, setWallets] = useState<MultiSigWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<MultiSigWallet | null>(null);
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setWallets(multisigWallet.getAllWallets());
    if (selectedWallet) {
      setPendingTxs(multisigWallet.getPendingTransactions(selectedWallet.id));
    }
  };

  const handleCreateWallet = async (walletData: {
    name: string;
    requiredSignatures: number;
    coSigners: { name: string; address: string; role: 'admin' | 'signer' | 'viewer' }[];
    spendingLimit?: number;
    timeLockHours?: number;
  }) => {
    try {
      const wallet = await multisigWallet.createWallet(
        walletData.name,
        walletData.requiredSignatures,
        walletData.coSigners,
        walletData.spendingLimit,
        walletData.timeLockHours
      );
      alert(`Multi-sig wallet created! Address: ${wallet.address}`);
      loadData();
      setShowSetup(false);
    } catch (error: any) {
      alert('Failed to create wallet: ' + error.message);
    }
  };

  const handleSignTransaction = (txId: string) => {
    if (!selectedWallet) return;
    try {
      multisigWallet.signTransaction(selectedWallet.id, txId, 'your_signature_here');
      alert('Transaction signed successfully!');
      loadData();
    } catch (error: any) {
      alert('Signing failed: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Multi-Signature Wallet System</h1>
        <p className="text-gray-600">
          Create and manage wallets with M-of-N signature requirements for enhanced security
        </p>
      </div>

      {showSetup && <MultiSigSetup onCancelAction={() => setShowSetup(false)} onCompleteAction={handleCreateWallet} />}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-gray-600">Total Wallets</div>
          <div className="text-2xl font-bold">{wallets.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Pending Approvals</div>
          <div className="text-2xl font-bold text-orange-600">{pendingTxs.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Active Wallet</div>
          <div className="text-2xl font-bold">{selectedWallet ? selectedWallet.name : 'None'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Total Balance</div>
          <div className="text-2xl font-bold">
            ${wallets.reduce((sum, w) => sum + w.balance, 0).toLocaleString()}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Multi-Sig Wallets</h2>
              <Button onClick={() => setShowSetup(true)}>
                ➕ Create New Wallet
              </Button>
            </div>

            {wallets.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">🔐</div>
                <div className="text-lg">No multi-sig wallets yet</div>
                <div className="text-sm">Create your first multi-signature wallet for enhanced security</div>
              </div>
            ) : (
              <div className="space-y-3">
                {wallets.map(wallet => (
                  <div
                    key={wallet.id}
                    onClick={() => { setSelectedWallet(wallet); setPendingTxs(multisigWallet.getPendingTransactions(wallet.id)); }}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedWallet?.id === wallet.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-lg font-semibold">{wallet.name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {wallet.requiredSignatures} of {wallet.totalSigners} signatures required
                        </div>
                        <div className="mt-2 flex gap-2 text-xs">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                            {wallet.coSigners.length} Co-signers
                          </span>
                          {wallet.timeLockHours && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                              Time-locked: {wallet.timeLockHours}h
                            </span>
                          )}
                          {wallet.spendingLimit && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                              Spending Limit: ${wallet.spendingLimit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">${wallet.balance.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{wallet.address.slice(0, 12)}...</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selectedWallet && (
            <ApprovalFlow
              transactions={pendingTxs}
              walletRequiredSignatures={selectedWallet.requiredSignatures}
              currentUserId="current_user"
              onSignAction={handleSignTransaction}
              onRejectAction={(txId, reason) => {
                multisigWallet.rejectTransaction(selectedWallet.id, txId);
                loadData();
              }}
            />
          )}
        </div>

        <div className="space-y-6">
          {selectedWallet && (
            <>
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Wallet Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-gray-600">Name</div>
                    <div className="font-semibold">{selectedWallet.name}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Address</div>
                    <div className="font-mono text-xs break-all">{selectedWallet.address}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Signature Requirement</div>
                    <div className="font-semibold">
                      {selectedWallet.requiredSignatures} of {selectedWallet.totalSigners}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Balance</div>
                    <div className="font-semibold text-lg">${selectedWallet.balance.toLocaleString()}</div>
                  </div>
                  {selectedWallet.spendingLimit && (
                    <div>
                      <div className="text-gray-600">Spending Limit</div>
                      <div className="font-semibold">${selectedWallet.spendingLimit.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Co-Signers ({selectedWallet.coSigners.length})</h3>
                <div className="space-y-2">
                  {selectedWallet.coSigners.map((signer, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-sm">{signer.name}</div>
                          <div className="text-xs text-gray-600 font-mono">{signer.address.slice(0, 16)}...</div>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${
                          signer.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          signer.role === 'signer' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {signer.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Actions</h3>
                <div className="space-y-2">
                  <Button className="w-full">💸 Send Transaction</Button>
                  <Button className="w-full bg-purple-500 hover:bg-purple-600">➕ Add Co-Signer</Button>
                  <Button className="w-full bg-orange-500 hover:bg-orange-600">⏰ Set Time Lock</Button>
                  <Button className="w-full bg-gray-500 hover:bg-gray-600">⚙️ Wallet Settings</Button>
                </div>
              </Card>
            </>
          )}

          <Card className="p-6 bg-blue-50 border-blue-200">
            <div className="text-sm">
              <div className="font-semibold text-blue-900 mb-2">💡 Multi-Sig Benefits</div>
              <ul className="text-blue-800 space-y-1 text-xs">
                <li>• Shared custody of funds</li>
                <li>• Protection against single point of failure</li>
                <li>• Requires multiple approvals for transactions</li>
                <li>• Ideal for organizations and families</li>
                <li>• Time-locked transactions for scheduled payments</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
