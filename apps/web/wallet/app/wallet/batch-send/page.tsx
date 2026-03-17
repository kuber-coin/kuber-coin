'use client';

import { useState, useEffect } from 'react';
import walletService from '@/services/wallet';
import transactionLabelsService from '../../../src/services/transactionLabels';

interface Recipient {
  id: string;
  address: string;
  amount: string;
  label?: string;
}

export default function BatchSendPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [activeWallet, setActiveWallet] = useState<any>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', address: '', amount: '', label: '' },
  ]);
  const [feeRate, setFeeRate] = useState<'slow' | 'medium' | 'fast' | 'custom'>('medium');
  const [customFee, setCustomFee] = useState('0.00001');
  const [useCustomFee, setUseCustomFee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [estimatedFee, setEstimatedFee] = useState(0);

  useEffect(() => {
    loadWallets();
  }, []);

  useEffect(() => {
    calculateTotal();
  }, [recipients]);

  const loadWallets = async () => {
    try {
      const allWallets = walletService.getWallets();
      setWallets(allWallets);
      
      const active = walletService.getActiveWallet();
      if (active) {
        await walletService.updateWalletBalance(active.address);
        setActiveWallet(walletService.getActiveWallet());
      }
    } catch (err) {
      console.error('Failed to load wallets:', err);
    }
  };

  const calculateTotal = () => {
    const total = recipients.reduce((sum, r) => {
      const amount = parseFloat(r.amount) || 0;
      return sum + amount;
    }, 0);
    setTotalAmount(total);
  };

  const addRecipient = () => {
    const newId = (parseInt(recipients[recipients.length - 1].id) + 1).toString();
    setRecipients([...recipients, { id: newId, address: '', amount: '', label: '' }]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length <= 1) {
      setError('Must have at least one recipient');
      return;
    }
    setRecipients(recipients.filter(r => r.id !== id));
  };

  const updateRecipient = (id: string, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    ));
  };

  const validateBatchSend = (): string | null => {
    if (!activeWallet) {
      return 'No active wallet selected';
    }

    if (recipients.length === 0) {
      return 'Must have at least one recipient';
    }

    for (const recipient of recipients) {
      if (!recipient.address) {
        return `Recipient ${recipient.id}: Address is required`;
      }
      const amount = parseFloat(recipient.amount);
      if (isNaN(amount) || amount <= 0) {
        return `Recipient ${recipient.id}: Invalid amount`;
      }
    }

    if (totalAmount <= 0) {
      return 'Total amount must be greater than 0';
    }

    if (totalAmount > activeWallet.balance) {
      return `Insufficient funds. You have ${activeWallet.balance.toFixed(8)} KBC`;
    }

    if (useCustomFee) {
      const customFeeNum = parseFloat(customFee);
      if (isNaN(customFeeNum) || customFeeNum < 0) {
        return 'Invalid custom fee rate';
      }
    }

    return null;
  };

  const handlePreview = () => {
    const validationError = validateBatchSend();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Estimate fee based on recipients
    const feeRates: Record<string, number> = {
      slow: 0.00001,
      medium: 0.00002,
      fast: 0.00005,
    };

    const rate = useCustomFee ? parseFloat(customFee) : (feeRates[feeRate] || 0.00002);
    // Rough estimate: 148 bytes per input + 34 bytes per output + 10 bytes overhead
    // Assuming 2 inputs on average
    const estimatedSize = 148 * 2 + 34 * (recipients.length + 1) + 10;
    const fee = (rate * estimatedSize) / 100000000;
    setEstimatedFee(fee);

    setShowConfirmation(true);
    setError(null);
  };

  const handleBatchSend = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const feeRates: Record<string, number> = {
        slow: 0.00001,
        medium: 0.00002,
        fast: 0.00005,
      };

      const rate = useCustomFee ? parseFloat(customFee) : (feeRates[feeRate] || 0.00002);

      const recipientList = recipients.map(r => ({
        address: r.address,
        amount: parseFloat(r.amount),
      }));

      const txid = await walletService.batchSend(
        activeWallet.address,
        recipientList,
        rate
      );

      // Add labels for recipients if provided
      recipients.forEach((recipient, index) => {
        if (recipient.label) {
          transactionLabelsService.addLabel(
            txid,
            `Batch send to ${recipient.label}`,
            ['batch-send', 'outgoing'],
            'batch'
          );
        }
      });

      setSuccess(`Batch transaction sent successfully! Transaction ID: ${txid}`);
      setShowConfirmation(false);
      
      // Reset form
      setRecipients([{ id: '1', address: '', amount: '', label: '' }]);
      
      // Reload wallet balances
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Failed to send batch transaction');
      setShowConfirmation(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Batch Send
          </h1>
          <p className="text-gray-400">Send KBC to multiple recipients in one transaction</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Active Wallet */}
          {activeWallet && (
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
              <h2 className="text-lg font-semibold mb-4">Sending From</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Wallet</p>
                  <p className="font-semibold">{activeWallet.label}</p>
                  <p className="text-sm text-gray-500 font-mono">{activeWallet.address.substring(0, 20)}...</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Available Balance</p>
                  <p className="text-2xl font-bold text-green-400">{activeWallet.balance.toFixed(8)} KBC</p>
                  {activeWallet.unconfirmedBalance > 0 && (
                    <p className="text-sm text-yellow-500">+{activeWallet.unconfirmedBalance.toFixed(8)} unconfirmed</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recipients */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recipients ({recipients.length})</h2>
              <button
                onClick={addRecipient}
                className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition"
              >
                + Add Recipient
              </button>
            </div>

            <div className="space-y-4">
              {recipients.map((recipient, index) => (
                <div key={recipient.id} className="p-4 bg-[#0F0F23] rounded-lg border border-purple-500/10">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-lg font-semibold text-purple-400">#{index + 1}</span>
                    {recipients.length > 1 && (
                      <button
                        onClick={() => removeRecipient(recipient.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Address *
                      </label>
                      <input
                        type="text"
                        value={recipient.address}
                        onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                        placeholder="Enter recipient address"
                        className="w-full px-4 py-2 bg-[#1A1A2E] border border-purple-500/30 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Amount (KBC) *
                        </label>
                        <input
                          type="number"
                          value={recipient.amount}
                          onChange={(e) => updateRecipient(recipient.id, 'amount', e.target.value)}
                          placeholder="0.00000000"
                          step="0.00000001"
                          className="w-full px-4 py-2 bg-[#1A1A2E] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Label (optional)
                        </label>
                        <input
                          type="text"
                          value={recipient.label}
                          onChange={(e) => updateRecipient(recipient.id, 'label', e.target.value)}
                          placeholder="e.g., Alice"
                          className="w-full px-4 py-2 bg-[#1A1A2E] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-blue-400 font-medium">Total Amount</span>
                <span className="text-2xl font-bold text-blue-400">{totalAmount.toFixed(8)} KBC</span>
              </div>
            </div>
          </div>

          {/* Fee Selection */}
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Transaction Fee</h2>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <button
                onClick={() => { setFeeRate('slow'); setUseCustomFee(false); }}
                className={`p-3 rounded-lg border transition ${
                  feeRate === 'slow' && !useCustomFee
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-purple-500/30 bg-[#0F0F23] hover:border-purple-500/50'
                }`}
              >
                <div className="text-sm text-gray-400">Slow (~2 hours)</div>
                <div className="text-lg font-semibold">1 sat/vB</div>
              </button>

              <button
                onClick={() => { setFeeRate('medium'); setUseCustomFee(false); }}
                className={`p-3 rounded-lg border transition ${
                  feeRate === 'medium' && !useCustomFee
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-purple-500/30 bg-[#0F0F23] hover:border-purple-500/50'
                }`}
              >
                <div className="text-sm text-gray-400">Medium (~1 hour)</div>
                <div className="text-lg font-semibold">2 sat/vB</div>
              </button>

              <button
                onClick={() => { setFeeRate('fast'); setUseCustomFee(false); }}
                className={`p-3 rounded-lg border transition ${
                  feeRate === 'fast' && !useCustomFee
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-purple-500/30 bg-[#0F0F23] hover:border-purple-500/50'
                }`}
              >
                <div className="text-sm text-gray-400">Fast (~20 min)</div>
                <div className="text-lg font-semibold">5 sat/vB</div>
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="useCustomFee"
                checked={useCustomFee}
                onChange={(e) => setUseCustomFee(e.target.checked)}
                className="w-4 h-4 text-purple-500"
              />
              <label htmlFor="useCustomFee" className="text-sm text-gray-300">
                Use custom fee rate
              </label>
            </div>

            {useCustomFee && (
              <input
                type="number"
                value={customFee}
                onChange={(e) => setCustomFee(e.target.value)}
                placeholder="0.00001"
                step="0.00001"
                className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            )}
          </div>

          {/* Preview Button */}
          <button
            onClick={handlePreview}
            disabled={loading || !activeWallet}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Preview Batch Transaction
          </button>
        </div>

        {/* Confirmation Modal */}
        {showConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1A1A2E] rounded-lg p-6 max-w-lg w-full border border-purple-500/20">
              <h2 className="text-2xl font-bold mb-4">Confirm Batch Transaction</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm text-gray-400">From</p>
                  <p className="font-mono text-sm">{activeWallet?.address}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Recipients ({recipients.length})</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipients.map((r, i) => (
                      <div key={r.id} className="p-2 bg-[#0F0F23] rounded text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">#{i + 1} {r.label && `(${r.label})`}</span>
                          <span className="font-semibold text-green-400">{parseFloat(r.amount).toFixed(8)} KBC</span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-1">{r.address.substring(0, 30)}...</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#0F0F23] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Total Amount</span>
                    <span className="font-semibold">{totalAmount.toFixed(8)} KBC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Estimated Fee</span>
                    <span className="font-semibold">{estimatedFee.toFixed(8)} KBC</span>
                  </div>
                  <div className="pt-2 border-t border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-xl font-bold text-purple-400">
                        {(totalAmount + estimatedFee).toFixed(8)} KBC
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <p className="text-sm text-yellow-300">
                    ⚠️ This transaction will send funds to {recipients.length} recipient{recipients.length > 1 ? 's' : ''}. Please verify all addresses carefully.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBatchSend}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 transition"
                >
                  {loading ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
