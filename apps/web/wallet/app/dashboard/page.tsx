'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { LineChart } from '../components/LineChart';
import api from '../../src/services/api';
import walletService, { WalletInfo, WalletTransactionRecord } from '../../src/services/wallet';

type DashboardSnapshot = {
  wallet: WalletInfo | null;
  transactions: WalletTransactionRecord[];
  blockchain: Awaited<ReturnType<typeof api.getBlockchainInfo>>;
  network: Awaited<ReturnType<typeof api.getNetworkInfo>>;
  mempool: Awaited<ReturnType<typeof api.getMempoolInfo>>;
};

function formatAmount(value: number) {
  return `${value.toFixed(8)} KBR`;
}

function formatTime(timestamp?: number) {
  if (!timestamp) return 'Pending';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
  return `${Math.floor(diffMinutes / 1440)}d ago`;
}

function buildBalanceSeries(transactions: WalletTransactionRecord[], currentBalance: number) {
  if (transactions.length === 0) {
    return [{ label: 'Now', value: Number(currentBalance.toFixed(8)) }];
  }

  const sorted = [...transactions]
    .filter((tx) => tx.timestamp)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (sorted.length === 0) {
    return [{ label: 'Now', value: Number(currentBalance.toFixed(8)) }];
  }

  let runningBalance = currentBalance;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const tx = sorted[index];
    runningBalance -= tx.type === 'received' ? tx.amount : -tx.amount;
  }

  const points = sorted.map((tx) => {
    runningBalance += tx.type === 'received' ? tx.amount : -tx.amount;
    return {
      label: tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : tx.txid.slice(0, 6),
      value: Number(runningBalance.toFixed(8)),
    };
  });

  return points.slice(-12);
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const initialWallet = walletService.getActiveWallet();
        if (initialWallet) {
          await walletService.updateWalletBalance(initialWallet.address);
        }

        const wallet = walletService.getActiveWallet();
        const [transactions, blockchain, network, mempool] = await Promise.all([
          wallet ? walletService.getTransactionHistory(wallet.address, 12) : Promise.resolve([]),
          api.getBlockchainInfo(),
          api.getNetworkInfo(),
          api.getMempoolInfo(),
        ]);

        if (!cancelled) {
          setSnapshot({ wallet, transactions, blockchain, network, mempool });
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load dashboard data');
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sidebarItems = [
    { icon: '📊', label: 'Dashboard', href: '/dashboard' },
    { icon: '📈', label: 'Market', href: '/charts' },
    { icon: '💼', label: 'Portfolio', href: '/wallet/utxos' },
    { icon: '🔄', label: 'Transactions', href: '/transactions' },
    { icon: '📡', label: 'Node', href: '/ops/node' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const recentTransactions = snapshot?.transactions.slice(0, 6) || [];
  const currentWallet = snapshot?.wallet || null;
  const chartData = useMemo(() => buildBalanceSeries(snapshot?.transactions || [], currentWallet?.balance || 0), [snapshot, currentWallet]);
  const periodReceived = useMemo(
    () => recentTransactions.filter((tx) => tx.type === 'received').reduce((sum, tx) => sum + tx.amount, 0),
    [recentTransactions],
  );
  const periodSent = useMemo(
    () => recentTransactions.filter((tx) => tx.type === 'sent').reduce((sum, tx) => sum + tx.amount, 0),
    [recentTransactions],
  );

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#fff', fontSize: '2rem', fontWeight: 700 }}>Wallet Dashboard</h1>
            <p style={{ margin: '0.5rem 0 0', color: 'rgba(255,255,255,0.65)' }}>Live wallet snapshot and current node status</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/wallet/manage"><Button variant="outline">Manage Wallets</Button></Link>
            <Link href="/wallet/send"><Button variant="primary">Send Funds</Button></Link>
          </div>
        </header>

        {error ? <div style={{ color: '#ef4444' }}>{error}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <Card variant="glass"><CardBody><div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>Active Wallet</div><div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>{currentWallet?.label || 'No wallet selected'}</div><div style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.35rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{currentWallet?.address || 'Create or import a wallet to see live balance data'}</div></CardBody></Card>
          <Card variant="glass"><CardBody><div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>Confirmed Balance</div><div style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>{currentWallet ? formatAmount(currentWallet.balance) : '--'}</div><div style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.35rem' }}>Unconfirmed: {currentWallet ? formatAmount(currentWallet.unconfirmedBalance) : '--'}</div></CardBody></Card>
          <Card variant="glass"><CardBody><div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>Chain Height</div><div style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>{snapshot?.blockchain.blocks?.toLocaleString() || '--'}</div><div style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.35rem' }}>{snapshot?.blockchain.chain || 'Unknown chain'}</div></CardBody></Card>
          <Card variant="glass"><CardBody><div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>Network</div><div style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>{snapshot?.network.connections ?? '--'} peers</div><div style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.35rem' }}>Mempool: {snapshot?.mempool.size ?? '--'} txs</div></CardBody></Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '1.5rem' }}>
          <Card variant="glass">
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Balance History</h2>
                  <p style={{ margin: '0.35rem 0 0', color: 'rgba(255,255,255,0.6)' }}>Derived from live wallet transactions</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Badge variant="success">Received {formatAmount(periodReceived)}</Badge>
                  <Badge variant="warning">Sent {formatAmount(periodSent)}</Badge>
                </div>
              </div>
              {loading ? <div style={{ color: 'rgba(255,255,255,0.65)' }}>Loading chart...</div> : <LineChart data={chartData} height={240} animated color="#8B5CF6" />}
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Quick Actions</h2>
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                <Link href="/wallet/receive"><Button variant="outline" fullWidth>Receive Funds</Button></Link>
                <Link href="/wallet/history"><Button variant="outline" fullWidth>View History</Button></Link>
                <Link href="/ops/node"><Button variant="outline" fullWidth>Inspect Node</Button></Link>
                <Link href="/explorer/mempool"><Button variant="outline" fullWidth>Open Mempool</Button></Link>
              </div>
            </CardBody>
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
          <Card variant="glass">
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Recent Wallet Activity</h2>
                <Link href="/wallet/history" style={{ color: '#8B5CF6', textDecoration: 'none' }}>Full history</Link>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {recentTransactions.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,0.6)' }}>No live wallet transactions available.</div>
                ) : recentTransactions.map((tx) => (
                  <div key={tx.txid} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.9rem 1rem', background: 'rgba(0,0,0,0.18)', borderRadius: '10px' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{tx.type === 'received' ? 'Received' : tx.type === 'sent' ? 'Sent' : 'Other'}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{tx.txid.slice(0, 18)}...{tx.txid.slice(-8)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: tx.type === 'received' ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{tx.type === 'received' ? '+' : '-'}{formatAmount(tx.amount)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{formatTime(tx.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Node Snapshot</h2>
              <div style={{ display: 'grid', gap: '0.9rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}><span style={{ color: 'rgba(255,255,255,0.6)' }}>Best Block</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{snapshot?.blockchain.bestblockhash?.slice(0, 12) || '--'}...</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}><span style={{ color: 'rgba(255,255,255,0.6)' }}>Verification</span><span style={{ color: '#fff' }}>{snapshot ? `${(snapshot.blockchain.verificationprogress * 100).toFixed(2)}%` : '--'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}><span style={{ color: 'rgba(255,255,255,0.6)' }}>Inbound / Outbound</span><span style={{ color: '#fff' }}>{snapshot?.network.connections_in ?? '--'} / {snapshot?.network.connections_out ?? '--'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.6)' }}>Warnings</span><span style={{ color: '#fff', maxWidth: '60%', textAlign: 'right' }}>{snapshot?.blockchain.warnings || snapshot?.network.warnings || 'None'}</span></div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
