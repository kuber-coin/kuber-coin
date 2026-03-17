'use client';

import React from 'react';

interface ExplorerHeroProps {
  blockHeight?: number;
  networkHashrate?: string;
  difficulty?: number;
  totalTransactions?: number;
  memPoolSize?: number;
  lastBlockTime?: string;
  synced?: boolean;
}

export default function ExplorerHero({
  blockHeight = 0,
  networkHashrate = '0 H/s',
  difficulty = 0,
  totalTransactions = 0,
  memPoolSize = 0,
  lastBlockTime,
  synced = true,
}: ExplorerHeroProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toLocaleString();
  };

  return (
    <section className="relative overflow-hidden py-10 px-4 sm:px-6 lg:px-8">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-radial from-indigo-500/15 via-transparent to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-radial from-cyan-500/10 via-transparent to-transparent blur-3xl pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,1.08fr)] lg:items-end">
          <div>
            <div className="flex justify-center lg:justify-start mb-4">
            <span className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
              ${synced 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'}
            `}>
              <span className={`w-2 h-2 rounded-full ${synced ? 'bg-emerald-400' : 'bg-cyan-300'} animate-pulse`} />
              {synced ? 'Network Synced' : 'Syncing Network...'}
            </span>
            </div>
          
            <h1 className="text-center lg:text-left text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-4 tracking-[-0.04em]">
              <span className="bg-gradient-to-r from-[var(--kc-muted-strong)] via-white to-[var(--kc-muted-strong)] bg-clip-text text-transparent">
                Kuber
              </span>{' '}
              <span className="bg-gradient-to-r from-[var(--kc-accent-purple)] via-[var(--kc-accent)] to-[var(--kc-accent-cyan)] bg-clip-text text-transparent">Explorer</span>
            </h1>
            <p className="mx-auto max-w-2xl text-center text-lg text-[color:var(--kc-muted)] lg:mx-0 lg:text-left">
              Inspect chain state, watch mempool movement, and verify address activity from one premium network surface.
            </p>
          </div>

          <div className="glass-card relative overflow-hidden p-6 text-left shadow-[0_0_44px_rgba(98,126,234,0.18)]">
            <div className="absolute inset-x-6 top-0 h-[5px] rounded-b-full bg-[linear-gradient(90deg,rgba(98,126,234,0.92),rgba(168,139,255,0.88),rgba(89,211,255,0.8))]" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">Featured Network Metric</p>
            <div className="mt-4 flex items-start gap-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-300">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[color:var(--kc-muted)]">Current Block Height</p>
                <p className="mt-2 text-4xl font-extrabold text-white">{formatNumber(blockHeight)}</p>
                <p className="mt-2 text-sm text-[color:var(--kc-muted)]">{lastBlockTime ? `Last block ${lastBlockTime}` : 'Latest chain tip available through explorer data.'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Block Height - Featured */}
          <div className="col-span-2 glass-card p-6 lg:p-8 text-center shadow-[0_0_44px_rgba(98,126,234,0.18)]">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 mb-4">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-[color:var(--kc-muted)] text-sm uppercase tracking-wider mb-2">Block Height</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl lg:text-5xl font-extrabold text-white">
                {formatNumber(blockHeight)}
              </span>
            </div>
            {lastBlockTime && (
              <p className="text-[color:var(--kc-muted)] text-sm mt-2">Last block: {lastBlockTime}</p>
            )}
          </div>

          {/* Difficulty */}
          <div className="glass-card p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-[color:var(--kc-muted)] text-sm">Difficulty</span>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-white">{formatNumber(difficulty)}</p>
          </div>

          {/* Network Hashrate */}
          <div className="glass-card p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-[color:var(--kc-muted)] text-sm">Hashrate</span>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-white">{networkHashrate}</p>
          </div>

          {/* Total Transactions */}
          <div className="glass-card p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <span className="text-[color:var(--kc-muted)] text-sm">Transactions</span>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-white">{formatNumber(totalTransactions)}</p>
          </div>

          {/* Mempool */}
          <div className="glass-card p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-[color:var(--kc-muted)] text-sm">Mempool</span>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-white">{formatNumber(memPoolSize)}</p>
          </div>
        </div>

        {/* Search Box */}
        <div className="mt-8">
          <div className="glass-card p-4 lg:p-6 max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <svg 
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[color:var(--kc-muted)]"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by block height, transaction hash, or address..."
                  className="
                    w-full pl-12 pr-4 py-4
                    bg-[rgba(15,22,43,0.78)] 
                    border border-white/10 
                    rounded-xl
                    text-white placeholder-[color:var(--kc-muted)]
                    focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20
                    transition-all duration-200
                  "
                />
              </div>
              <button className="btn-premium btn-primary px-8 py-4">
                Search
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
