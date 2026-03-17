'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import walletService from '@/services/wallet';

const AnalyticsCharts = dynamic(() => import('./AnalyticsCharts'), { ssr: false, loading: () => null });

interface BalancePoint {
  date: string;
  balance: number;
  timestamp: number;
}

interface TransactionVolume {
  date: string;
  incoming: number;
  outgoing: number;
  net: number;
}

interface SpendingCategory {
  name: string;
  value: number;
  count: number;
}

interface BiggestTransaction {
  txid: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  timestamp: number;
  address: string;
}

export default function AnalyticsPage() {
  const [activeWallet, setActiveWallet] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');
  const [loading, setLoading] = useState(true);
  const [balanceHistory, setBalanceHistory] = useState<BalancePoint[]>([]);
  const [volumeData, setVolumeData] = useState<TransactionVolume[]>([]);
  const [spendingData, setSpendingData] = useState<SpendingCategory[]>([]);
  const [biggestTransactions, setBiggestTransactions] = useState<BiggestTransaction[]>([]);
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalSent: 0,
    netChange: 0,
    transactionCount: 0,
    averageTransaction: 0,
    largestTransaction: 0,
  });

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) {
        setLoading(false);
        return;
      }

      setActiveWallet(wallet);

      // Update wallet balance
      await walletService.updateWalletBalance(wallet.address);

      // Get transaction history
      const transactions = await walletService.getTransactionHistory(wallet.address, 1000);

      // Calculate time range
      const now = Date.now();
      const timeRanges: Record<string, number> = {
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
        '1y': 365 * 24 * 60 * 60 * 1000,
        'all': Infinity,
      };
      const cutoff = now - timeRanges[timeRange];

      // Filter transactions by time range
      const filteredTxs = transactions.filter((tx) => (tx.timestamp || 0) >= cutoff);

      // Generate balance history
      const balanceHist = generateBalanceHistory(filteredTxs, wallet.balance, timeRange);
      setBalanceHistory(balanceHist);

      // Generate volume data
      const volumeData = generateVolumeData(filteredTxs, timeRange);
      setVolumeData(volumeData);

      // Generate spending analysis
      const spendingData = generateSpendingData(filteredTxs);
      setSpendingData(spendingData);

      // Find biggest transactions
      const biggest = filteredTxs
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 5)
        .map((tx) => {
          const type: 'incoming' | 'outgoing' = tx.type === 'sent' ? 'outgoing' : 'incoming';
          return {
            txid: tx.txid,
            amount: Math.abs(tx.amount),
            type,
            timestamp: tx.timestamp || 0,
            address: tx.address || 'Unknown',
          };
        });
      setBiggestTransactions(biggest);

      // Calculate stats
      const totalReceived = filteredTxs
        .filter((tx) => tx.type === 'received')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const totalSent = filteredTxs
        .filter((tx) => tx.type === 'sent')
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const netChange = totalReceived - totalSent;
      const transactionCount = filteredTxs.length;
      const totalMoved = filteredTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const averageTransaction = transactionCount > 0 ? totalMoved / transactionCount : 0;
      const largestTransaction = filteredTxs.length > 0
        ? Math.max(...filteredTxs.map((tx) => Math.abs(tx.amount)))
        : 0;

      setStats({
        totalReceived,
        totalSent,
        netChange,
        transactionCount,
        averageTransaction,
        largestTransaction,
      });
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateBalanceHistory = (transactions: any[], currentBalance: number, range: string): BalancePoint[] => {
    const now = Date.now();
    const points: BalancePoint[] = [];

    // Determine interval based on range
    const intervals: Record<string, number> = {
      '7d': 24 * 60 * 60 * 1000, // 1 day
      '30d': 24 * 60 * 60 * 1000, // 1 day
      '90d': 7 * 24 * 60 * 60 * 1000, // 1 week
      '1y': 30 * 24 * 60 * 60 * 1000, // 1 month
      'all': 30 * 24 * 60 * 60 * 1000, // 1 month
    };
    const interval = intervals[range];

    // Sort transactions by timestamp ascending
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

    // Calculate balance at each interval
    let balance = currentBalance;
    for (let i = sortedTxs.length - 1; i >= 0; i--) {
      balance -= sortedTxs[i].type === 'received' ? sortedTxs[i].amount : -sortedTxs[i].amount;
    }

    const startTime = sortedTxs.length > 0 ? sortedTxs[0].timestamp : now - intervals[range === 'all' ? '1y' : range];
    let currentTime = startTime;
    let txIndex = 0;

    while (currentTime <= now) {
      // Apply transactions up to this point
      while (txIndex < sortedTxs.length && sortedTxs[txIndex].timestamp <= currentTime) {
        balance += sortedTxs[txIndex].type === 'received' 
          ? sortedTxs[txIndex].amount 
          : -sortedTxs[txIndex].amount;
        txIndex++;
      }

      points.push({
        date: new Date(currentTime).toLocaleDateString(),
        balance: parseFloat(balance.toFixed(8)),
        timestamp: currentTime,
      });

      currentTime += interval;
    }

    return points;
  };

  const generateVolumeData = (transactions: any[], range: string): TransactionVolume[] => {
    const groups: { [key: string]: { incoming: number; outgoing: number } } = {};

    transactions.forEach((tx) => {
      const date = new Date(tx.timestamp).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = { incoming: 0, outgoing: 0 };
      }

      if (tx.type === 'received') {
        groups[date].incoming += tx.amount;
      } else {
        groups[date].outgoing += Math.abs(tx.amount);
      }
    });

    return Object.entries(groups)
      .map(([date, data]) => ({
        date,
        incoming: parseFloat(data.incoming.toFixed(8)),
        outgoing: parseFloat(data.outgoing.toFixed(8)),
        net: parseFloat((data.incoming - data.outgoing).toFixed(8)),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const generateSpendingData = (transactions: any[]): SpendingCategory[] => {
    const categories: { [key: string]: { value: number; count: number } } = {};

    transactions
      .filter((tx) => tx.type === 'sent')
      .forEach((tx) => {
        // Categorize by address (in real app, could use address book labels)
        const category = tx.address.substring(0, 8) + '...';
        if (!categories[category]) {
          categories[category] = { value: 0, count: 0 };
        }
        categories[category].value += Math.abs(tx.amount);
        categories[category].count++;
      });

    return Object.entries(categories)
      .map(([name, data]) => ({
        name,
        value: parseFloat(data.value.toFixed(8)),
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // Top 6 recipients
  };

  if (!activeWallet) {
    return (
      <div className="min-h-screen bg-[#0F0F23] text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#1A1A2E] rounded-lg p-12 border border-purple-500/20 text-center">
            <svg className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-300 mb-2">No Active Wallet</h2>
            <p className="text-gray-400">Please create or select a wallet to view analytics</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
              Portfolio Analytics
            </h1>
            <p className="text-gray-400">{activeWallet.label}</p>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-2">
            {(['7d', '30d', '90d', '1y', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg transition ${
                  timeRange === range
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                }`}
              >
                {range === 'all' ? 'All Time' : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading analytics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Total Received</h3>
                <p className="text-3xl font-bold text-green-400">
                  {stats.totalReceived.toFixed(8)} KBC
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {stats.transactionCount} transactions
                </p>
              </div>

              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Total Sent</h3>
                <p className="text-3xl font-bold text-red-400">
                  {stats.totalSent.toFixed(8)} KBC
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Outgoing payments
                </p>
              </div>

              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Net Change</h3>
                <p className={`text-3xl font-bold ${stats.netChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.netChange >= 0 ? '+' : ''}{stats.netChange.toFixed(8)} KBC
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  In selected period
                </p>
              </div>

              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Current Balance</h3>
                <p className="text-3xl font-bold text-purple-400">
                  {activeWallet.balance.toFixed(8)} KBC
                </p>
                {activeWallet.unconfirmedBalance > 0 && (
                  <p className="text-sm text-yellow-500 mt-1">
                    +{activeWallet.unconfirmedBalance.toFixed(8)} unconfirmed
                  </p>
                )}
              </div>

              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Average Transaction</h3>
                <p className="text-3xl font-bold text-blue-400">
                  {stats.averageTransaction.toFixed(8)} KBC
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Per transaction
                </p>
              </div>

              <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Largest Transaction</h3>
                <p className="text-3xl font-bold text-orange-400">
                  {stats.largestTransaction.toFixed(8)} KBC
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Single transaction
                </p>
              </div>
            </div>

            <AnalyticsCharts
              balanceHistory={balanceHistory}
              volumeData={volumeData}
              spendingData={spendingData}
              biggestTransactions={biggestTransactions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
