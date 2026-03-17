'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

type RpcSnapshot = {
  height: number;
  bestHash: string;
  peerCount: number;
  mempoolSize: number;
  ok: boolean;
  error?: string;
};

type MetricsSnapshot = {
  ok: boolean;
  error?: string;
  extracted?: Record<string, number>;
};

const REFRESH_MS_DEFAULT = 5000;

export default function DashboardClient() {
  const [rpc, setRpc] = useState<RpcSnapshot>({
    height: 0,
    bestHash: '',
    peerCount: 0,
    mempoolSize: 0,
    ok: false,
  });
  const [metrics, setMetrics] = useState<MetricsSnapshot>({ ok: false });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshMs = useMemo(() => {
    const raw = Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? REFRESH_MS_DEFAULT);
    return Number.isFinite(raw) && raw >= 1000 ? raw : REFRESH_MS_DEFAULT;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rpcRes, metricsRes] = await Promise.all([
        fetch('/api/rpc', { cache: 'no-store' }),
        fetch('/api/metrics', { cache: 'no-store' }),
      ]);

      const rpcJson = (await rpcRes.json()) as RpcSnapshot;
      const metricsJson = (await metricsRes.json()) as MetricsSnapshot;

      setRpc(rpcJson);
      setMetrics(metricsJson);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setRpc({ height: 0, bestHash: '', peerCount: 0, mempoolSize: 0, ok: false, error: msg });
      setMetrics({ ok: false, error: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), refreshMs);
    return () => clearInterval(t);
  }, [autoRefresh, load, refreshMs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Node Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {lastUpdated ? `Updated at ${lastUpdated}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-slate-400">Auto-refresh</span>
            <button
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none ${
                autoRefresh ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-1 ${
                autoRefresh ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all text-sm disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Block Height"
          value={rpc.ok ? rpc.height.toLocaleString() : '—'}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          iconColor="text-blue-400"
          iconBg="bg-blue-500/20"
        />
        <StatCard
          title="Mempool"
          value={rpc.ok ? rpc.mempoolSize.toLocaleString() : '—'}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          }
          iconColor="text-cyan-300"
          iconBg="bg-cyan-500/20"
        />
        <StatCard
          title="Peers"
          value={rpc.ok ? rpc.peerCount.toLocaleString() : '—'}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          iconColor="text-violet-300"
          iconBg="bg-violet-500/20"
        />
        <StatCard
          title="RPC Status"
          value={rpc.ok ? 'Online' : (rpc.error ? 'Error' : 'Offline')}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconColor={rpc.ok ? 'text-emerald-400' : 'text-red-400'}
          iconBg={rpc.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}
          valueColor={rpc.ok ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* Best Block Hash */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <span className="text-sm font-medium text-slate-400 uppercase tracking-wide">Best Block Hash</span>
        </div>
        <code className="text-white font-mono text-sm break-all">
          {rpc.ok ? rpc.bestHash : (
            <span className="text-red-400">{rpc.error ?? 'RPC unavailable'}</span>
          )}
        </code>
      </div>

      {/* Prometheus Metrics */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm font-medium text-slate-400 uppercase tracking-wide">Prometheus Metrics</span>
          </div>
          <span className={`px-2 py-1 rounded-md text-xs font-medium border ${
            metrics.ok
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          }`}>
            {metrics.ok ? 'Scraping OK' : 'Unavailable'}
          </span>
        </div>
        {metrics.ok ? (
          <div className="divide-y divide-white/5">
            {Object.entries(metrics.extracted ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <code className="text-slate-400 font-mono text-sm">{k}</code>
                <code className="text-white font-mono text-sm">{v}</code>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">{metrics.error ?? 'Metrics unavailable'}</p>
        )}
      </div>
    </div>
  );
}

function StatCard(props: Readonly<{
  title: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
}>) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg ${props.iconBg} ${props.iconColor} flex items-center justify-center flex-shrink-0`}>
          {props.icon}
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-tight">{props.title}</span>
      </div>
      <div className={`text-2xl font-bold ${props.valueColor ?? 'text-white'}`}>
        {props.value}
      </div>
    </div>
  );
}
