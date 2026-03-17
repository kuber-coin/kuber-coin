'use client';

import React, { useState, useEffect } from 'react';

type DocSection = 'getting-started' | 'api' | 'rpc' | 'wallet' | 'mining' | 'security';

interface NavItem {
  id: DocSection;
  label: string;
  icon: React.ReactNode;
}

function CopyButton({ text }: Readonly<{ text: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="absolute top-3 right-3 rounded-md border border-white/10 bg-[rgba(11,16,33,0.72)] px-2 py-1 text-xs text-[color:var(--kc-muted)] transition-all hover:bg-[rgba(18,24,45,0.92)] hover:text-white"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('getting-started');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const valid: DocSection[] = ['getting-started', 'api', 'rpc', 'wallet', 'mining', 'security'];
    if (valid.includes(hash as DocSection)) setActiveSection(hash as DocSection);
  }, []);

  const navItems: NavItem[] = [
    { 
      id: 'getting-started', 
      label: 'Getting Started',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    { 
      id: 'api', 
      label: 'REST API',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
    { 
      id: 'rpc', 
      label: 'JSON-RPC',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
    },
    { 
      id: 'wallet', 
      label: 'Wallet SDK',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    },
    { 
      id: 'mining', 
      label: 'Mining',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
    },
    { 
      id: 'security', 
      label: 'Security',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    },
  ];

  const bodyTextClass = 'text-[color:var(--kc-muted-strong)]';
  const mutedTextClass = 'text-[color:var(--kc-muted)]';
  const codePanelClass = 'rounded-xl border border-white/10 bg-[rgba(8,12,24,0.9)] p-4 font-mono text-sm shadow-[0_18px_40px_rgba(2,6,23,0.32)]';
  const codePanelCompactClass = 'rounded-lg border border-white/10 bg-[rgba(8,12,24,0.88)] p-4 font-mono text-sm shadow-[0_16px_36px_rgba(2,6,23,0.28)]';
  const codeCommentClass = 'text-[color:var(--kc-muted)]';

  const renderContent = () => {
    switch (activeSection) {
      case 'getting-started':
        return (
          <div className="prose prose-invert max-w-none">
            <h1 className="text-4xl font-bold text-white mb-6">Getting Started with KuberCoin</h1>
            
            <div className="glass-card p-6 mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4 mt-0">Quick Start</h2>
              <p className={bodyTextClass}>
                KuberCoin is a modern cryptocurrency built with Rust. This guide will help you get started 
                with the wallet, explorer, and node APIs.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">1. Create a Wallet</h3>
            <p className={`${bodyTextClass} mb-4`}>
              Visit <a href="https://wallet.kuber-coin.com" className="text-blue-300 hover:underline">wallet.kuber-coin.com</a> to 
              create your first wallet. No registration required.
            </p>
            <div className={`${codePanelClass} mb-6`}>
              <span className={codeCommentClass}># Or use the CLI:</span><br/>
              <span className="text-emerald-400">kubercoin wallet create --name my-wallet</span>
            </div>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">2. Get Testnet Coins</h3>
            <p className={`${bodyTextClass} mb-4`}>
              Use our faucet to receive free testnet coins for development.
            </p>
            <div className={`${codePanelClass} mb-6`}>
              <span className="text-emerald-400">curl -X POST https://faucet.kuber-coin.com/request \</span><br/>
              <span className="text-emerald-400">  -d '{`{"address":"your-address"}`}'</span>
            </div>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">3. Send Your First Transaction</h3>
            <div className={codePanelClass}>
              <span className={codeCommentClass}># Using the API</span><br/>
              <span className="text-emerald-400">curl -X POST https://node.kuber-coin.com/api/tx/broadcast \</span><br/>
              <span className="text-emerald-400">  -H "Content-Type: application/json" \</span><br/>
              <span className="text-emerald-400">  -d '{`{"raw_tx":"..."}`}'</span>
            </div>
          </div>
        );

      case 'api':
        return (
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">REST API Reference</h1>
            
            <div className="glass-card p-6 mb-8">
              <h2 className="text-lg font-semibold text-white mb-2">Base URL</h2>
              <code className="text-blue-300 font-mono text-lg">https://node.kuber-coin.com/api</code>
            </div>

            <div className="space-y-6">
              {[
                { method: 'GET', path: '/health', desc: 'Check node health status', response: '{"status":"ok","height":125847}' },
                { method: 'GET', path: '/info', desc: 'Get node information', response: '{"version":"1.0.0","height":125847,"peers":12}' },
                { method: 'GET', path: '/block/:hash', desc: 'Get block by hash', response: '{"hash":"...","height":100,"txs":[...]}' },
                { method: 'GET', path: '/block/height/:n', desc: 'Get block by height', response: '{"hash":"...","height":100,"txs":[...]}' },
                { method: 'GET', path: '/tx/:txid', desc: 'Get transaction by ID', response: '{"txid":"...","confirmations":6,...}' },
                { method: 'GET', path: '/address/:addr', desc: 'Get address info and UTXOs', response: '{"address":"...","balance":1000000,"utxos":[...]}' },
                { method: 'GET', path: '/mempool', desc: 'Get mempool transactions', response: '{"size":45,"txs":[...]}' },
                { method: 'POST', path: '/tx/broadcast', desc: 'Broadcast raw transaction', response: '{"txid":"..."}' },
              ].map((endpoint) => (
                <div key={endpoint.path} className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                      endpoint.method === 'GET' 
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {endpoint.method}
                    </span>
                    <code className="text-white font-mono text-lg">{endpoint.path}</code>
                  </div>
                  <p className={`${mutedTextClass} mb-4`}>{endpoint.desc}</p>
                  <div className={codePanelCompactClass}>
                    <span className={codeCommentClass}>// Response</span><br/>
                    <span className="text-emerald-400">{endpoint.response}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'rpc':
        return (
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">JSON-RPC API</h1>
            
            <div className="glass-card p-6 mb-8">
              <h2 className="text-lg font-semibold text-white mb-2">RPC Endpoint</h2>
              <code className="text-blue-300 font-mono text-lg">https://rpc.kuber-coin.com</code>
              <p className={`${mutedTextClass} mt-4 text-sm`}>
                All RPC calls use HTTP POST with Content-Type: application/json
              </p>
            </div>

            <div className="space-y-6">
              {[
                { method: 'getblockcount', params: '[]', result: '125847' },
                { method: 'getblockhash', params: '[100]', result: '"000000..."' },
                { method: 'getblock', params: '["hash", true]', result: '{...}' },
                { method: 'getrawtransaction', params: '["txid", true]', result: '{...}' },
                { method: 'sendrawtransaction', params: '["hex"]', result: '"txid"' },
                { method: 'getmempoolinfo', params: '[]', result: '{"size":45}' },
                { method: 'getpeerinfo', params: '[]', result: '[{...}]' },
                { method: 'getnetworkinfo', params: '[]', result: '{...}' },
              ].map((rpc) => (
                <div key={rpc.method} className="glass-card p-6">
                  <h3 className="text-xl font-semibold text-violet-300 mb-4 font-mono">{rpc.method}</h3>
                  <div className={codePanelCompactClass}>
                    <span className={codeCommentClass}>// Request</span><br/>
                    <span className="text-white">{`{"jsonrpc":"2.0","method":"${rpc.method}","params":${rpc.params},"id":1}`}</span><br/><br/>
                    <span className={codeCommentClass}>// Response</span><br/>
                    <span className="text-emerald-400">{`{"jsonrpc":"2.0","result":${rpc.result},"id":1}`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'wallet':
        return (
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">Wallet SDK</h1>
            
            <div className="glass-card glass-card-gold p-6 mb-8">
              <h2 className="text-lg font-semibold text-white mb-2">Installation</h2>
              <div className={codePanelCompactClass}>
                <span className={codeCommentClass}># npm</span><br/>
                <span className="text-emerald-400">npm install @kubercoin/sdk</span><br/><br/>
                <span className={codeCommentClass}># cargo</span><br/>
                <span className="text-emerald-400">cargo add kubercoin-sdk</span>
              </div>
            </div>

            <h2 className="text-2xl font-semibold text-white mb-4">JavaScript/TypeScript</h2>
            <div className={`relative ${codePanelClass} mb-8 overflow-x-auto`}>
              <CopyButton text={`import { Wallet, Transaction } from '@kubercoin/sdk';

// Create a new wallet
const wallet = Wallet.create();
console.log('Address:', wallet.address);
console.log('Mnemonic:', wallet.mnemonic);

// Send a transaction
const tx = await wallet.send({
  to: 'recipient-address',
  amount: 10000, // satoshis
});
console.log('TXID:', tx.txid);`} />
              <pre className="text-emerald-400">{`import { Wallet, Transaction } from '@kubercoin/sdk';

// Create a new wallet
const wallet = Wallet.create();
console.log('Address:', wallet.address);
console.log('Mnemonic:', wallet.mnemonic);

// Send a transaction
const tx = await wallet.send({
  to: 'recipient-address',
  amount: 10000, // satoshis
});
console.log('TXID:', tx.txid);`}</pre>
            </div>

            <h2 className="text-2xl font-semibold text-white mb-4">Rust</h2>
            <div className={`relative ${codePanelClass} overflow-x-auto`}>
              <CopyButton text={`use kubercoin_sdk::{Wallet, Transaction};

fn main() {
    // Create a new wallet
    let wallet = Wallet::new();
    println!("Address: {}", wallet.address());
    
    // Send a transaction
    let tx = wallet.send("recipient", 10000)?;
    println!("TXID: {}", tx.txid());
}`} />
              <pre className="text-emerald-400">{`use kubercoin_sdk::{Wallet, Transaction};

fn main() {
    // Create a new wallet
    let wallet = Wallet::new();
    println!("Address: {}", wallet.address());
    
    // Send a transaction
    let tx = wallet.send("recipient", 10000)?;
    println!("TXID: {}", tx.txid());
}`}</pre>
            </div>
          </div>
        );

      case 'mining':
        return (
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">Mining Guide</h1>
            
            <div className="glass-card p-6 mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">Requirements</h2>
              <ul className={`${bodyTextClass} space-y-2`}>
                <li>• KuberCoin node running and synced</li>
                <li>• Mining software (kubercoin-miner or compatible)</li>
                <li>• Wallet address for receiving rewards</li>
              </ul>
            </div>

            <h2 className="text-2xl font-semibold text-white mb-4">Solo Mining</h2>
            <div className={`${codePanelClass} mb-8`}>
              <span className={codeCommentClass}># Start the miner</span><br/>
              <span className="text-emerald-400">kubercoin-miner --node http://localhost:8081 \</span><br/>
              <span className="text-emerald-400">  --address your-wallet-address \</span><br/>
              <span className="text-emerald-400">  --threads 4</span>
            </div>

            <h2 className="text-2xl font-semibold text-white mb-4">Pool Mining</h2>
            <div className={codePanelClass}>
              <span className={codeCommentClass}># Connect to a pool</span><br/>
              <span className="text-emerald-400">kubercoin-miner --pool stratum+tcp://pool.kuber-coin.com:3333 \</span><br/>
              <span className="text-emerald-400">  --user your-wallet-address \</span><br/>
              <span className="text-emerald-400">  --pass x</span>
            </div>
          </div>
        );

      case 'security':
        return (
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">Security Best Practices</h1>
            
            <div className="space-y-6">
              <div className="glass-card p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">🔐</span> Wallet Security
                </h2>
                <ul className={`${bodyTextClass} space-y-3`}>
                  <li>• <strong>Backup your mnemonic</strong> - Store it offline in a secure location</li>
                  <li>• <strong>Never share private keys</strong> - No legitimate service will ask for them</li>
                  <li>• <strong>Use hardware wallets</strong> for large amounts</li>
                  <li>• <strong>Verify addresses</strong> before sending transactions</li>
                </ul>
              </div>

              <div className="glass-card p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">🛡️</span> Node Security
                </h2>
                <ul className={`${bodyTextClass} space-y-3`}>
                  <li>• <strong>Keep software updated</strong> - Apply security patches promptly</li>
                  <li>• <strong>Use API keys</strong> for authenticated endpoints</li>
                  <li>• <strong>Firewall configuration</strong> - Limit exposure of RPC ports</li>
                  <li>• <strong>Monitor for anomalies</strong> - Set up alerts for unusual activity</li>
                </ul>
              </div>

              <div className="glass-card p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">🔑</span> API Authentication
                </h2>
                <div className={codePanelCompactClass}>
                  <span className={codeCommentClass}># Include API key in requests</span><br/>
                  <span className="text-emerald-400">curl -H "X-API-Key: your-api-key" \</span><br/>
                  <span className="text-emerald-400">  https://node.kuber-coin.com/api/...</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex w-full" style={{ background: 'var(--kc-bg-gradient)' }}>
      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-72
        bg-[rgba(6,8,22,0.95)] lg:bg-[rgba(8,12,24,0.72)] backdrop-blur-2xl
        border-r border-[rgba(98,126,234,0.14)]
        transform lg:transform-none transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        z-40 lg:z-auto
      `}>
        <div className="p-6 border-b border-[rgba(98,126,234,0.14)]">
          <a href="https://kuber-coin.com" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-400 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold text-white">KuberCoin</span>
              <span className="text-sm block text-[var(--kc-accent-cyan)]">Documentation</span>
            </div>
          </a>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveSection(item.id);
                setSidebarOpen(false);
                window.location.hash = item.id;
              }}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl
                transition-all duration-200
                ${activeSection === item.id
                  ? 'border border-indigo-500/30 bg-[linear-gradient(135deg,rgba(98,126,234,0.22)_0%,rgba(89,211,255,0.1)_100%)] text-blue-300'
                  : 'text-[color:var(--kc-muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                }
              `}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[rgba(98,126,234,0.14)]">
          <a 
            href="https://github.com/kubercoin" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[color:var(--kc-muted)] hover:text-white transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </a>
        </div>
      </aside>

      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-[rgba(98,126,234,0.18)] bg-[rgba(11,16,33,0.82)] p-2 lg:hidden"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Main Content */}
      <main className="flex-1 min-h-screen p-8 lg:p-12">
        <div className="max-w-4xl">
          {renderContent()}
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
