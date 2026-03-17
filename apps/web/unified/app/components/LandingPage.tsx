"use client";

import { useEffect, useState } from "react";

const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || "https://kuber-coin.com",
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.kuber-coin.com",
  explorer:
    process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.kuber-coin.com",
  node: process.env.NEXT_PUBLIC_NODE_URL || "https://node.kuber-coin.com",
  docs: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.kuber-coin.com",
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || "https://dapp.kuber-coin.com",
};

interface NodeStats {
  online: boolean;
  blockHeight: number | null;
  mempoolSize: number | null;
  peerCount: number | null;
  network: string | null;
  version: string | null;
}

export default function LandingPage() {
  const [stats, setStats] = useState<NodeStats | null>(null);

  useEffect(() => {
    const fetchStats = () =>
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStats(d))
        .catch(() => {});

    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => clearInterval(id);
  }, []);

  const blockHeightLabel =
    stats?.blockHeight != null ? stats.blockHeight.toLocaleString() : "--";
  const mempoolLabel =
    stats?.mempoolSize != null ? stats.mempoolSize.toLocaleString() : "--";
  const peerLabel =
    stats?.peerCount != null ? stats.peerCount.toLocaleString() : "--";
  const networkLabel = stats?.network ?? "--";
  const versionLabel = stats?.version ?? "Awaiting peer handshake";

  return (
    <div
      className="overflow-hidden text-white"
      style={{ background: "var(--kc-bg-gradient)" }}
    >
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:gap-12">
            <div className="max-w-3xl">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
                  stats === null
                    ? "border border-white/10 bg-white/5 text-[var(--kc-muted-strong)]"
                    : stats.online
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border border-rose-500/20 bg-rose-500/10 text-rose-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${stats === null ? "bg-[var(--kc-muted)]" : stats.online ? "bg-emerald-400 animate-pulse" : "bg-rose-300"}`}
                />
                {stats === null
                  ? "Connecting to network telemetry"
                  : stats.online
                    ? `${stats.network ?? "Network"} online`
                    : "Node offline"}
              </div>

              <div className="mt-8 space-y-6">
                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.26em] text-[var(--kc-accent-cyan)]">
                    Production-grade crypto stack
                  </p>
                  <h1 className="text-5xl font-extrabold tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                    <span className="bg-gradient-to-r from-[var(--kc-muted-strong)] via-white to-[var(--kc-muted-strong)] bg-clip-text text-transparent">
                      The Future of
                    </span>
                    <br />
                    <span className="bg-gradient-to-r from-[var(--kc-accent-purple)] via-[var(--kc-accent)] to-[var(--kc-accent-cyan)] bg-clip-text text-transparent">
                      Digital Currency
                    </span>
                  </h1>
                </div>

                <p className="max-w-2xl text-lg text-[var(--kc-muted)] sm:text-xl">
                  KuberCoin delivers wallet access, block exploration, and node
                  observability through one dark-premium operating surface built
                  on the KuberCoin Core engine.
                </p>

                <div className="flex flex-wrap gap-4">
                  <a
                    href={DOMAINS.wallet}
                    className="btn-premium btn-gold btn-lg"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                    Open Wallet
                  </a>
                  <a
                    href={DOMAINS.explorer}
                    className="btn-premium btn-ghost btn-lg"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    Explore Blockchain
                  </a>
                  <a
                    href={DOMAINS.docs}
                    className="btn-premium btn-outline btn-lg"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                    Documentation
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[rgba(98,126,234,0.16)] bg-[rgba(11,16,33,0.66)] px-4 py-4 backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">
                      Access
                    </p>
                    <p className="mt-2 text-sm text-[var(--kc-muted)]">
                      Wallet, explorer, docs, node APIs, and dapp surfaces
                      aligned under one system.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[rgba(98,126,234,0.16)] bg-[rgba(11,16,33,0.66)] px-4 py-4 backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">
                      Latency
                    </p>
                    <p className="mt-2 text-sm text-[var(--kc-muted)]">
                      Real-time telemetry and mempool data delivered directly
                      from node infrastructure.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[rgba(98,126,234,0.16)] bg-[rgba(11,16,33,0.66)] px-4 py-4 backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">
                      Security
                    </p>
                    <p className="mt-2 text-sm text-[var(--kc-muted)]">
                      Low-friction onboarding with operator-grade observability
                      and network awareness.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card relative overflow-hidden p-6 sm:p-7">
              <div className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(98,126,234,0)_0%,rgba(98,126,234,0.8)_20%,rgba(168,139,255,0.78)_50%,rgba(89,211,255,0.72)_80%,rgba(89,211,255,0)_100%)]" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--kc-accent-cyan)]">
                    Network Snapshot
                  </p>
                  <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white">
                    Live chain telemetry
                  </h2>
                </div>
                <div className="rounded-2xl border border-[rgba(98,126,234,0.16)] bg-[rgba(8,12,24,0.74)] px-3 py-2 text-right shadow-[0_12px_30px_rgba(2,6,23,0.28)]">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--kc-muted)]">
                    Node version
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--kc-text-bright)]">
                    {versionLabel}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-3xl border border-[rgba(98,126,234,0.18)] bg-[rgba(8,12,24,0.76)] p-5 shadow-[0_20px_44px_rgba(24,52,143,0.16)]">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/18 text-blue-300">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {blockHeightLabel}
                  </div>
                  <div className="mt-2 text-sm text-[var(--kc-muted)]">
                    Block Height
                  </div>
                </div>
                <div className="rounded-3xl border border-[rgba(98,126,234,0.18)] bg-[rgba(8,12,24,0.76)] p-5 shadow-[0_20px_44px_rgba(24,52,143,0.16)]">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/18 text-emerald-300">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {mempoolLabel}
                  </div>
                  <div className="mt-2 text-sm text-[var(--kc-muted)]">
                    Mempool Txs
                  </div>
                </div>
                <div className="rounded-3xl border border-[rgba(98,126,234,0.18)] bg-[rgba(8,12,24,0.76)] p-5 shadow-[0_20px_44px_rgba(24,52,143,0.16)]">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/18 text-cyan-300">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {peerLabel}
                  </div>
                  <div className="mt-2 text-sm text-[var(--kc-muted)]">
                    Peer Connections
                  </div>
                </div>
                <div className="rounded-3xl border border-[rgba(98,126,234,0.18)] bg-[rgba(8,12,24,0.76)] p-5 shadow-[0_20px_44px_rgba(24,52,143,0.16)]">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/18 text-violet-300">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {networkLabel}
                  </div>
                  <div className="mt-2 text-sm text-[var(--kc-muted)]">
                    Network
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-[rgba(89,211,255,0.16)] bg-[linear-gradient(135deg,rgba(98,126,234,0.18)_0%,rgba(89,211,255,0.08)_100%)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--kc-accent-cyan)]">
                      Routing
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      Unified access for users and operators
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--kc-muted-strong)]">
                    Live
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--kc-muted)]">
                  Jump directly from discovery into wallet workflows, live chain
                  exploration, node metrics, and developer documentation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Complete Ecosystem
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Everything you need to interact with the KuberCoin blockchain
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Wallet */}
            <a
              href={DOMAINS.wallet}
              className="glass-card glass-card-gold p-8 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-cyan-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Web Wallet
              </h3>
              <p className="text-slate-400 mb-4">
                Create wallets, send & receive KuberCoin, manage your funds
                securely in your browser.
              </p>
              <span className="text-cyan-300 font-medium flex items-center gap-2">
                wallet.kuber-coin.com
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>

            {/* Explorer */}
            <a href={DOMAINS.explorer} className="glass-card p-8 group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Block Explorer
              </h3>
              <p className="text-slate-400 mb-4">
                Browse blocks, transactions, and addresses. Track your payments
                in real-time.
              </p>
              <span className="text-blue-400 font-medium flex items-center gap-2">
                explorer.kuber-coin.com
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>

            {/* Node API */}
            <a
              href={DOMAINS.node}
              className="glass-card glass-card-green p-8 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Node API
              </h3>
              <p className="text-slate-400 mb-4">
                Access network status, metrics, and health endpoints. Monitor
                your infrastructure.
              </p>
              <span className="text-emerald-400 font-medium flex items-center gap-2">
                node.kuber-coin.com
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>

            {/* Documentation */}
            <a href={DOMAINS.docs} className="glass-card p-8 group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-violet-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Documentation
              </h3>
              <p className="text-slate-400 mb-4">
                API reference, guides, tutorials, and SDK examples. Get started
                quickly.
              </p>
              <span className="text-violet-300 font-medium flex items-center gap-2">
                docs.kuber-coin.com
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>

            {/* dApp Platform */}
            <a href={DOMAINS.dapp} className="glass-card p-8 group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-cyan-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                dApp Platform
              </h3>
              <p className="text-slate-400 mb-4">
                Build and deploy decentralized applications on KuberCoin. Smart
                contracts coming soon.
              </p>
              <span className="text-cyan-400 font-medium flex items-center gap-2">
                dapp.kuber-coin.com
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>

            {/* GitHub */}
            <a
              href="https://github.com/kubercoin"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card p-8 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500/20 to-slate-600/10 border border-slate-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg
                  className="w-7 h-7 text-slate-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Open Source
              </h3>
              <p className="text-slate-400 mb-4">
                KuberCoin is fully open source. Contribute, audit, and build
                with confidence.
              </p>
              <span className="text-slate-300 font-medium flex items-center gap-2">
                github.com/kubercoin
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Technical Features */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built for Performance
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Blockchain infrastructure for developers and operators
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-card p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                KuberCoin Core
              </h3>
              <p className="text-slate-400 text-sm">
                High-performance, blazing-fast blockchain node
              </p>
            </div>
            <div className="glass-card p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                SHA-256d PoW
              </h3>
              <p className="text-slate-400 text-sm">
                Bitcoin-compatible proof-of-work consensus
              </p>
            </div>
            <div className="glass-card p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                secp256k1 Signatures
              </h3>
              <p className="text-slate-400 text-sm">
                secp256k1 elliptic-curve cryptography
              </p>
            </div>
            <div className="glass-card p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Azure Seed Nodes
              </h3>
              <p className="text-slate-400 text-sm">
                Azure-hosted seed nodes across two continents
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto">
              Create your wallet in seconds and start exploring the KuberCoin
              ecosystem.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a href={DOMAINS.wallet} className="btn-premium btn-gold btn-lg">
                Create Wallet
              </a>
              <a href={DOMAINS.docs} className="btn-premium btn-ghost btn-lg">
                Read the Docs
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
