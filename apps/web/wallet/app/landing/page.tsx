'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Divider } from '../components/Divider';
import styles from './landing.module.css';

interface NodeStats {
  online: boolean;
  blockHeight: number | null;
  mempoolSize: number | null;
  peerCount: number | null;
  network: string | null;
  version: string | null;
}

export default function LandingPage() {
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const router = useRouter();

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

  const fmt = (v: number | null | undefined, fallback = '—') =>
    v !== null && v !== undefined ? v.toLocaleString() : fallback;
  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <Badge variant="info" dot pulse>
            {nodeStats?.online ? `${nodeStats.network ?? ''} Live`.trim() : 'Connecting…'}
          </Badge>
          <h1 className={styles.heroTitle}>
            A Live View of the <span className={styles.gradient}>Kuber Network</span>
          </h1>
          <p className={styles.heroDescription}>
            This wallet app connects to a running Kuber node and surfaces the chain height,
            peer connectivity, mempool state, wallet balances, and recent activity that the
            current backend actually exposes.
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" size="lg" icon={<span>🚀</span>} onClick={() => router.push('/dashboard')}>
              Open Dashboard
            </Button>
            <Button variant="outline" size="lg" icon={<span>📖</span>} onClick={() => router.push('/ops/node')}>
              View Node Status
            </Button>
          </div>
        </div>
      </section>

      <Divider variant="gradient" />

      {/* Stats Section */}
      <section className={styles.stats}>
        <h2 className={styles.sectionTitle}>Network Statistics</h2>
        <div className={styles.statsGrid}>
          <StatCard
            icon="�"
            label="Block Height"
            value={fmt(nodeStats?.blockHeight)}
            trend={nodeStats?.online ? '🟢 Live' : '⚪ Offline'}
            variant="blue"
          />
          <StatCard
            icon="⚡"
            label="Mempool Txs"
            value={fmt(nodeStats?.mempoolSize)}
            trend={nodeStats?.online ? 'Pending' : '—'}
            variant="gold"
          />
          <StatCard
            icon="🌐"
            label="Peers"
            value={fmt(nodeStats?.peerCount)}
            trend={nodeStats?.online ? 'Connected' : '—'}
            variant="green"
          />
          <StatCard
            icon="🔧"
            label="Node Version"
            value={nodeStats?.version ?? '—'}
            trend={nodeStats?.online ? '🟢 Operational' : '🔴 Unreachable'}
            variant="purple"
          />
        </div>
      </section>

      <Divider />

      {/* Features Section */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Why Choose Kuber?</h2>
        <div className={styles.featuresGrid}>
          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>⚡</div>
              <h3 className={styles.featureTitle}>Live Chain Data</h3>
              <p className={styles.featureDescription}>
                Blocks, peers, and mempool metrics are fetched from the connected node instead of hardcoded demo snapshots.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="success" size="sm">RPC-backed</Badge>
                <Badge variant="info" size="sm">No static charts</Badge>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>🔐</div>
              <h3 className={styles.featureTitle}>Local Wallet Control</h3>
              <p className={styles.featureDescription}>
                Wallet creation, send, receive, and history views are tied to the active wallet rather than synthetic sample accounts.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="purple" size="sm">Real balances</Badge>
                <Badge variant="gold" size="sm">Active wallet</Badge>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>🌍</div>
              <h3 className={styles.featureTitle}>Observable Peer Network</h3>
              <p className={styles.featureDescription}>
                Peer counts, directions, service flags, and starting heights come from the node. Geographic reach is intentionally not guessed.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="success" size="sm">Peer info</Badge>
                <Badge variant="default" size="sm">Honest limits</Badge>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>💰</div>
              <h3 className={styles.featureTitle}>Transaction Visibility</h3>
              <p className={styles.featureDescription}>
                Recent wallet activity, mempool contents, and explorer transaction views all reflect current node state.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="gold" size="sm">Mempool</Badge>
                <Badge variant="success" size="sm">History</Badge>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>📱</div>
              <h3 className={styles.featureTitle}>Operational Views</h3>
              <p className={styles.featureDescription}>
                The wallet and explorer surfaces expose chain, fork, mempool, peer, and node health data that operators can verify directly.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="info" size="sm">Explorer</Badge>
                <Badge variant="purple" size="sm">Ops pages</Badge>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass" hoverable>
            <CardBody>
              <div className={styles.featureIcon}>🤝</div>
              <h3 className={styles.featureTitle}>Clear Scope</h3>
              <p className={styles.featureDescription}>
                Unsupported features are being removed or called out explicitly so the app matches the backend that is actually shipped.
              </p>
              <div className={styles.featureBadges}>
                <Badge variant="default" size="sm">JSON-RPC</Badge>
                <Badge variant="purple" size="sm">Protected routes</Badge>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <Divider />

      {/* Testimonials */}
      <section className={styles.testimonials}>
        <h2 className={styles.sectionTitle}>Built for Everyone</h2>
        <div className={styles.testimonialsGrid}>
          <Card variant="elevated">
            <CardBody>
              <div className={styles.testimonialStars}>⚡ Speed</div>
              <p className={styles.testimonialText}>
                Track the current block height, peer set, and mempool load from the connected node.
              </p>
              <div className={styles.testimonialAuthor}>
                <strong>Kuber Node</strong>
                <span>Regtest / Mainnet</span>
              </div>
            </CardBody>
          </Card>

          <Card variant="elevated">
            <CardBody>
              <div className={styles.testimonialStars}>🔐 Security</div>
              <p className={styles.testimonialText}>
                Inspect recent wallet activity and verify addresses, transactions, and blocks from the explorer views.
              </p>
              <div className={styles.testimonialAuthor}>
                <strong>Open Source</strong>
                <span>Auditable Rust codebase</span>
              </div>
            </CardBody>
          </Card>

          <Card variant="elevated">
            <CardBody>
              <div className={styles.testimonialStars}>👩‍💻 Developer</div>
              <p className={styles.testimonialText}>
                Use the wallet, node, and explorer pages that are already connected to current RPC and REST endpoints.
              </p>
              <div className={styles.testimonialAuthor}>
                <strong>Live interfaces</strong>
                <span>Wallet · Explorer · Node ops</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <Divider variant="gradient" />

      {/* CTA Section */}
      <section className={styles.cta}>
        <Card variant="gradient" padding="lg">
          <CardBody>
            <h2 className={styles.ctaTitle}>Ready to Get Started?</h2>
            <p className={styles.ctaDescription}>
              Open the live wallet and explorer views instead of placeholder product demos.
            </p>
            <div className={styles.ctaActions}>
              <Button variant="primary" size="lg" icon={<span>🚀</span>} onClick={() => router.push('/wallet/manage')}>
                Manage Wallets
              </Button>
              <Button variant="outline" size="lg" icon={<span>💬</span>} onClick={() => router.push('/explorer/blocks')}>
                Browse Blocks
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
