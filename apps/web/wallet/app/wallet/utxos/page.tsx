'use client';

import { useState, useEffect } from 'react';
import walletService, { WalletInfo } from '@/services/wallet';
import api from '../../../src/services/api';

interface UTXO {
  txid: string;
  vout: number;
  address: string;
  amount: number;
  confirmations: number;
  scriptPubKey: string;
  spendable: boolean;
  frozen?: boolean;
  label?: string;
}

export default function UTXOsPage() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletInfo | null>(null);
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [filteredUtxos, setFilteredUtxos] = useState<UTXO[]>([]);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'spendable' | 'frozen'>('all');
  const [sortBy, setSortBy] = useState<'amount' | 'confirmations' | 'age'>('amount');
  const [showConsolidateDialog, setShowConsolidateDialog] = useState(false);
  const [consolidateAddress, setConsolidateAddress] = useState('');

  useEffect(() => {
    loadWallets();
  }, []);

  useEffect(() => {
    if (activeWallet) {
      loadUTXOs();
    }
  }, [activeWallet]);

  useEffect(() => {
    applyFilters();
  }, [utxos, filter, sortBy]);

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  const loadWallets = () => {
    const allWallets = walletService.getWallets();
    setWallets(allWallets);
    
    const active = walletService.getActiveWallet();
    if (active) {
      setActiveWallet(active);
    } else if (allWallets.length > 0) {
      setActiveWallet(allWallets[0]);
      walletService.setActiveWallet(allWallets[0].address);
    }
  };

  const loadUTXOs = async () => {
    if (!activeWallet) return;

    setLoading(true);
    setError(null);

    try {
      const history = await withTimeout(walletService.getUtxos(activeWallet.address, 0), 5000, []);

      const frozenKey = `kubercoin_frozen_utxos_${activeWallet.address}`;
      const frozenData = localStorage.getItem(frozenKey);
      const frozenSet = frozenData ? new Set<string>(JSON.parse(frozenData)) : new Set<string>();

      const labelsKey = `kubercoin_utxo_labels_${activeWallet.address}`;
      const labelsData = localStorage.getItem(labelsKey);
      const labels = labelsData ? JSON.parse(labelsData) : {};

      const utxoList: UTXO[] = history.map(utxo => ({
        ...utxo,
        frozen: frozenSet.has(`${utxo.txid}:${utxo.vout}`),
        label: labels[`${utxo.txid}:${utxo.vout}`] || undefined,
      }));

      setUtxos(utxoList);
    } catch (err: any) {
      setUtxos([]);
      setError(err.message || 'Failed to load UTXOs');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...utxos];

    if (filter === 'spendable') {
      filtered = filtered.filter(u => u.spendable && !u.frozen);
    } else if (filter === 'frozen') {
      filtered = filtered.filter(u => u.frozen);
    }

    if (sortBy === 'amount') {
      filtered.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === 'confirmations') {
      filtered.sort((a, b) => b.confirmations - a.confirmations);
    } else if (sortBy === 'age') {
      filtered.sort((a, b) => a.confirmations - b.confirmations);
    }

    setFilteredUtxos(filtered);
  };

  const toggleUtxoSelection = (txid: string, vout: number) => {
    const key = `${txid}:${vout}`;
    const newSelected = new Set(selectedUtxos);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedUtxos(newSelected);
  };

  const toggleFreeze = (txid: string, vout: number) => {
    if (!activeWallet) return;

    const key = `${txid}:${vout}`;
    const frozenKey = `kubercoin_frozen_utxos_${activeWallet.address}`;
    const frozenData = localStorage.getItem(frozenKey);
    const frozenSet = frozenData ? new Set<string>(JSON.parse(frozenData)) : new Set<string>();

    if (frozenSet.has(key)) {
      frozenSet.delete(key);
      setSuccess('UTXO unfrozen');
    } else {
      frozenSet.add(key);
      setSuccess('UTXO frozen');
    }

    localStorage.setItem(frozenKey, JSON.stringify(Array.from(frozenSet)));
    setTimeout(() => setSuccess(null), 2000);
    loadUTXOs();
  };

  const handleLabelUtxo = (txid: string, vout: number) => {
    if (!activeWallet) return;

    const label = prompt('Enter label for this UTXO:');
    if (!label) return;

    const key = `${txid}:${vout}`;
    const labelsKey = `kubercoin_utxo_labels_${activeWallet.address}`;
    const labelsData = localStorage.getItem(labelsKey);
    const labels = labelsData ? JSON.parse(labelsData) : {};

    labels[key] = label;
    localStorage.setItem(labelsKey, JSON.stringify(labels));
    
    setSuccess('Label added');
    setTimeout(() => setSuccess(null), 2000);
    loadUTXOs();
  };

  const handleConsolidate = async () => {
    if (!activeWallet || selectedUtxos.size === 0) {
      setError('Please select UTXOs to consolidate');
      return;
    }

    if (!consolidateAddress) {
      setError('Please enter destination address');
      return;
    }

    try {
      const selected = Array.from(selectedUtxos).map((key) => {
        const [txid, vout] = key.split(':');
        const utxo = utxos.find(u => u.txid === txid && u.vout.toString() === vout);
        if (!utxo) {
          throw new Error('Selected UTXO not found');
        }
        return utxo;
      });

      const txid = await walletService.consolidateUtxos(
        activeWallet.address,
        selected,
        consolidateAddress
      );

      setShowConsolidateDialog(false);
      setSuccess(`Consolidation transaction created: ${txid}`);
      setTimeout(() => setSuccess(null), 3000);
      setSelectedUtxos(new Set());
      await loadUTXOs();
    } catch (err: any) {
      setError(err.message || 'Failed to consolidate UTXOs');
    }
  };

  const calculatePrivacyScore = (utxo: UTXO): number => {
    let score = 100;
    if (utxo.amount > 100) score -= 20;
    else if (utxo.amount > 10) score -= 10;
    if (utxo.confirmations < 6) score -= 30;
    else if (utxo.confirmations < 100) score -= 10;
    if (Number.isInteger(utxo.amount)) score -= 15;
    return Math.max(0, score);
  };

  const getPrivacyColor = (score: number): string => {
    if (score >= 80) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const selectedAmount = Array.from(selectedUtxos).reduce((sum, key) => {
    const [txid, vout] = key.split(':');
    const utxo = utxos.find(u => u.txid === txid && u.vout.toString() === vout);
    return sum + (utxo?.amount || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Coin Control & UTXO Management
          </h1>
          <p className="text-gray-400">Manage unspent transaction outputs for optimal privacy and efficiency</p>
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1A1A2E] rounded-lg p-4 border border-purple-500/20">
            <p className="text-sm text-gray-400 mb-1">Total UTXOs</p>
            <p className="text-2xl font-bold text-purple-400">{utxos.length}</p>
          </div>
          <div className="bg-[#1A1A2E] rounded-lg p-4 border border-green-500/20">
            <p className="text-sm text-gray-400 mb-1">Spendable</p>
            <p className="text-2xl font-bold text-green-400">
              {utxos.filter(u => u.spendable && !u.frozen).length}
            </p>
          </div>
          <div className="bg-[#1A1A2E] rounded-lg p-4 border border-blue-500/20">
            <p className="text-sm text-gray-400 mb-1">Frozen</p>
            <p className="text-2xl font-bold text-blue-400">
              {utxos.filter(u => u.frozen).length}
            </p>
          </div>
          <div className="bg-[#1A1A2E] rounded-lg p-4 border border-yellow-500/20">
            <p className="text-sm text-gray-400 mb-1">Selected</p>
            <p className="text-2xl font-bold text-yellow-400">{selectedUtxos.size}</p>
          </div>
        </div>

        <div className="bg-[#1A1A2E] rounded-lg p-4 border border-purple-500/20 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Filter</label>
              <select
                data-testid="utxo-filter-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="all">All UTXOs</option>
                <option value="spendable">Spendable Only</option>
                <option value="frozen">Frozen Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Sort By</label>
              <select
                data-testid="utxo-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="amount">Amount (High to Low)</option>
                <option value="confirmations">Confirmations</option>
                <option value="age">Age (Newest First)</option>
              </select>
            </div>

            <div className="ml-auto flex gap-2">
              <button
                data-testid="clear-selection-button"
                onClick={() => setSelectedUtxos(new Set())}
                disabled={selectedUtxos.size === 0}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Clear Selection
              </button>
              <button
                data-testid="consolidate-utxos-button"
                onClick={() => {
                  setConsolidateAddress(activeWallet?.address || '');
                  setShowConsolidateDialog(true);
                }}
                disabled={selectedUtxos.size < 2}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Consolidate ({selectedUtxos.size})
              </button>
            </div>
          </div>

          {selectedUtxos.size > 0 && (
            <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/50 rounded-lg">
              <p className="text-purple-300">
                <strong className="text-purple-400">Selected Amount:</strong> {selectedAmount.toFixed(8)} KBC
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-[#1A1A2E] rounded-lg p-12 border border-purple-500/20 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading UTXOs...</p>
          </div>
        ) : filteredUtxos.length === 0 ? (
          <div className="bg-[#1A1A2E] rounded-lg p-12 border border-purple-500/20 text-center">
            <p className="text-gray-400">No UTXOs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUtxos.map((utxo) => {
              const key = `${utxo.txid}:${utxo.vout}`;
              const isSelected = selectedUtxos.has(key);
              const privacyScore = calculatePrivacyScore(utxo);

              return (
                <div
                  key={key}
                  className={`bg-[#1A1A2E] rounded-lg p-4 border transition ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-purple-500/20 hover:border-purple-500/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      data-testid="utxo-checkbox"
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleUtxoSelection(utxo.txid, utxo.vout)}
                      disabled={utxo.frozen || !utxo.spendable}
                      className="mt-1 w-5 h-5 accent-purple-500"
                    />

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-white">
                            {utxo.amount.toFixed(8)} KBC
                          </span>
                          {utxo.frozen && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                              FROZEN
                            </span>
                          )}
                          {utxo.label && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                              {utxo.label}
                            </span>
                          )}
                        </div>
                        <code className="text-xs text-gray-400 break-all">
                          {utxo.txid.slice(0, 16)}...{utxo.txid.slice(-16)} : {utxo.vout}
                        </code>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400">Confirmations</p>
                        <p className="text-sm text-white font-semibold">{utxo.confirmations}</p>
                        <p className="text-xs text-gray-400 mt-1">Privacy Score</p>
                        <p className={`text-sm font-semibold ${getPrivacyColor(privacyScore)}`}>
                          {privacyScore}/100
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          data-testid="freeze-utxo-button"
                          onClick={() => toggleFreeze(utxo.txid, utxo.vout)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition ${
                            utxo.frozen
                              ? 'bg-blue-500/20 border border-blue-500 text-blue-400 hover:bg-blue-500/30'
                              : 'bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {utxo.frozen ? '🔒 Unfreeze' : '🔓 Freeze'}
                        </button>
                        <button
                          data-testid="label-utxo-button"
                          onClick={() => handleLabelUtxo(utxo.txid, utxo.vout)}
                          className="px-3 py-1 bg-purple-500/20 border border-purple-500 text-purple-400 rounded text-xs font-semibold hover:bg-purple-500/30 transition"
                        >
                          🏷️ {utxo.label ? 'Edit' : 'Add'} Label
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {utxos.length > 0 && (
          <div className="mt-6 bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-bold mb-4">Privacy Analysis</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Average Privacy Score</p>
                <p className="text-2xl font-bold text-purple-400">
                  {(utxos.reduce((sum, u) => sum + calculatePrivacyScore(u), 0) / utxos.length).toFixed(0)}/100
                </p>
              </div>

              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Dust UTXOs (&lt; 0.001 KBC)</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {utxos.filter(u => u.amount < 0.001).length}
                </p>
              </div>

              <div className="p-4 bg-[#0F0F23] rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Mature UTXOs (100+ confirms)</p>
                <p className="text-2xl font-bold text-green-400">
                  {utxos.filter(u => u.confirmations >= 100).length}
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
              <h3 className="font-semibold text-blue-400 mb-2">Recommendations</h3>
              <ul className="text-sm text-blue-300 space-y-1">
                {utxos.filter(u => u.amount < 0.001).length > 5 && (
                  <li>• Consider consolidating {utxos.filter(u => u.amount < 0.001).length} dust UTXOs</li>
                )}
                {utxos.filter(u => calculatePrivacyScore(u) < 50).length > 0 && (
                  <li>• {utxos.filter(u => calculatePrivacyScore(u) < 50).length} UTXOs have low privacy scores</li>
                )}
                {utxos.filter(u => u.confirmations < 6).length > 0 && (
                  <li>• Wait for more confirmations on {utxos.filter(u => u.confirmations < 6).length} immature UTXOs</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {showConsolidateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1A1A2E] rounded-lg p-6 max-w-md w-full border border-purple-500/20">
              <h2 className="text-2xl font-bold mb-4">Consolidate UTXOs</h2>

              <div className="mb-6">
                <div className="p-4 bg-purple-500/10 border border-purple-500/50 rounded-lg mb-4">
                  <p className="text-sm text-purple-300">
                    <strong className="text-purple-400">Selected UTXOs:</strong> {selectedUtxos.size}
                  </p>
                  <p className="text-sm text-purple-300">
                    <strong className="text-purple-400">Total Amount:</strong> {selectedAmount.toFixed(8)} KBC
                  </p>
                  <p className="text-sm text-purple-300 mt-2">
                    <strong className="text-purple-400">Estimated Fee:</strong> ~{(selectedUtxos.size * 0.00001).toFixed(8)} KBC
                  </p>
                </div>

                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Destination Address
                </label>
                <input
                  type="text"
                  value={consolidateAddress}
                  onChange={(e) => setConsolidateAddress(e.target.value)}
                  placeholder="Enter destination address"
                  className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConsolidateDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConsolidate}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 transition"
                >
                  Consolidate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
