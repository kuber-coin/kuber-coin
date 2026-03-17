'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/services/api';
import walletService from '@/services/wallet';

interface TransactionInput {
  address: string;
  amount: number;
  signature: string;
}

interface TransactionOutput {
  address: string;
  amount: number;
}

interface TransactionDetails {
  txid: string;
  timestamp: number;
  block: number;
  confirmations: number;
  size: number;
  fee: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  hex: string;
  status: 'confirmed' | 'pending' | 'failed';
  rbfEnabled: boolean;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const txid = params.txid as string;

  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRBF, setShowRBF] = useState(false);
  const [showCPFP, setShowCPFP] = useState(false);
  const [newFee, setNewFee] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const loadTransaction = async () => {
      if (!txid) return;
      setLoading(true);
      setError(null);

      try {
        const raw = await api.getRawTransaction(txid, true);
        if (typeof raw === 'string') {
          throw new Error('Transaction data unavailable');
        }

        let blockHeight = 0;
        if (raw.blockhash) {
          try {
            const block = await api.getBlock(raw.blockhash, 1);
            blockHeight = block.height;
          } catch {
            blockHeight = 0;
          }
        }

        const confirmations = raw.confirmations || 0;
        const timestamp = raw.time ? raw.time * 1000 : Date.now();
        const rbfEnabled = raw.vin?.some((vin) => vin.sequence < 0xfffffffe) || false;

        setTransaction({
          txid: raw.txid,
          timestamp,
          block: blockHeight,
          confirmations,
          size: raw.size,
          fee: 0,
          inputs: raw.vin.map((vin) => ({
            address: 'Unknown',
            amount: 0,
            signature: vin.scriptSig?.hex || '',
          })),
          outputs: raw.vout.map((vout) => ({
            address: vout.scriptPubKey?.address || 'Unknown',
            amount: vout.value,
          })),
          hex: raw.hex,
          status: confirmations > 0 ? 'confirmed' : 'pending',
          rbfEnabled,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load transaction');
      } finally {
        setLoading(false);
      }
    };

    loadTransaction();
  }, [txid]);

  useEffect(() => {
    if (!txid) return;
    const stored = localStorage.getItem(`kubercoin_tx_note_${txid}`);
    if (stored) {
      setNote(stored);
    }
  }, [txid]);

  const handleRBF = async () => {
    if (!transaction) return;
    try {
      const fee = parseFloat(newFee);
      if (!fee || fee <= 0) throw new Error('Enter a valid fee');
      const txidResult = await walletService.replaceTransaction(transaction.txid, fee);
      alert(`Replacement transaction created: ${txidResult}`);
      setShowRBF(false);
    } catch (err: any) {
      alert(err.message || 'Failed to replace transaction');
    }
  };

  const handleCPFP = async () => {
    if (!transaction) return;
    try {
      const fee = parseFloat(newFee);
      if (!fee || fee <= 0) throw new Error('Enter a valid fee');
      const txidResult = await walletService.bumpFee(transaction.txid, 0, fee);
      alert(`CPFP transaction created: ${txidResult}`);
      setShowCPFP(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create CPFP transaction');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const shareTransaction = () => {
    const url = `${window.location.origin}/wallet/transaction/${txid}`;
    navigator.clipboard.writeText(url);
    alert('Transaction link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6 text-white flex items-center justify-center">
        <div>Loading transaction...</div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6 text-white flex items-center justify-center">
        <div>{error || 'Transaction not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/wallet" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
              ← Back
            </Link>
            <h1 className="text-3xl font-bold text-white">🔍 Transaction Details</h1>
          </div>
          <button
            onClick={shareTransaction}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            🔗 Share
          </button>
        </div>

        {/* Status Card */}
        <div className="mb-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-purple-200 text-sm mb-1">Status</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {transaction.status === 'confirmed' ? '✅' : 
                   transaction.status === 'pending' ? '⏳' : '❌'}
                </span>
                <span className="text-2xl font-bold text-white capitalize">
                  {transaction.status}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-purple-200 text-sm mb-1">Confirmations</div>
              <div className="text-3xl font-bold text-white">
                {transaction.confirmations}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-2 bg-purple-900 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-white transition-all duration-500"
              style={{ width: `${Math.min((transaction.confirmations / 6) * 100, 100)}%` }}
            />
          </div>
          <div className="text-sm text-purple-200 mt-2">
            {transaction.confirmations >= 6 ? 'Fully confirmed' : `${6 - transaction.confirmations} more confirmation(s) needed`}
          </div>
        </div>

        {/* Transaction Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Transaction Info</h2>
            <div className="space-y-3">
              <div>
                <div className="text-purple-300 text-sm">Transaction ID</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-white font-mono text-sm break-all flex-1">
                    {transaction.txid}
                  </div>
                  <button
                    onClick={() => copyToClipboard(transaction.txid)}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-purple-300 text-sm">Block</div>
                  <div className="text-white font-semibold">#{transaction.block}</div>
                </div>
                <div>
                  <div className="text-purple-300 text-sm">Size</div>
                  <div className="text-white font-semibold">{transaction.size} bytes</div>
                </div>
              </div>

              <div>
                <div className="text-purple-300 text-sm">Timestamp</div>
                <div className="text-white font-semibold">
                  {new Date(transaction.timestamp).toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-purple-300 text-sm">Fee</div>
                <div className="text-white font-semibold">
                  {transaction.fee.toFixed(8)} KC
                  <span className="text-purple-300 text-xs ml-2">
                    ({transaction.size ? (transaction.fee / transaction.size * 100000000).toFixed(2) : '0.00'} sat/byte)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Actions</h2>
            <div className="space-y-3">
              {transaction.status === 'pending' && transaction.rbfEnabled && (
                <button
                  onClick={() => setShowRBF(true)}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition text-left"
                >
                  <div className="font-semibold text-white mb-1">⚡ Replace-By-Fee (RBF)</div>
                  <div className="text-sm text-purple-200">
                    Increase fee to speed up confirmation
                  </div>
                </button>
              )}

              {transaction.status === 'pending' && (
                <button
                  onClick={() => setShowCPFP(true)}
                  className="w-full px-4 py-3 bg-purple-700 hover:bg-purple-600 rounded-lg transition text-left"
                >
                  <div className="font-semibold text-white mb-1">🔗 Child-Pays-For-Parent</div>
                  <div className="text-sm text-purple-200">
                    Create child transaction with higher fee
                  </div>
                </button>
              )}

              <a
                href={`https://explorer.kuber-coin.com/tx/${transaction.txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-3 bg-purple-700 hover:bg-purple-600 rounded-lg transition text-left"
              >
                <div className="font-semibold text-white mb-1">🔍 View on Explorer</div>
                <div className="text-sm text-purple-200">
                  Open in blockchain explorer
                </div>
              </a>

              <div>
                <label className="block text-purple-200 text-sm mb-2">Add Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white text-sm"
                  placeholder="Personal note about this transaction..."
                  rows={2}
                />
                <button
                  onClick={() => {
                    localStorage.setItem(`kubercoin_tx_note_${txid}`, note);
                    alert('Note saved');
                  }}
                  className="mt-2 w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition text-sm"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Inputs and Outputs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Inputs */}
          <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Inputs ({transaction.inputs.length})
            </h2>
            <div className="space-y-3">
              {transaction.inputs.map((input, index) => (
                <div key={index} className="bg-purple-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-purple-300 text-sm">Input #{index}</div>
                    <div className="text-white font-semibold">
                      {input.amount.toFixed(8)} KC
                    </div>
                  </div>
                  <div className="text-white font-mono text-xs break-all mb-2">
                    {input.address}
                  </div>
                  <div className="text-purple-400 text-xs">
                    Sig: {input.signature}...
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Outputs */}
          <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Outputs ({transaction.outputs.length})
            </h2>
            <div className="space-y-3">
              {transaction.outputs.map((output, index) => (
                <div key={index} className="bg-purple-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-purple-300 text-sm">Output #{index}</div>
                    <div className="text-white font-semibold">
                      {output.amount.toFixed(8)} KC
                    </div>
                  </div>
                  <div className="text-white font-mono text-xs break-all">
                    {output.address}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Raw Transaction */}
        <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Raw Transaction</h2>
            <button
              onClick={() => copyToClipboard(transaction.hex)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition text-sm"
            >
              📋 Copy Hex
            </button>
          </div>
          <div className="bg-purple-900/50 rounded-lg p-4 overflow-x-auto">
            <code className="text-purple-200 text-xs font-mono break-all">
              {transaction.hex}
            </code>
          </div>
        </div>

        {/* RBF Modal */}
        {showRBF && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-purple-900 border border-purple-600 rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-white mb-4">Replace-By-Fee</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-purple-200 mb-2">New Fee (KC)</label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="0.0002"
                  />
                  <div className="text-sm text-purple-300 mt-1">
                    Current fee: {transaction.fee.toFixed(8)} KC
                  </div>
                </div>

                <div className="p-3 bg-yellow-500/20 border border-yellow-500 rounded text-sm text-yellow-200">
                  <p>⚠️ New fee must be higher than the original. Your transaction will be re-broadcast with a higher priority.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRBF(false)}
                    className="flex-1 px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRBF}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
                  >
                    Replace
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CPFP Modal */}
        {showCPFP && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-purple-900 border border-purple-600 rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-white mb-4">Child-Pays-For-Parent</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-purple-200 mb-2">Child Transaction Fee (KC)</label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="0.0003"
                  />
                </div>

                <div className="p-3 bg-blue-500/20 border border-blue-500 rounded text-sm text-blue-200">
                  <p>💡 A new transaction will be created spending one of the outputs. The combined fee will incentivize miners to confirm both transactions.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCPFP(false)}
                    className="flex-1 px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCPFP}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
