'use client';

import React from 'react';
import '../premium-ui.css';

interface WalletHeroProps {
  walletName?: string;
  address?: string;
  balance?: number;
  synced?: boolean;
  onCreateWallet?: () => void;
}

export default function WalletHero({ 
  walletName, 
  address, 
  balance = 0,
  synced = true,
  onCreateWallet 
}: WalletHeroProps) {
  const formatBalance = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(2)}K`;
    return val.toFixed(2);
  };

  return (
    <section className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-radial from-indigo-500/20 via-transparent to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-radial from-cyan-400/10 via-transparent to-transparent blur-3xl pointer-events-none" />
      
      <div className="relative max-w-5xl mx-auto">
        <div className="glass-card text-center">
          {/* Status badge */}
          <div className="flex justify-center mb-6">
            <span className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
              ${synced 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}
            `}>
              <span className={`w-2 h-2 rounded-full ${synced ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
              {synced ? 'Synced & Ready' : 'Syncing...'}
            </span>
          </div>

          {walletName ? (
            <>
              <div className="grid gap-8 text-left lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-stretch">
                <div>
                  <div className="flex items-center gap-3 mb-4 justify-center lg:justify-start">
                    <div className="
                      w-14 h-14 rounded-2xl 
                      bg-gradient-to-br from-[var(--kc-accent-purple)] via-[var(--kc-accent)] to-[var(--kc-accent-cyan)]
                      flex items-center justify-center
                      shadow-lg shadow-indigo-500/30
                    ">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">Active Wallet</p>
                      <h1 className="text-3xl sm:text-4xl font-bold text-white">
                        {walletName}
                      </h1>
                    </div>
                  </div>

                  <p className="text-[color:var(--kc-muted)] text-base sm:text-lg max-w-2xl mx-auto lg:mx-0">
                    Securely manage balances, route transactions, and keep a clear view of address state from one premium wallet surface.
                  </p>

                  {address && (
                    <div className="mt-6 mb-8">
                      <p className="text-sm text-[color:var(--kc-muted)] mb-2">Wallet Address</p>
                      <div className="
                        inline-flex max-w-full items-center gap-2 px-4 py-3
                        bg-[rgba(15,22,43,0.82)] rounded-xl border border-[color:var(--kc-glass-border)]
                        font-mono text-sm text-[color:var(--kc-text)]
                      ">
                        <span className="max-w-[200px] sm:max-w-[400px] truncate">
                          {address}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(address)}
                          className="text-blue-300 hover:text-cyan-200 transition-colors"
                          title="Copy address"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                    <button className="btn-premium btn-primary btn-lg group">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send
                    </button>
                    <button className="btn-premium btn-gold btn-lg group">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Receive
                    </button>
                    <button className="btn-premium btn-ghost btn-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      History
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[rgba(98,126,234,0.18)] bg-[linear-gradient(180deg,rgba(10,16,32,0.82)_0%,rgba(18,24,45,0.92)_100%)] p-6 shadow-[0_24px_56px_rgba(2,6,23,0.42)]">
                  <p className="text-sm text-[color:var(--kc-muted)] uppercase tracking-[0.24em]">Total Balance</p>
                  <div className="mt-4 flex items-baseline gap-2 justify-center lg:justify-start">
                    <span className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-[var(--kc-accent-purple)] via-white to-[var(--kc-accent-cyan)] bg-clip-text text-transparent">
                      {formatBalance(balance)}
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold text-indigo-300/70">KBR</span>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--kc-muted)] text-center lg:text-left">
                    ≈ ${(balance * 0.0001).toFixed(2)} USD
                  </p>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">Network State</p>
                      <p className="mt-2 text-lg font-semibold text-white">{synced ? 'Ready to transact' : 'Catching up to chain tip'}</p>
                      <p className="mt-1 text-sm text-[color:var(--kc-muted)]">{synced ? 'Wallet data is synced and available for sending or receiving funds.' : 'Wait for sync completion before broadcasting high-value transactions.'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">Address Footprint</p>
                      <p className="mt-2 font-mono text-sm text-white break-all">{address ?? 'No address loaded'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* No Wallet State */}
              <div className="py-8">
                <div className="
                  w-20 h-20 rounded-3xl mx-auto mb-6
                  bg-gradient-to-br from-[rgba(30,41,82,0.9)] to-[rgba(12,18,36,0.96)]
                  flex items-center justify-center
                  border border-[color:var(--kc-glass-border)]
                ">
                  <svg className="w-10 h-10 text-[color:var(--kc-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Welcome to KuberCoin
                </h2>
                <p className="text-[color:var(--kc-muted)] mb-8 max-w-md mx-auto">
                  Create or import a wallet to start sending and receiving KuberCoin
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button 
                    onClick={onCreateWallet}
                    className="btn-premium btn-primary btn-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Create Wallet
                  </button>
                  <button className="btn-premium btn-ghost btn-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import Wallet
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
