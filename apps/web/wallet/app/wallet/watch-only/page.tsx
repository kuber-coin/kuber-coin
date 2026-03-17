'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import walletService, { WalletInfo } from '@/services/wallet';

export default function WatchOnlyPage() {
  const [watchOnlyWallets, setWatchOnlyWallets] = useState<WalletInfo[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [xpub, setXpub] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWatchOnlyWallets();
  }, []);

  const loadWatchOnlyWallets = async () => {
    const wallets = walletService.getWatchOnlyWallets();
    setWatchOnlyWallets(wallets);
    
    // Update balances for all watch-only wallets
    for (const wallet of wallets) {
      await walletService.updateWalletBalance(wallet.address);
    }
    
    // Reload after balance updates
    setWatchOnlyWallets(walletService.getWatchOnlyWallets());
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const wallet = walletService.importWatchOnlyWallet(
        address.trim(),
        label.trim() || 'Watch-Only Wallet',
        xpub.trim() || undefined
      );

      // Update balance immediately
      await walletService.updateWalletBalance(wallet.address);

      setSuccess('Watch-only wallet imported successfully!');
      setAddress('');
      setLabel('');
      setXpub('');
      setShowImportModal(false);
      loadWatchOnlyWallets();
    } catch (err: any) {
      setError(err.message || 'Failed to import watch-only wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (address: string) => {
    if (confirm('Are you sure you want to remove this watch-only wallet?')) {
      try {
        walletService.deleteWallet(address);
        setSuccess('Watch-only wallet removed');
        loadWatchOnlyWallets();
      } catch (err: any) {
        setError(err.message || 'Failed to remove wallet');
      }
    }
  };

  const handleRefreshBalance = async (address: string) => {
    try {
      await walletService.updateWalletBalance(address);
      loadWatchOnlyWallets();
      setSuccess('Balance updated');
    } catch (err: any) {
      setError('Failed to update balance');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/wallet"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-bold text-white">👁️ Watch-Only Wallets</h1>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
          >
            + Import Address
          </button>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-semibold text-white mb-1">What are Watch-Only Wallets?</h3>
              <p className="text-blue-200 text-sm">
                Watch-only wallets allow you to monitor addresses without importing private keys.
                You can track balances and transactions, but cannot send funds from these addresses.
                Perfect for monitoring cold storage, hardware wallets, or third-party addresses.
              </p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-white">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-500/20 border border-green-500 rounded-lg text-white">
            {success}
          </div>
        )}

        {/* Watch-Only Wallets List */}
        {watchOnlyWallets.length === 0 ? (
          <div className="text-center py-12 bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg">
            <span className="text-6xl mb-4 block">👁️</span>
            <h2 className="text-2xl font-bold text-white mb-2">No Watch-Only Wallets</h2>
            <p className="text-purple-200 mb-4">
              Import an address to start monitoring without importing private keys
            </p>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
            >
              Import First Address
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {watchOnlyWallets.map((wallet) => (
              <div
                key={wallet.address}
                className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">👁️</span>
                      <h3 className="text-xl font-semibold text-white">{wallet.label}</h3>
                    </div>
                    <p className="text-sm text-purple-300 font-mono break-all">
                      {wallet.address}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-600/30 border border-blue-500 rounded text-blue-200 text-xs">
                    Watch-Only
                  </span>
                </div>

                {/* Balance */}
                <div className="mb-4 p-4 bg-purple-900/50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-300">Balance:</span>
                    <span className="text-2xl font-bold text-white">
                      {wallet.balance.toFixed(8)} KC
                    </span>
                  </div>
                  {wallet.unconfirmedBalance > 0 && (
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="text-purple-400">Unconfirmed:</span>
                      <span className="text-yellow-400">
                        +{wallet.unconfirmedBalance.toFixed(8)} KC
                      </span>
                    </div>
                  )}
                </div>

                {/* XPub Info */}
                {wallet.xpub && (
                  <div className="mb-4 text-sm">
                    <div className="text-purple-300 mb-1">Extended Public Key:</div>
                    <div className="p-2 bg-purple-900/50 rounded font-mono text-xs break-all text-purple-200">
                      {wallet.xpub.substring(0, 50)}...
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRefreshBalance(wallet.address)}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
                  >
                    🔄 Refresh
                  </button>
                  <button
                    onClick={() => handleRemove(wallet.address)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                  >
                    🗑️
                  </button>
                </div>

                {/* Info */}
                <div className="mt-4 text-xs text-purple-400">
                  Added {new Date(wallet.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-purple-900 border border-purple-600 rounded-lg p-8 max-w-2xl w-full">
              <h2 className="text-2xl font-bold text-white mb-6">Import Watch-Only Address</h2>

              <form onSubmit={handleImport} className="space-y-4">
                <div>
                  <label className="block text-purple-200 mb-2">
                    Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white font-mono text-sm"
                    placeholder="Enter wallet address to monitor"
                  />
                  <p className="text-xs text-purple-400 mt-1">
                    The address you want to monitor without importing private keys
                  </p>
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Label (Optional)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="e.g., Cold Storage, Hardware Wallet"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">
                    Extended Public Key (Optional)
                  </label>
                  <textarea
                    value={xpub}
                    onChange={(e) => setXpub(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white font-mono text-sm"
                    rows={3}
                    placeholder="xpub... (for HD wallet monitoring)"
                  />
                  <p className="text-xs text-purple-400 mt-1">
                    For monitoring hierarchical deterministic wallets (optional)
                  </p>
                </div>

                <div className="p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span>⚠️</span>
                    <div className="text-sm text-yellow-200">
                      <p className="font-semibold mb-1">Important:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>You will NOT be able to send funds from this address</li>
                        <li>Only balance and transaction monitoring will be available</li>
                        <li>Never share your extended public key publicly</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setAddress('');
                      setLabel('');
                      setXpub('');
                    }}
                    className="flex-1 px-6 py-3 bg-purple-700 hover:bg-purple-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Importing...' : 'Import Address'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-purple-800/30 border border-purple-700 rounded-lg">
            <div className="text-2xl mb-2">🔒</div>
            <h3 className="font-semibold text-white mb-1">Secure Monitoring</h3>
            <p className="text-sm text-purple-300">
              Monitor addresses without exposing private keys
            </p>
          </div>

          <div className="p-4 bg-purple-800/30 border border-purple-700 rounded-lg">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-semibold text-white mb-1">Balance Tracking</h3>
            <p className="text-sm text-purple-300">
              Real-time balance updates for all monitored addresses
            </p>
          </div>

          <div className="p-4 bg-purple-800/30 border border-purple-700 rounded-lg">
            <div className="text-2xl mb-2">🔐</div>
            <h3 className="font-semibold text-white mb-1">Cold Storage</h3>
            <p className="text-sm text-purple-300">
              Perfect for monitoring cold storage and hardware wallets
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
