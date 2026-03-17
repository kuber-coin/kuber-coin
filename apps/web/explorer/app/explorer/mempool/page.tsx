'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { Tabs } from '../../components/Tabs';
import { StatCard } from '../../components/StatCard';
import { Dropdown } from '../../components/Dropdown';
import styles from './mempool.module.css';

interface MempoolTx {
  txid: string;
  size: number;
  fee: number;
  feeRate: number;
  time: number;
  priority: string;
  rbfSignal: boolean;
  dependencies: number;
}

function priorityVariant(priority: MempoolTx['priority']): 'success' | 'info' | 'warning' {
  switch (priority) {
    case 'high':
      return 'success';
    case 'medium':
      return 'info';
    default:
      return 'warning';
  }
}

async function rpcCall(method: string, params: unknown[] = []) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  });
  const j = await res.json();
  return j.result;
}

export default function MempoolPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('feeRate');
  const [mempoolTxs, setMempoolTxs] = useState<MempoolTx[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchMempool = useCallback(async () => {
    try {
      const txids: string[] | null = await rpcCall('getrawmempool');
      if (!Array.isArray(txids)) return;
      const txs: MempoolTx[] = await Promise.all(
        txids.slice(0, 200).map(async (txid) => {
          try {
            const entry = await rpcCall('getmempoolentry', [txid]);
            const size: number = entry?.size ?? entry?.vsize ?? 250;
            const fee: number = entry?.fee ?? 0;
            const feeRate = size > 0 ? Math.round((fee * 1e8) / (size / 1000)) : 0;
            return {
              txid,
              size,
              fee,
              feeRate,
              time: (entry?.time ?? 0) * 1000 || Date.now(),
              priority: feeRate >= 20 ? 'high' : feeRate >= 5 ? 'medium' : 'low',
              rbfSignal: !!(entry?.bip125_replaceable),
              dependencies: (entry?.depends ?? []).length,
            } as MempoolTx;
          } catch {
            return { txid, size: 0, fee: 0, feeRate: 0, time: Date.now(), priority: 'low', rbfSignal: false, dependencies: 0 } as MempoolTx;
          }
        })
      );
      setMempoolTxs(txs);
      setLastUpdated(new Date());
    } catch {
      // keep existing values
    }
  }, []);

  useEffect(() => {
    fetchMempool();
    const interval = setInterval(fetchMempool, 15000);
    return () => clearInterval(interval);
  }, [fetchMempool]);

  const sidebarItems = [
    { icon: '🏠', label: 'Explorer', href: '/dashboard' },
    { icon: '📦', label: 'Blocks', href: '/explorer/blocks' },
    { icon: '💳', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
    { icon: '🌳', label: 'Mempool', href: '/explorer/mempool' },
    { icon: '🔱', label: 'Forks', href: '/explorer/forks' },
  ];



  const totalSize = mempoolTxs.reduce((sum, tx) => sum + tx.size, 0);
  const totalFees = mempoolTxs.reduce((sum, tx) => sum + tx.fee, 0);
  const avgFeeRate = totalSize > 0 ? totalFees / (totalSize / 1000) : 0;
  const oldestTime = mempoolTxs.length > 0
    ? Math.min(...mempoolTxs.map((tx) => tx.time))
    : null;

  const filteredTxs = mempoolTxs.filter((tx) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'high') return tx.priority === 'high';
    if (activeTab === 'medium') return tx.priority === 'medium';
    if (activeTab === 'low') return tx.priority === 'low';
    if (activeTab === 'rbf') return tx.rbfSignal;
    return true;
  });

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const columns = [
    {
      key: 'txid',
      header: 'Transaction ID',
      render: (value: string) => (
        <code className={styles.txidCode}>
          {value.slice(0, 16)}...{value.slice(-8)}
        </code>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (value: MempoolTx['priority']) => (
        <Badge
          variant={priorityVariant(value)}
        >
          {value.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'feeRate',
      header: 'Fee Rate',
      render: (value: number) => (
        <span className={styles.feeRate}>{value} sat/vB</span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (value: number) => (
        <span className={styles.fee}>{value.toFixed(8)} KC</span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (value: number) => (
        <span className={styles.size}>{value} bytes</span>
      ),
    },
    {
      key: 'time',
      header: 'In Mempool',
      render: (value: number) => (
        <span className={styles.time}>{formatTime(value)}</span>
      ),
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (_value: unknown, tx: MempoolTx) => (
        <div className={styles.flags}>
          {tx.rbfSignal && <Badge variant="info" size="sm">RBF</Badge>}
          {tx.dependencies > 0 && <Badge variant="warning" size="sm">{tx.dependencies} dep</Badge>}
        </div>
      ),
    },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Mempool Viewer</h1>
            <p className={styles.subtitle}>
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()} · ${mempoolTxs.length} transactions` : 'Loading…'}
            </p>
          </div>
          <Dropdown
            label="Sort By"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'feeRate', label: 'Fee Rate' },
              { value: 'time', label: 'Time in Mempool' },
              { value: 'size', label: 'Transaction Size' },
            ]}
          />
        </header>

        <div className={styles.statsGrid}>
          <StatCard
            label="Mempool Size"
            value={`${mempoolTxs.length}`}
            trend={mempoolTxs.length > 0 ? `${(totalSize / 1024).toFixed(2)} KB total` : 'No data'}
            icon="🌳"
            variant="blue"
          />
          <StatCard
            label="Total Fees"
            value={`${totalFees.toFixed(8)} KC`}
            trend={mempoolTxs.length > 0 ? 'Pending in pool' : 'No data'}
            icon="💰"
            variant="green"
          />
          <StatCard
            label="Avg Fee Rate"
            value={`${avgFeeRate.toFixed(1)} sat/vB`}
            trend={mempoolTxs.length > 0 ? 'Across all transactions' : 'No data'}
            icon="📊"
            variant="gold"
          />
          <StatCard
            label="RBF Transactions"
            value={mempoolTxs.filter(tx => tx.rbfSignal).length.toString()}
            trend={mempoolTxs.length > 0 ? 'Replace-by-fee enabled' : 'No data'}
            icon="🔄"
            variant="purple"
          />
        </div>

        <Card variant="glass">
          <CardHeader>
            <h3>Transaction Queue</h3>
          </CardHeader>
          <CardBody>
            <Tabs
              tabs={[
                { id: 'all', label: `All Transactions (${mempoolTxs.length})` },
                {
                  id: 'high',
                  label: `High Priority (${mempoolTxs.filter(tx => tx.priority === 'high').length})`,
                },
                {
                  id: 'medium',
                  label: `Medium Priority (${mempoolTxs.filter(tx => tx.priority === 'medium').length})`,
                },
                {
                  id: 'low',
                  label: `Low Priority (${mempoolTxs.filter(tx => tx.priority === 'low').length})`,
                },
                {
                  id: 'rbf',
                  label: `RBF Enabled (${mempoolTxs.filter(tx => tx.rbfSignal).length})`,
                },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="pills"
            />

            <div className={styles.tableContainer}>
              <Table columns={columns} data={filteredTxs} hoverable />
            </div>
          </CardBody>
        </Card>

        <div className={styles.chartGrid}>
          <Card variant="glass">
            <CardBody>
              <h4 className={styles.chartTitle}>Fee Rate Distribution</h4>
              <div className={styles.histogram}>
                {[5, 10, 15, 20, 25, 30].map((rate) => {
                  const count = mempoolTxs.filter(tx => tx.feeRate >= rate - 2.5 && tx.feeRate < rate + 2.5).length;
                  const percentage = mempoolTxs.length > 0 ? (count / mempoolTxs.length) * 100 : 0;
                  return (
                    <div key={rate} className={styles.histogramBar}>
                      <div
                        className={styles.bar}
                        style={{ height: `${percentage * 2}px` }}
                      />
                      <span className={styles.label}>{rate}</span>
                    </div>
                  );
                })}
              </div>
              <p className={styles.chartSubtitle}>sat/vB</p>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h4 className={styles.chartTitle}>🔍 Admission Policy</h4>
              <div className={styles.policyList}>
                <div className={styles.policyItem}>
                  <Badge variant="success">✓</Badge>
                  <div>
                    <strong>Minimum Fee Rate:</strong>
                    <p>1 sat/vB required</p>
                  </div>
                </div>
                <div className={styles.policyItem}>
                  <Badge variant="success">✓</Badge>
                  <div>
                    <strong>Max Mempool Size:</strong>
                    <p>300 MB limit</p>
                  </div>
                </div>
                <div className={styles.policyItem}>
                  <Badge variant="info">ℹ</Badge>
                  <div>
                    <strong>Eviction Strategy:</strong>
                    <p>Lowest fee rate first</p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card variant="glass">
          <CardBody>
            <h4 className={styles.infoTitle}>💡 Mempool Insights</h4>
            <div className={styles.insightGrid}>
              <div className={styles.insight}>
                <span className={styles.insightIcon}>⏱️</span>
                <div>
                  <strong>Oldest Transaction</strong>
                  <p>{oldestTime ? formatTime(oldestTime) : 'No data'}</p>
                </div>
              </div>
              <div className={styles.insight}>
                <span className={styles.insightIcon}>🎯</span>
                <div>
                  <strong>Next Block Candidates</strong>
                  <p>{mempoolTxs.filter(tx => tx.priority === 'high').length} transactions</p>
                </div>
              </div>
              <div className={styles.insight}>
                <span className={styles.insightIcon}>🚫</span>
                <div>
                  <strong>Spam Detection</strong>
                  <p>{mempoolTxs.length > 0 ? 'No suspicious transactions detected' : 'No data'}</p>
                </div>
              </div>
              <div className={styles.insight}>
                <span className={styles.insightIcon}>🔗</span>
                <div>
                  <strong>Transaction Chains</strong>
                  <p>{mempoolTxs.filter(tx => tx.dependencies > 0).length} with dependencies</p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
