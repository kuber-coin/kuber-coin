'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import api from '../../../src/services/api';

const NetworkCharts = dynamic(() => import('./NetworkCharts'), { ssr: false, loading: () => null });

interface NetworkStats {
  hashrate: number;
  difficulty: number;
  blockHeight: number;
  blockTime: number;
  mempoolSize: number;
  mempoolBytes: number;
  connections: number;
  version: string;
  protocolVersion: number;
}

interface ChartData {
  time: string;
  value: number;
}

export default function NetworkPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [hashrateHistory, setHashrateHistory] = useState<ChartData[]>([]);
  const [difficultyHistory, setDifficultyHistory] = useState<ChartData[]>([]);
  const [blockTimeData, setBlockTimeData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNetworkStats = async () => {
    try {
      // Get blockchain info
      const blockchainInfo = await api.getBlockchainInfo();
      
      // Get network info
      const networkInfo = await api.getNetworkInfo();
      
      // Get mempool info
      const mempoolInfo = await api.getMempoolInfo();

      // Calculate approximate hashrate (blocks/sec * difficulty)
      const hashrate = blockchainInfo.difficulty * Math.pow(2, 32) / 600; // Estimated hashrate in H/s

      const networkStats: NetworkStats = {
        hashrate: hashrate,
        difficulty: blockchainInfo.difficulty,
        blockHeight: blockchainInfo.blocks,
        blockTime: 600, // 10 minutes in seconds
        mempoolSize: mempoolInfo.size,
        mempoolBytes: mempoolInfo.bytes,
        connections: networkInfo.connections,
        version: networkInfo.subversion || 'Unknown',
        protocolVersion: networkInfo.protocolversion,
      };

      setStats(networkStats);

      const timeLabel = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const appendHistory = (
        current: ChartData[],
        value: number,
        maxPoints: number = 24
      ): ChartData[] => {
        const next = [...current, { time: timeLabel, value }];
        return next.slice(-maxPoints);
      };

      setHashrateHistory((prev) => appendHistory(prev, hashrate / 1e12));
      setDifficultyHistory((prev) => appendHistory(prev, networkStats.difficulty));
      setBlockTimeData((prev) => appendHistory(prev, networkStats.blockTime));

      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch network stats');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworkStats();
    const interval = setInterval(fetchNetworkStats, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const formatHashrate = (hashrate: number): string => {
    if (hashrate >= 1e18) return `${(hashrate / 1e18).toFixed(2)} EH/s`;
    if (hashrate >= 1e15) return `${(hashrate / 1e15).toFixed(2)} PH/s`;
    if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
    if (hashrate >= 1e9) return `${(hashrate / 1e9).toFixed(2)} GH/s`;
    return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F23] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading network statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0F0F23] text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Network Statistics
          </h1>
          <p className="text-gray-400">Real-time KuberCoin network metrics and analytics</p>
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">Network Hashrate</p>
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-purple-400">{formatHashrate(stats.hashrate)}</p>
            <p className="text-xs text-gray-500 mt-1">Estimated network power</p>
          </div>

          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">Difficulty</p>
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-blue-400">{stats.difficulty.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Mining difficulty</p>
          </div>

          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-green-500/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">Block Height</p>
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-green-400">{stats.blockHeight.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Current blockchain height</p>
          </div>

          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-yellow-500/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">Connections</p>
              <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{stats.connections}</p>
            <p className="text-xs text-gray-500 mt-1">Active peer connections</p>
          </div>
        </div>

        {/* Mempool Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Mempool Status</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-[#0F0F23] rounded-lg">
                <span className="text-gray-400">Pending Transactions</span>
                <span className="text-2xl font-bold text-purple-400">{stats.mempoolSize}</span>
              </div>
              
              <div className="flex justify-between items-center p-4 bg-[#0F0F23] rounded-lg">
                <span className="text-gray-400">Mempool Size</span>
                <span className="text-2xl font-bold text-blue-400">{formatBytes(stats.mempoolBytes)}</span>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                <p className="text-sm text-blue-300">
                  <strong className="text-blue-400">TPS Estimate:</strong> {(stats.mempoolSize / 600).toFixed(2)} tx/s
                </p>
                <p className="text-xs text-blue-400 mt-1">
                  Based on 10-minute block time
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A2E] rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-xl font-semibold mb-4">Node Information</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-[#0F0F23] rounded-lg">
                <span className="text-gray-400">Version</span>
                <span className="text-white font-mono text-sm">{stats.version}</span>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-[#0F0F23] rounded-lg">
                <span className="text-gray-400">Protocol Version</span>
                <span className="text-white font-mono">{stats.protocolVersion}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-[#0F0F23] rounded-lg">
                <span className="text-gray-400">Block Time</span>
                <span className="text-white font-mono">{stats.blockTime}s (10 min)</span>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/50 rounded-lg">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-semibold">Node Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hashrate Chart */}
        <NetworkCharts
          hashrateHistory={hashrateHistory}
          difficultyHistory={difficultyHistory}
          blockTimeData={blockTimeData}
        />
      </div>
    </div>
  );
}
