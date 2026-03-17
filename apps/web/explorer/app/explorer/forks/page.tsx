'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { StatCard } from '../../components/StatCard';
import styles from './forks.module.css';

interface ChainTip {
  hash: string;
  height: number;
  branchLength: number;
  status: 'active' | 'valid-fork' | 'orphan';
}

function tipVariant(status: ChainTip['status']): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'active':
      return 'success';
    case 'valid-fork':
      return 'warning';
    default:
      return 'danger';
  }
}

export default function ForksPage() {
  const [activeView, setActiveView] = useState('tips');
  const [chainTips, setChainTips] = useState<ChainTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sidebarItems = [
    { icon: '🏠', label: 'Explorer', href: '/dashboard' },
    { icon: '📦', label: 'Blocks', href: '/explorer/blocks' },
    { icon: '💳', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
    { icon: '🌳', label: 'Mempool', href: '/explorer/mempool' },
    { icon: '🔱', label: 'Forks', href: '/explorer/forks' },
  ];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'getchaintips', params: [], id: Date.now() }),
          cache: 'no-store',
        });
        const json = await response.json();
        if (!response.ok || json.error) {
          throw new Error(json.error?.message || `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setChainTips(
            (Array.isArray(json.result) ? json.result : []).map((tip: any) => ({
              hash: String(tip.hash || ''),
              height: Number(tip.height || 0),
              branchLength: Number(tip.branchlen || 0),
              status: tip.status === 'active' ? 'active' : tip.status === 'valid-fork' ? 'valid-fork' : 'orphan',
            })),
          );
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load chain tips');
          setChainTips([]);
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

  const activeTip = chainTips.find((tip) => tip.status === 'active');
  const competingTips = chainTips.filter((tip) => tip.status === 'valid-fork');
  const orphanTips = chainTips.filter((tip) => tip.status === 'orphan');
  const maxBranchLength = Math.max(0, ...chainTips.map((tip) => tip.branchLength));

  const derivedReorgs = useMemo(() => {
    return competingTips.map((tip, index) => ({
      id: index + 1,
      depth: tip.branchLength,
      fromBlock: activeTip?.hash || '',
      toBlock: tip.hash,
    }));
  }, [activeTip, competingTips]);

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Fork & Reorg Monitor</h1>
            <p className={styles.subtitle}>Live chain-tip view from node RPC</p>
          </div>
          <div className={styles.viewToggle}>
            <Button variant={activeView === 'tips' ? 'primary' : 'outline'} onClick={() => setActiveView('tips')}>Chain Tips</Button>
            <Button variant={activeView === 'reorgs' ? 'primary' : 'outline'} onClick={() => setActiveView('reorgs')}>Derived Reorgs</Button>
            <Button variant={activeView === 'viz' ? 'primary' : 'outline'} onClick={() => setActiveView('viz')}>Summary</Button>
          </div>
        </header>

        <div className={styles.statsGrid}>
          <StatCard label="Active Chain Tip" value={activeTip ? `#${activeTip.height}` : '--'} trend={activeTip ? activeTip.hash.slice(0, 16) : 'No data'} icon="⛓️" variant="blue" />
          <StatCard label="Competing Tips" value={competingTips.length.toString()} trend={competingTips.length > 0 ? 'Valid alternative chains' : 'Single active branch'} icon="🔱" variant="gold" />
          <StatCard label="Orphaned Tips" value={orphanTips.length.toString()} trend={orphanTips.length > 0 ? 'Stale branches detected' : 'No orphaned tips'} icon="💀" variant="green" />
          <StatCard label="Max Branch Length" value={maxBranchLength.toString()} trend="Blocks from active tip" icon="📊" variant="purple" />
        </div>

        {error ? <div className={styles.emptyState}>{error}</div> : null}

        {activeView === 'tips' ? (
          <Card variant="glass">
            <CardHeader><h3>Competing Chain Tips</h3></CardHeader>
            <CardBody>
              <div className={styles.tipsContainer}>
                {loading ? <div className={styles.emptyState}>Loading chain tips...</div> : chainTips.length === 0 ? <div className={styles.emptyState}>No chain tip data available.</div> : chainTips.map((tip) => (
                  <div key={tip.hash} className={`${styles.tipCard} ${styles[tip.status]}`}>
                    <div className={styles.tipHeader}>
                      <div>
                        <Badge variant={tipVariant(tip.status)} size="lg">{tip.status}</Badge>
                        <span className={styles.tipHeight}>Block #{tip.height}</span>
                      </div>
                      <Badge variant="info">branch {tip.branchLength}</Badge>
                    </div>
                    <div className={styles.tipDetails}>
                      <div className={styles.detailRow}><span>Hash:</span><code className={styles.hash}>{tip.hash.slice(0, 20)}...{tip.hash.slice(-12)}</code></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {activeView === 'reorgs' ? (
          <Card variant="glass">
            <CardHeader><h3>Derived Reorg Candidates</h3></CardHeader>
            <CardBody>
              <div className={styles.reorgList}>
                {derivedReorgs.length === 0 ? <div className={styles.emptyState}>No competing live branches to report.</div> : derivedReorgs.map((reorg) => (
                  <div key={reorg.id} className={styles.reorgCard}>
                    <div className={styles.reorgHeader}>
                      <Badge variant="warning" size="lg">Branch #{reorg.id}</Badge>
                      <Badge variant="warning">Depth {reorg.depth}</Badge>
                    </div>
                    <div className={styles.reorgDetails}>
                      <div className={styles.reorgRow}><span className={styles.reorgLabel}>Active Tip</span><code className={styles.reorgHash}>{reorg.fromBlock.slice(0, 16)}...{reorg.fromBlock.slice(-8)}</code></div>
                      <div className={styles.reorgArrow}>↓</div>
                      <div className={styles.reorgRow}><span className={styles.reorgLabel}>Fork Tip</span><code className={styles.reorgHash}>{reorg.toBlock.slice(0, 16)}...{reorg.toBlock.slice(-8)}</code></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {activeView === 'viz' ? (
          <Card variant="glass">
            <CardHeader><h3>Fork Detection Status</h3></CardHeader>
            <CardBody>
              <div className={styles.statusGrid}>
                <div className={styles.statusItem}><Badge variant={chainTips.length > 0 ? 'success' : 'default'}>{chainTips.length > 0 ? '✓' : '-'}</Badge><div><strong>Chain Monitoring</strong><p>{chainTips.length > 0 ? 'Live chain tips loaded from node RPC' : 'No data'}</p></div></div>
                <div className={styles.statusItem}><Badge variant={competingTips.length > 0 ? 'warning' : 'success'}>{competingTips.length > 0 ? '!' : '✓'}</Badge><div><strong>Fork Presence</strong><p>{competingTips.length > 0 ? 'Competing branches currently visible' : 'Single active branch'}</p></div></div>
                <div className={styles.statusItem}><Badge variant={orphanTips.length > 0 ? 'warning' : 'success'}>{orphanTips.length > 0 ? '!' : '✓'}</Badge><div><strong>Orphan Detection</strong><p>{orphanTips.length > 0 ? 'Orphaned tips present in chain-tip index' : 'No orphaned tips reported'}</p></div></div>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
}