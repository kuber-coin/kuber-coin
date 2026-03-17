'use client';

import { useState, useEffect } from 'react';
import walletService from '@/services/wallet';

interface FaucetRequest {
  id: string;
  address: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  txid?: string;
  timestamp: number;
  message?: string;
}

interface FaucetInfo {
  available: boolean;
  balance: number;
  maxAmount: number;
  cooldownSeconds: number;
  requestsRemaining: number;
  dailyLimit: number;
}

export default function FaucetPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [amount, setAmount] = useState<string>('1.0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [faucetInfo, setFaucetInfo] = useState<FaucetInfo | null>(null);
  const [requestHistory, setRequestHistory] = useState<FaucetRequest[]>([]);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isTestnet, setIsTestnet] = useState(false);

  const faucetUrl = process.env.NEXT_PUBLIC_FAUCET_URL || '';
  const safeFaucetInfo: FaucetInfo = faucetInfo || {
    available: false,
    balance: 0,
    maxAmount: 0,
    cooldownSeconds: 0,
    requestsRemaining: 0,
    dailyLimit: 0,
  };

  useEffect(() => {
    loadWallets();
    loadFaucetInfo();
    loadRequestHistory();
  }, []);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  const loadWallets = () => {
    try {
      const allWallets = walletService.getWallets();
      setWallets(allWallets);
      if (allWallets.length > 0 && !selectedAddress) {
        const active = walletService.getActiveWallet();
        setSelectedAddress(active?.address || allWallets[0].address);
      }
    } catch (err) {
      console.error('Failed to load wallets:', err);
    }
  };

  const loadFaucetInfo = async () => {
    if (!faucetUrl) {
      setFaucetInfo(null);
      setIsTestnet(false);
      return;
    }

    try {
      const response = await fetch(`${faucetUrl}/info`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const info: FaucetInfo = {
        available: !!data.available,
        balance: Number(data.balance || 0),
        maxAmount: Number(data.maxAmount || 0),
        cooldownSeconds: Number(data.cooldownSeconds || 0),
        requestsRemaining: Number(data.requestsRemaining || 0),
        dailyLimit: Number(data.dailyLimit || 0),
      };
      setFaucetInfo(info);
      setIsTestnet(Boolean(data.isTestnet));
    } catch (err) {
      console.error('Failed to load faucet info:', err);
      setFaucetInfo(null);
      setIsTestnet(false);
    }
  };

  const loadRequestHistory = () => {
    try {
      const stored = localStorage.getItem('kubercoin_faucet_history');
      if (stored) {
        const history = JSON.parse(stored);
        setRequestHistory(history);
        
        // Check if still in cooldown
        const lastRequest = history[0];
        if (lastRequest && lastRequest.status === 'completed') {
          const elapsed = Date.now() - lastRequest.timestamp;
          const cooldown = safeFaucetInfo.cooldownSeconds * 1000;
          if (elapsed < cooldown) {
            setCooldownRemaining(Math.ceil((cooldown - elapsed) / 1000));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load request history:', err);
    }
  };

  const saveRequestHistory = (history: FaucetRequest[]) => {
    try {
      // Keep only last 20 requests
      const limited = history.slice(0, 20);
      localStorage.setItem('kubercoin_faucet_history', JSON.stringify(limited));
      setRequestHistory(limited);
    } catch (err) {
      console.error('Failed to save request history:', err);
    }
  };

  const validateRequest = (): string | null => {
    if (!selectedAddress) {
      return 'Please select a wallet address';
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return 'Please enter a valid amount';
    }

    if (amountNum > safeFaucetInfo.maxAmount) {
      return `Amount cannot exceed ${safeFaucetInfo.maxAmount} KBC`;
    }

    if (!safeFaucetInfo.available) {
      return 'Faucet is currently unavailable';
    }

    if (safeFaucetInfo.requestsRemaining <= 0) {
      return 'Daily request limit reached. Please try again tomorrow.';
    }

    if (cooldownRemaining > 0) {
      const minutes = Math.floor(cooldownRemaining / 60);
      const seconds = cooldownRemaining % 60;
      return `Cooldown active. Please wait ${minutes}m ${seconds}s`;
    }

    if (!isTestnet) {
      return 'Faucet is only available on testnet';
    }

    return null;
  };

  const handleRequestFunds = async () => {
    const validationError = validateRequest();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const amountNum = parseFloat(amount);
      if (!faucetUrl) {
        throw new Error('Faucet API not configured');
      }

      const response = await fetch(`${faucetUrl}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: selectedAddress, amount: amountNum }),
      });
      if (!response.ok) {
        throw new Error(`Faucet request failed: HTTP ${response.status}`);
      }
      const data = await response.json();

      const newRequest: FaucetRequest = {
        id: `req_${Date.now()}`,
        address: selectedAddress,
        amount: amountNum,
        status: data.status || 'completed',
        txid: data.txid,
        timestamp: Date.now(),
        message: data.message || 'Funds sent successfully',
      };

      const updatedHistory = [newRequest, ...requestHistory];
      saveRequestHistory(updatedHistory);

      // Update faucet info
      if (safeFaucetInfo.dailyLimit > 0) {
        setFaucetInfo({
          ...safeFaucetInfo,
          requestsRemaining: Math.max(0, safeFaucetInfo.requestsRemaining - 1),
        });
      }

      // Start cooldown
      setCooldownRemaining(safeFaucetInfo.cooldownSeconds);

      setSuccess(`Successfully requested ${amountNum} KBC! Transaction ID: ${newRequest.txid || 'pending'}`);
      setAmount('1.0');

      // Reload wallet balances after a delay
      setTimeout(() => {
        walletService.updateWalletBalance(selectedAddress);
        loadWallets();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to request funds from faucet');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const formatCooldown = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded">
            Completed
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded">
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded">
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Testnet Faucet
          </h1>
          <p className="text-gray-400">Request free testnet KBC to test the wallet</p>
        </div>

        {/* Testnet Warning */}
        {!isTestnet && (
          <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/50 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-orange-400">Mainnet Detected</h3>
                <div className="mt-2 text-sm text-orange-300">
                  The faucet is only available on testnet. Please connect to a testnet node.
                </div>
              </div>
            </div>
          </div>
        )}

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Request Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
              <h2 className="text-xl font-semibold mb-4">Request Funds</h2>

              <div className="space-y-4">
                {/* Wallet Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Receiving Wallet
                  </label>
                  <select
                    value={selectedAddress}
                    onChange={(e) => setSelectedAddress(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                  >
                    {wallets.length === 0 && (
                      <option value="">No wallets available</option>
                    )}
                    {wallets.map((wallet) => (
                      <option key={wallet.address} value={wallet.address}>
                        {wallet.label} - {wallet.address.substring(0, 20)}...
                      </option>
                    ))}
                  </select>
                  {wallets.length === 0 && (
                    <p className="mt-2 text-sm text-gray-400">
                      Please create a wallet first in the Manage section
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount (KBC)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                    step="0.1"
                    min="0.1"
                    max={safeFaucetInfo.maxAmount}
                    className="w-full px-4 py-2 bg-[#0F0F23] border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    placeholder="Enter amount"
                  />
                  <p className="mt-2 text-sm text-gray-400">
                    Maximum: {safeFaucetInfo.maxAmount} KBC per request
                  </p>
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAmount('1.0')}
                    disabled={loading}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50"
                  >
                    1 KBC
                  </button>
                  <button
                    onClick={() => setAmount('5.0')}
                    disabled={loading}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50"
                  >
                    5 KBC
                  </button>
                  <button
                    onClick={() => setAmount(safeFaucetInfo.maxAmount.toString())}
                    disabled={loading}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 disabled:opacity-50"
                  >
                    Max
                  </button>
                </div>

                {/* Cooldown Timer */}
                {cooldownRemaining > 0 && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-blue-400">Cooldown Active</h3>
                        <p className="text-sm text-blue-300 mt-1">
                          You can request funds again in:
                        </p>
                      </div>
                      <div className="text-2xl font-bold text-blue-400">
                        {formatCooldown(cooldownRemaining)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Request Button */}
                <button
                  onClick={handleRequestFunds}
                  disabled={loading || cooldownRemaining > 0 || !isTestnet || wallets.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loading ? 'Processing...' : 'Request Funds'}
                </button>
              </div>
            </div>

            {/* Request History */}
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
              <h2 className="text-xl font-semibold mb-4">Request History</h2>

              {requestHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <svg className="mx-auto h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2">No requests yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requestHistory.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 bg-[#0F0F23] rounded-lg border border-purple-500/10"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold text-green-400">
                              +{request.amount} KBC
                            </span>
                            {getStatusBadge(request.status)}
                          </div>
                          <p className="text-sm text-gray-400 mt-1">
                            {formatTimestamp(request.timestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Address:</span>
                          <span className="text-gray-300 font-mono">
                            {request.address.substring(0, 16)}...
                          </span>
                        </div>
                        {request.txid && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">TX ID:</span>
                            <span className="text-purple-400 font-mono">
                              {request.txid.substring(0, 16)}...
                            </span>
                          </div>
                        )}
                        {request.message && (
                          <p className="text-gray-400 mt-2">{request.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Faucet Info */}
          <div className="space-y-6">
            {/* Faucet Status */}
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
              <h2 className="text-lg font-semibold mb-4">Faucet Status</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    safeFaucetInfo.available
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {safeFaucetInfo.available ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Balance:</span>
                  <span className="text-white font-semibold">
                    {safeFaucetInfo.balance.toFixed(2)} KBC
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max per Request:</span>
                  <span className="text-white font-semibold">
                    {safeFaucetInfo.maxAmount} KBC
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Cooldown:</span>
                  <span className="text-white font-semibold">
                    {Math.floor(safeFaucetInfo.cooldownSeconds / 3600)}h
                  </span>
                </div>

                <div className="pt-4 border-t border-purple-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">Daily Requests:</span>
                    <span className="text-white font-semibold">
                      {safeFaucetInfo.requestsRemaining} / {safeFaucetInfo.dailyLimit}
                    </span>
                  </div>
                  <div className="w-full bg-[#0F0F23] rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${safeFaucetInfo.dailyLimit > 0 ? (safeFaucetInfo.requestsRemaining / safeFaucetInfo.dailyLimit) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* How it Works */}
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
              <h2 className="text-lg font-semibold mb-4">How it Works</h2>
              
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 font-semibold">
                    1
                  </div>
                  <p>Select your wallet and enter the amount you need</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 font-semibold">
                    2
                  </div>
                  <p>Click &ldquo;Request Funds&rdquo; to submit your request</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 font-semibold">
                    3
                  </div>
                  <p>Wait for the transaction to be processed</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 font-semibold">
                    4
                  </div>
                  <p>Funds will appear in your wallet after confirmation</p>
                </div>
              </div>
            </div>

            {/* Limitations */}
            <div className="bg-[#1A1A2E] rounded-lg p-6 border border-yellow-500/20">
              <h2 className="text-lg font-semibold mb-4 text-yellow-400">Limitations</h2>
              
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>Maximum {safeFaucetInfo.maxAmount} KBC per request</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>{safeFaucetInfo.dailyLimit} requests per day</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>{Math.floor(safeFaucetInfo.cooldownSeconds / 3600)} hour cooldown between requests</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>Testnet only - not available on mainnet</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
