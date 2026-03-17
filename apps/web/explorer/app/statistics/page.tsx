'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Tabs } from '../components/Tabs';
import { Badge } from '../components/Badge';
import { Dropdown } from '../components/Dropdown';
import { Table, TableColumn } from '../components/Table';
import { formatCompactNumber, formatPercentage } from '../utils/formatters';
import styles from './statistics.module.css';

interface TopAddress {
  address: string;
  balance: number;
  percentage: number;
  rank: number;
}

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔍', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '💰', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
  ];

  useEffect(() => {
    let cancelled = false;

    const rpcCall = async (method: string, params: unknown[] = []) => {
      const response = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || json.error) {
        throw new Error(json.error?.message || `HTTP ${response.status}`);
      }
      return json.result;
    };

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [chain, mempool, network, height] = await Promise.all([
          rpcCall('getblockchaininfo'),
          rpcCall('getmempoolinfo'),
          rpcCall('getnetworkinfo'),
          rpcCall('getblockcount'),
        ]);
        const recentHeights = Array.from({ length: Math.min(10, Number(height) + 1) }, (_, index) => Number(height) - index);
        const recentBlocks = await Promise.all(
          recentHeights.map(async (blockHeight) => {
            const hash = await rpcCall('getblockhash', [blockHeight]);
            return rpcCall('getblock', [hash, 1]);
          }),
        );
        if (!cancelled) {
          setSnapshot({ chain, mempool, network, height, recentBlocks });
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load live statistics');
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
  }, [timeRange]);

  const topAddresses: TopAddress[] = useMemo(() => {
    const blocks = snapshot?.recentBlocks || [];
    const totals = new Map<string, number>();
    for (const block of blocks) {
      const miner = String(block.miner || 'unknown');
      totals.set(miner, (totals.get(miner) || 0) + Number(block.reward || 0));
    }
    const totalRewards = Array.from(totals.values()).reduce((sum, value) => sum + value, 0) || 1;
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([address, balance], index) => ({
        address,
        balance,
        percentage: balance / totalRewards,
        rank: index + 1,
      }));
  }, [snapshot]);

  const addressColumns: TableColumn<TopAddress>[] = [
    {
      key: 'rank',
      header: '#',
      width: '10%',
      render: (value: number) => <Badge variant={value === 1 ? 'warning' : 'default'}>{value}</Badge>,
    },
    {
      key: 'address',
      header: 'Recipient',
      width: '45%',
      render: (value: string) => <span className={styles.address}>{value}</span>,
    },
    {
      key: 'balance',
      header: 'Recent Rewards',
      width: '25%',
      render: (value: number) => <span className={styles.balance}>{formatCompactNumber(value)} KBR</span>,
    },
    {
      key: 'percentage',
      header: 'Share',
      width: '20%',
      render: (value: number) => <Badge variant="info">{formatPercentage(value)}</Badge>,
    },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Blockchain Statistics</h1>
            <p className={styles.subtitle}>{error || (loading ? 'Loading live network statistics...' : 'Live network snapshot from recent blocks and node RPC')}</p>
          </div>
          <Dropdown
            options={[
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
              { value: '90d', label: 'Last 90 Days' },
              { value: '1y', label: 'Last Year' },
              { value: 'all', label: 'All Time' },
            ]}
            value={timeRange}
            onChange={(value) => setTimeRange(value)}
          />
        </header>

        <div className={styles.statsGrid}>
          <StatCard title="Total Supply" value={snapshot ? formatCompactNumber((Number(snapshot.height) + 1) * 50) : '--'} subtitle="Estimated from current block count" icon="🪙" iconBg="rgba(168, 85, 247, 0.1)" />
          <StatCard title="Blocks Indexed" value={snapshot ? formatCompactNumber(snapshot.chain?.blocks || 0) : '--'} subtitle={snapshot?.chain?.chain || 'No data'} icon="📦" iconBg="rgba(96, 165, 250, 0.1)" />
          <StatCard title="Mempool Size" value={snapshot ? formatCompactNumber(snapshot.mempool?.size || 0) : '--'} subtitle={`${formatCompactNumber(snapshot?.mempool?.bytes || 0)} bytes`} icon="📊" iconBg="rgba(34, 197, 94, 0.1)" />
          <StatCard title="Connected Peers" value={snapshot ? formatCompactNumber(snapshot.network?.connections || 0) : '--'} subtitle={`${snapshot?.network?.connections_in || 0} in / ${snapshot?.network?.connections_out || 0} out`} icon="🌐" iconBg="rgba(251, 146, 60, 0.1)" />
        </div>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'mining', label: 'Mining', icon: '⛏️' },
                { id: 'distribution', label: 'Distribution', icon: '🎯' },
                { id: 'richlist', label: 'Recent Recipients', icon: '👑' },
              ]}
              defaultTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId)}
              variant="underline"
            />

            {activeTab === 'overview' ? (
              <div className={styles.metricsGrid}>
                <div className={styles.metric}><span className={styles.metricLabel}>Best Block Hash</span><span className={styles.metricValue}>{String(snapshot?.chain?.bestblockhash || '--').slice(0, 16)}...</span><Badge variant="success">Live</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Chain Work</span><span className={styles.metricValue}>{String(snapshot?.chain?.chainwork || '--').slice(-12).toUpperCase()}</span><Badge variant="info">Live</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Network Active</span><span className={styles.metricValue}>{snapshot?.network?.networkactive ? 'Yes' : 'No'}</span><Badge variant={snapshot?.network?.networkactive ? 'success' : 'warning'}>{snapshot?.network?.networkactive ? 'Active' : 'Inactive'}</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Recent Blocks Loaded</span><span className={styles.metricValue}>{snapshot?.recentBlocks?.length ?? '--'}</span><Badge variant="info">Sample window</Badge></div>
              </div>
            ) : null}

            {activeTab === 'mining' ? (
              <div className={styles.metricsGrid}>
                <div className={styles.metric}><span className={styles.metricLabel}>Latest Difficulty</span><span className={styles.metricValue}>{snapshot?.recentBlocks?.[0]?.difficulty ?? '--'}</span><Badge variant="success">Latest block</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Latest Reward</span><span className={styles.metricValue}>{snapshot?.recentBlocks?.[0]?.reward ?? '--'}</span><Badge variant="success">Coinbase</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Latest Miner</span><span className={styles.metricValue}>{snapshot?.recentBlocks?.[0]?.miner ?? '--'}</span><Badge variant="info">Producer</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Recent Block Count</span><span className={styles.metricValue}>{snapshot?.recentBlocks?.length ?? '--'}</span><Badge variant="info">Loaded sample</Badge></div>
              </div>
            ) : null}

            {activeTab === 'distribution' ? (
              <div className={styles.metricsGrid}>
                <div className={styles.metric}><span className={styles.metricLabel}>Inbound Peers</span><span className={styles.metricValue}>{snapshot?.network?.connections_in ?? '--'}</span><Badge variant="info">Connections</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Outbound Peers</span><span className={styles.metricValue}>{snapshot?.network?.connections_out ?? '--'}</span><Badge variant="info">Connections</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Protocol Version</span><span className={styles.metricValue}>{snapshot?.network?.protocolversion ?? '--'}</span><Badge variant="success">Live</Badge></div>
                <div className={styles.metric}><span className={styles.metricLabel}>Chain Name</span><span className={styles.metricValue}>{snapshot?.chain?.chain ?? '--'}</span><Badge variant="success">Live</Badge></div>
              </div>
            ) : null}

            {activeTab === 'richlist' ? (
              <div className={styles.tableSection}>
                <h3 className={styles.chartTitle}>Top Recent Reward Recipients</h3>
                <Table columns={addressColumns} data={topAddresses} hoverable loading={loading} emptyMessage={error || 'No live recipient data available'} />
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
