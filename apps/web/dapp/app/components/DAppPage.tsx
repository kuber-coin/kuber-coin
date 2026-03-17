'use client';

import React, { useState, useEffect } from 'react';

interface DApp {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  gradient: string;
  status: 'live' | 'coming-soon' | 'beta';
}

interface NodeStats {
  online: boolean;
  blockHeight: number | null;
  mempoolSize: number | null;
  peerCount: number | null;
  network: string | null;
}

export default function DAppPage() {
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const fmt = (v: number | null | undefined) =>
    v !== null && v !== undefined ? v.toLocaleString() : '—';

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/stats', { cache: 'no-store' });
        if (res.ok) setNodeStats(await res.json());
      } catch { /* offline */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const dapps: DApp[] = [
    {
      id: 'swap',
      name: 'KuberSwap',
      description: 'Instant token swaps with minimal slippage',
      category: 'DeFi',
      gradient: 'from-cyan-500 to-blue-500',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
    },
    {
      id: 'stake',
      name: 'KuberStake',
      description: 'Stake your $KUBER and earn rewards',
      category: 'DeFi',
      gradient: 'from-emerald-500 to-teal-500',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    {
      id: 'nft',
      name: 'KuberNFT',
      description: 'Create, buy, and sell digital collectibles',
      category: 'NFT',
      gradient: 'from-violet-500 to-indigo-500',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
    {
      id: 'lend',
      name: 'KuberLend',
      description: 'Decentralized lending and borrowing',
      category: 'DeFi',
      gradient: 'from-sky-500 to-cyan-400',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
    },
    {
      id: 'bridge',
      name: 'KuberBridge',
      description: 'Cross-chain asset transfers',
      category: 'Bridge',
      gradient: 'from-blue-500 to-indigo-500',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
    },
    {
      id: 'dao',
      name: 'KuberDAO',
      description: 'Community governance and voting',
      category: 'Governance',
      gradient: 'from-rose-500 to-red-500',
      status: 'coming-soon',
      icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    },
  ];



  return (
    <div className="min-h-screen">
      <section className="pt-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-cyan-400">DApp Hub</div>
            <div className="text-2xl font-semibold text-white">Kuber DApp Ecosystem</div>
          </div>

          <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <a href="#dapps" className="hover:text-white transition-colors">All DApps</a>
            <a href="#defi" className="hover:text-white transition-colors">DeFi</a>
            <a href="#nft" className="hover:text-white transition-colors">NFT</a>
            <a href="https://docs.kuber-coin.com" className="hover:text-white transition-colors">Docs</a>
          </nav>

          <a
            href="https://wallet.kuber-coin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Open Wallet
          </a>
        </div>
      </section>

      {/* Hero */}
      <section className="pt-16 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan-500/60"></span>
              Ecosystem Preview
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              The Future of <br/>
              <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                Decentralized Finance
              </span>
            </h1>
            <p className="text-xl text-slate-400 mb-8">
              Explore the Kuber DApp ecosystem. Swap, stake, lend, and build on a 
              next-generation blockchain designed for speed and security.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#dapps" className="btn-primary">
                Explore DApps
              </a>
              <a href="https://docs.kuber-coin.com" className="btn-secondary">
                Build on Kuber
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Network Stats */}
      <section className="py-12 px-6 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">{fmt(nodeStats?.blockHeight)}</div>
              <div className="text-slate-400 text-sm">Block Height</div>
            </div>
            <div className="glass-card p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">{fmt(nodeStats?.mempoolSize)}</div>
              <div className="text-slate-400 text-sm">Mempool Txs</div>
            </div>
            <div className="glass-card p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">{fmt(nodeStats?.peerCount)}</div>
              <div className="text-slate-400 text-sm">Peers</div>
            </div>
            <div className="glass-card p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">{nodeStats?.network ?? '—'}</div>
              <div className="text-sm">
                {nodeStats?.online
                  ? <span className="text-emerald-400">● Online</span>
                  : <span className="text-slate-500">● Offline</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DApps Grid */}
      <section id="dapps" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">Discover DApps</h2>
          <p className="text-slate-400 mb-12 max-w-2xl">
            Explore decentralized applications built on Kuber. From DeFi protocols to NFT marketplaces.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dapps.map((dapp) => (
              <div 
                key={dapp.id}
                className="glass-card p-6 hover:border-cyan-500/30 transition-all duration-300 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${dapp.gradient} flex items-center justify-center text-white`}>
                    {dapp.icon}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    dapp.status === 'live' 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : dapp.status === 'beta'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {dapp.status === 'live' ? 'Live' : dapp.status === 'beta' ? 'Beta' : 'Coming Soon'}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                  {dapp.name}
                </h3>
                <p className="text-slate-400 mb-4">{dapp.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-sm">{dapp.category}</span>
                  <svg className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Developer Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent via-cyan-950/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  Build the Next Big DApp
                </h2>
                <p className="text-slate-400 mb-6">
                  Kuber provides a robust SDK and comprehensive documentation to help 
                  you build decentralized applications with ease.
                </p>
                <ul className="space-y-4 mb-8">
                  {[
                    'Smart contract support',
                    'High transaction throughput',
                    'Low and predictable fees',
                    'Developer grants available',
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-slate-300">
                      <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a href="https://docs.kuber-coin.com" className="btn-primary inline-flex items-center gap-2">
                  Start Building
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </a>
              </div>
              <div className="bg-slate-900 rounded-xl p-6 font-mono text-sm overflow-x-auto">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="w-3 h-3 rounded-full bg-cyan-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <pre className="text-emerald-400">{`import { KuberSDK } from '@kubercoin/sdk';

const sdk = new KuberSDK({
  network: 'mainnet'
});

// Deploy your contract
const contract = await sdk.deploy({
  code: myContractCode,
  args: ['Hello', 'KuberCoin']
});

console.log('Deployed:', contract.address);`}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <span className="text-slate-400">&copy; 2026 Kuber. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://docs.kuber-coin.com" className="text-slate-400 hover:text-white transition-colors">Docs</a>
              <a href="https://github.com/kubercoin" className="text-slate-400 hover:text-white transition-colors">GitHub</a>
              <a href="https://discord.gg/kubercoin" className="text-slate-400 hover:text-white transition-colors">Discord</a>
              <a href="https://twitter.com/kubercoin" className="text-slate-400 hover:text-white transition-colors">Twitter</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
