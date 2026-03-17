'use client';

import React, { useEffect, useState } from 'react';

interface NodeStatus {
  version: string;
  blockHeight: number;
  peers: number;
  mempool: number;
  uptime: string;
  synced: boolean;
}

interface Endpoint {
  method: string;
  path: string;
  description: string;
  example?: string;
}

export default function NodeDashboard() {
  const [status, setStatus] = useState<NodeStatus>({
    version: '1.0.0',
    blockHeight: 125847,
    peers: 12,
    mempool: 45,
    uptime: '15d 4h 32m',
    synced: true
  });

  const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'rpc' | 'metrics'>('overview');

  const restEndpoints: Endpoint[] = [
    { method: 'GET', path: '/api/health', description: 'Node health status', example: '{"status":"ok"}' },
    { method: 'GET', path: '/api/info', description: 'Node information', example: '{"version":"1.0.0","height":125847}' },
    { method: 'GET', path: '/api/block/:hash', description: 'Get block by hash' },
    { method: 'GET', path: '/api/block/height/:height', description: 'Get block by height' },
    { method: 'GET', path: '/api/tx/:txid', description: 'Get transaction by ID' },
    { method: 'GET', path: '/api/address/:address', description: 'Get address info & UTXOs' },
    { method: 'GET', path: '/api/mempool', description: 'Get mempool transactions' },
    { method: 'POST', path: '/api/tx/broadcast', description: 'Broadcast raw transaction' },
  ];

  const rpcMethods: Endpoint[] = [
    { method: 'POST', path: 'getblockcount', description: 'Returns current block height' },
    { method: 'POST', path: 'getblockhash', description: 'Returns block hash at height' },
    { method: 'POST', path: 'getblock', description: 'Returns block data' },
    { method: 'POST', path: 'getrawtransaction', description: 'Returns raw transaction' },
    { method: 'POST', path: 'sendrawtransaction', description: 'Broadcasts transaction' },
    { method: 'POST', path: 'getmempoolinfo', description: 'Returns mempool stats' },
    { method: 'POST', path: 'getpeerinfo', description: 'Returns connected peers' },
    { method: 'POST', path: 'getnetworkinfo', description: 'Returns network info' },
  ];

  return (
    <div className="relative">
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-emerald-400">Node</div>
            <div className="text-2xl font-semibold text-white">KuberCoin Node API</div>
          </div>
          <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            status.synced
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${status.synced ? 'bg-emerald-400' : 'bg-cyan-300'} animate-pulse`} />
            {status.synced ? 'Synced' : 'Syncing'}
          </span>
        </div>
        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Block Height', value: status.blockHeight.toLocaleString(), icon: '📦', color: 'blue' },
            { label: 'Connected Peers', value: status.peers.toString(), icon: '🌐', color: 'emerald' },
            { label: 'Mempool Size', value: status.mempool.toString(), icon: '📋', color: 'amber' },
            { label: 'Version', value: `v${status.version}`, icon: '🏷️', color: 'purple' },
            { label: 'Uptime', value: status.uptime, icon: '⏱️', color: 'cyan' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{stat.icon}</span>
                <div>
                  <div className="text-lg font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'api', label: 'REST API' },
            { id: 'rpc', label: 'JSON-RPC' },
            { id: 'metrics', label: 'Metrics' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Quick Start
              </h2>
              <p className="text-slate-400 mb-6">
                Connect to the KuberCoin node using REST API or JSON-RPC endpoints.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                  <div className="text-sm text-slate-400 mb-2">REST API Base URL</div>
                  <code className="text-emerald-400 font-mono">https://node.kuber-coin.com/api</code>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                  <div className="text-sm text-slate-400 mb-2">JSON-RPC Endpoint</div>
                  <code className="text-emerald-400 font-mono">https://rpc.kuber-coin.com</code>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Example: Get Block Height</h3>
              <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm overflow-x-auto">
                <div className="text-slate-400"># Using curl</div>
                <div className="text-emerald-400 mt-2">
                  curl https://node.kuber-coin.com/api/info
                </div>
                <div className="text-slate-400 mt-4"># Response</div>
                <div className="text-blue-400 mt-2">
                  {`{"version":"1.0.0","height":${status.blockHeight},"peers":${status.peers}}`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REST API Tab */}
        {activeTab === 'api' && (
          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold mb-6">REST API Endpoints</h2>
            <div className="space-y-3">
              {restEndpoints.map((endpoint) => (
                <div key={endpoint.path} className="bg-slate-800/50 p-4 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      endpoint.method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-cyan-500/20 text-cyan-300'
                    }`}>
                      {endpoint.method}
                    </span>
                    <code className="text-white font-mono">{endpoint.path}</code>
                  </div>
                  <p className="text-slate-400 text-sm">{endpoint.description}</p>
                  {endpoint.example && (
                    <div className="mt-2 text-xs font-mono text-slate-500">
                      Example: <span className="text-emerald-400/70">{endpoint.example}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JSON-RPC Tab */}
        {activeTab === 'rpc' && (
          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold mb-6">JSON-RPC Methods</h2>
            <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 mb-6">
              <div className="text-sm text-slate-400 mb-2">Endpoint</div>
              <code className="text-emerald-400 font-mono">POST https://rpc.kuber-coin.com</code>
            </div>
            <div className="space-y-3">
              {rpcMethods.map((method) => (
                <div key={method.path} className="bg-slate-800/50 p-4 rounded-xl border border-white/5 hover:border-violet-500/30 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-violet-300 font-mono font-semibold">{method.path}</code>
                  </div>
                  <p className="text-slate-400 text-sm">{method.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 bg-slate-900 rounded-xl p-4 font-mono text-sm">
              <div className="text-slate-400"># Example RPC call</div>
              <div className="text-emerald-400 mt-2 whitespace-pre">{`curl -X POST https://rpc.kuber-coin.com \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'`}</div>
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold mb-4">Prometheus Metrics</h2>
              <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 mb-4">
                <div className="text-sm text-slate-400 mb-2">Metrics Endpoint</div>
                <code className="text-emerald-400 font-mono">https://node.kuber-coin.com:9091/metrics</code>
              </div>
              <p className="text-slate-400">
                Scrape Prometheus-compatible metrics for monitoring your node's health and performance.
              </p>
            </div>
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Available Metrics</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  'kubercoin_block_height',
                  'kubercoin_peer_count',
                  'kubercoin_mempool_size',
                  'kubercoin_mempool_bytes',
                  'kubercoin_chain_work',
                  'kubercoin_difficulty',
                  'kubercoin_rpc_requests_total',
                  'kubercoin_block_processing_time',
                ].map((metric) => (
                  <div key={metric} className="bg-slate-800/50 p-3 rounded-lg border border-white/5">
                    <code className="text-cyan-400 text-sm font-mono">{metric}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4 mt-12">
        <div className="max-w-7xl mx-auto text-center text-sm text-slate-500">
          <p>KuberCoin Node API • <a href="https://docs.kuber-coin.com" className="text-emerald-400 hover:underline">Documentation</a></p>
        </div>
      </footer>
    </div>
  );
}
