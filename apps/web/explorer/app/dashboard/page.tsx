'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button as PreludeButton, HeroSection, StatCard as PreludeStatCard } from '@kubercoin/ui';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { Search } from '../components/Search';
import { Divider } from '../components/Divider';
import styles from './dashboard.module.css';

type RecentBlock = {
  height: number;
  hash: string;
  txCount: number;
  miner: string;
};

export default function ExplorerDashboard() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
        const recentBlocks: RecentBlock[] = await Promise.all(
          Array.from({ length: Math.min(8, Number(height) + 1) }, async (_, index) => {
            const blockHeight = Number(height) - index;
            const hash = await rpcCall('getblockhash', [blockHeight]);
            const block = await rpcCall('getblock', [hash, 1]);
            return {
              height: blockHeight,
              hash,
              txCount: Array.isArray(block.tx) ? block.tx.length : Number(block.nTx || 0),
              miner: String(block.miner || 'unknown'),
            };
          }),
        );

        if (!cancelled) {
          setSnapshot({ chain, mempool, network, recentBlocks });
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load dashboard');
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
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔍', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
    { icon: '🌳', label: 'Mempool', href: '/explorer/mempool' },
  ];

  const blockHeightData = useMemo(
    () => (snapshot?.recentBlocks || []).slice().reverse().map((block: RecentBlock) => ({ label: `#${block.height}`, value: block.height })),
    [snapshot],
  );
  const txVolumeData = useMemo(
    () => (snapshot?.recentBlocks || []).slice().reverse().map((block: RecentBlock) => ({ label: `#${block.height}`, value: block.txCount })),
    [snapshot],
  );
  const blockDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of snapshot?.recentBlocks || []) {
      counts.set(block.miner, (counts.get(block.miner) || 0) + 1);
    }
    const colors = ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6'];
    return Array.from(counts.entries()).map(([label, value], index) => ({ label, value, color: colors[index % colors.length] }));
  }, [snapshot]);

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <HeroSection
          eyebrow={loading ? 'Loading explorer dashboard' : error ? 'Explorer data partially available' : 'Kuber explorer dashboard live'}
          title={<>Read the <span>network pulse</span> before drilling into charts.</>}
          description={<>This dashboard route now begins with a public-facing prelude that frames recent blocks, node connectivity, and mempool movement before the denser dashboard panels take over.</>}
          actions={
            <>
              <PreludeButton variant="primary" size="lg" onClick={() => router.push('/')}>Open Explorer Home</PreludeButton>
              <PreludeButton variant="secondary" size="lg" onClick={() => router.push('/blocks')}>Browse Blocks</PreludeButton>
              <PreludeButton variant="ghost" size="lg" onClick={() => router.push('/statistics')}>See Statistics</PreludeButton>
            </>
          }
          stats={
            <>
              <PreludeStatCard label="Block Height" value={snapshot?.chain?.blocks?.toLocaleString() || '--'} change={snapshot?.chain?.chain || 'Chain pending'} changeType={error ? 'negative' : 'positive'} icon={<CubeIcon />} />
              <PreludeStatCard label="Mempool" value={snapshot?.mempool?.size?.toLocaleString() || '--'} change="Pending transactions" changeType="neutral" icon={<PulseIcon />} />
              <PreludeStatCard label="Peers" value={snapshot?.network?.connections?.toLocaleString() || '--'} change={`${snapshot?.network?.connections_in || 0} in / ${snapshot?.network?.connections_out || 0} out`} changeType="positive" icon={<PeerIcon />} />
              <PreludeStatCard label="Recent Blocks" value={snapshot?.recentBlocks?.length || '--'} change="Current dashboard sample" changeType="neutral" icon={<BlockIcon />} />
            </>
          }
          illustration={<DashboardArt />}
          className="mb-10"
        />

        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Blockchain Explorer</h1>
            <p className={styles.subtitle}>Live node snapshot and recent chain activity</p>
          </div>
          {loading ? <Badge variant="info">Loading</Badge> : <Badge variant={error ? 'warning' : 'success'}>{error ? 'Partial' : 'Live'}</Badge>}
        </header>

        <section className={styles.search}>
          <Search placeholder="Search blocks, transactions, addresses..." suggestions={[]} />
        </section>

        {error ? <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div> : null}

        <section className={styles.statsGrid}>
          <StatCard icon="📦" label="Block Height" value={snapshot?.chain?.blocks?.toLocaleString() || '--'} trend={snapshot?.chain?.chain || 'No data'} variant="blue" />
          <StatCard icon="⚡" label="Recent Avg TX/Block" value={snapshot?.recentBlocks?.length ? Math.round(snapshot.recentBlocks.reduce((sum: number, block: RecentBlock) => sum + block.txCount, 0) / snapshot.recentBlocks.length).toString() : '--'} trend="Recent sample" variant="gold" />
          <StatCard icon="🔄" label="Mempool" value={snapshot?.mempool?.size?.toLocaleString() || '--'} trend={`${snapshot?.mempool?.bytes || 0} bytes`} variant="purple" />
          <StatCard icon="👥" label="Active Nodes" value={snapshot?.network?.connections?.toLocaleString() || '--'} trend={`${snapshot?.network?.connections_in || 0} in / ${snapshot?.network?.connections_out || 0} out`} variant="green" />
        </section>

        <div className={styles.grid}>
          <Card variant="glass">
            <CardBody>
              <div className={styles.cardHeader}>
                <h3>Recent Height Progression</h3>
                <Badge variant="success">Live blocks</Badge>
              </div>
              <LineChart data={blockHeightData} height={200} animated />
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <div className={styles.cardHeader}>
                <h3>Recent Block Producers</h3>
                <Badge variant="info">Recent sample</Badge>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                {blockDistribution.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.65)' }}>No recent producer data available.</div> : blockDistribution.map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: item.color, display: 'inline-block' }} />
                      <span>{item.label}</span>
                    </div>
                    <Badge variant="info">{item.value}</Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <Card variant="glass">
          <CardBody>
            <div className={styles.cardHeader}>
              <h3>Recent Transaction Counts</h3>
              <Badge variant="success">Block sample</Badge>
            </div>
            <Divider />
            <BarChart data={txVolumeData} height={280} animated />
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}

function CubeIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}

function PulseIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
}

function PeerIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m9 9H3" /></svg>;
}

function BlockIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10v10H7V7zm-4 4h2m14 0h2M11 3v2m0 14v2m6-14l1.5-1.5M5.5 18.5L7 17" /></svg>;
}

function DashboardArt() {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(239,247,245,0.95)_100%)]">
      <div className="absolute left-10 top-10 h-24 w-24 rounded-full bg-[rgba(113,199,174,0.24)] blur-2xl" />
      <div className="absolute right-12 bottom-12 h-28 w-28 rounded-full bg-[rgba(196,156,255,0.22)] blur-2xl" />
      <div className="absolute inset-x-10 bottom-10 top-24 rounded-[28px] border border-[rgba(124,140,255,0.14)] bg-white/84" />
      <div className="absolute left-16 top-16 h-18 w-18 rounded-full border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute right-16 top-18 h-16 w-36 rounded-[18px] border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute left-16 bottom-16 h-24 w-40 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(113,199,174,0.22)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="absolute right-20 bottom-16 h-32 w-24 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(114,119,255,0.16)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#71c7ae_0%,#8fdac6_100%)] text-white shadow-[0_22px_48px_rgba(76,166,140,0.24)]">
          <CubeIcon />
        </div>
        <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">
          Explorer dashboard prelude
        </div>
      </div>
    </div>
  );
}
