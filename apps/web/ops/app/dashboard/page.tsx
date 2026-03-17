'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button as PreludeButton, HeroSection, StatCard as PreludeStatCard } from '@kubercoin/ui';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { Input } from '../components/Input';
import { Checkbox } from '../components/Checkbox';
import { Avatar } from '../components/Avatar';
import { NotificationCenter } from '../components/NotificationCenter';
import { Tabs } from '../components/Tabs';
import { Divider } from '../components/Divider';
import styles from './dashboard.module.css';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [nodeStats, setNodeStats] = useState({ height: '--', peers: '--', mempool: '--', latency: '--' });
  const router = useRouter();

  const fetchStats = useCallback(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch('/api/health');
      const latency = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        setNodeStats({
          height: String(data.height ?? '--'),
          peers: String(data.peer_count ?? '--'),
          mempool: String(data.mempool_size ?? '--'),
          latency: `${latency}ms`,
        });
      }
    } catch {
      // keep existing values
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => clearInterval(id);
  }, [fetchStats]);


  const cpuData: Array<{ label: string; value: number }> = [];
  const rpcCallsData: Array<{ label: string; value: number }> = [];
  const notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: 'warning' | 'success' | 'info' | 'error';
    timestamp: Date;
    read: boolean;
  }> = [];

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '⚙️', label: 'Operations', href: '/' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '🔔', label: 'Alerts', href: '/alerts' },
    { icon: '🌐', label: 'Network', href: '/network' },
    { icon: '🎨', label: 'Demo', href: '/demo' },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <HeroSection
          eyebrow="KuberCoin operations prelude"
          title={<>Operate the <span>node surface</span> with a clearer opening context.</>}
          description={<>The dashboard now starts with a branded prelude that explains what this route is for before handing off to alerts, charts, configuration, and action panels.</>}
          actions={
            <>
              <PreludeButton variant="primary" size="lg" onClick={() => router.push('/metrics')}>Open Metrics</PreludeButton>
              <PreludeButton variant="secondary" size="lg" onClick={() => router.push('/network')}>Review Network</PreludeButton>
              <PreludeButton variant="ghost" size="lg" onClick={() => router.push('/alerts')}>Inspect Alerts</PreludeButton>
            </>
          }
          stats={
            <>
              <PreludeStatCard label="Block Height" value={nodeStats.height} change={nodeStats.height !== '--' ? 'Best chain tip' : 'No data'} changeType={nodeStats.height !== '--' ? 'positive' : 'neutral'} icon={<HeightIcon />} />
              <PreludeStatCard label="Peers" value={nodeStats.peers} change={nodeStats.peers !== '--' ? 'Connected to network' : 'No data'} changeType={nodeStats.peers !== '--' ? 'positive' : 'neutral'} icon={<PeerIcon />} />
              <PreludeStatCard label="Mempool" value={nodeStats.mempool} change="Live pending set" changeType="neutral" icon={<MempoolIcon />} />
              <PreludeStatCard label="Latency" value={nodeStats.latency} change="Health endpoint round-trip" changeType="neutral" icon={<LatencyIcon />} />
            </>
          }
          illustration={<OpsArt />}
          className="mb-10"
        />

        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Operations Dashboard</h1>
            <p className={styles.subtitle}>Node management and monitoring</p>
          </div>
          <div className={styles.headerActions}>
            <NotificationCenter
              notifications={notifications}
              onNotificationClick={(id) => console.log('Notification:', id)}
            />
            <Avatar fallback="OP" status="online" />
          </div>
        </header>

        <section className={styles.statsGrid}>
          <StatCard
            icon="📊"
            label="Block Height"
            value={nodeStats.height}
            trend={nodeStats.height !== '--' ? 'Best chain tip' : 'No data'}
            variant="blue"
          />
          <StatCard
            icon="👥"
            label="Connected Peers"
            value={nodeStats.peers}
            trend={nodeStats.peers !== '--' ? 'Active connections' : 'No data'}
            variant="green"
          />
          <StatCard
            icon="🔄"
            label="Mempool TXs"
            value={nodeStats.mempool}
            trend={nodeStats.mempool !== '--' ? 'Unconfirmed' : 'No data'}
            variant="purple"
          />
          <StatCard
            icon="⚡"
            label="RPC Latency"
            value={nodeStats.latency}
            trend={nodeStats.latency !== '--' ? 'Round-trip' : 'No data'}
            variant="gold"
          />
        </section>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'config', label: 'Configuration', icon: '⚙️' },
                { id: 'actions', label: 'Actions', icon: '🎯' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="underline"
            />

            <div className={styles.tabContent}>
              {activeTab === 'overview' && (
                <div className={styles.overview}>
                  <div className={styles.chartsGrid}>
                    <Card variant="elevated">
                      <CardBody>
                        <div className={styles.chartHeader}>
                          <h4>CPU Usage</h4>
                          <Badge variant="default">No data</Badge>
                        </div>
                        <LineChart data={cpuData} height={180} animated />
                      </CardBody>
                    </Card>

                    <Card variant="elevated">
                      <CardBody>
                        <div className={styles.chartHeader}>
                          <h4>RPC Calls</h4>
                          <Badge variant="default">No data</Badge>
                        </div>
                        <BarChart data={rpcCallsData} height={180} horizontal animated />
                      </CardBody>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className={styles.config}>
                  <div className={styles.form}>
                    <Input
                      label="RPC Port"
                      type="number"
                      value=""
                      icon={<span>🔌</span>}
                      placeholder="Not configured"
                      disabled
                    />
                    <Input
                      label="P2P Port"
                      type="number"
                      value=""
                      icon={<span>🌐</span>}
                      placeholder="Not configured"
                      disabled
                    />
                    <Divider />
                    <div className={styles.checkboxGroup}>
                      <Checkbox label="Enable mining" checked={false} disabled />
                      <Checkbox label="Accept incoming connections" checked={false} disabled />
                      <Checkbox label="Enable transaction indexing" checked={false} disabled />
                      <Checkbox label="Enable debug logging" checked={false} disabled />
                    </div>
                    <Button variant="primary" fullWidth disabled>
                      Save Configuration
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === 'actions' && (
                <div className={styles.actions}>
                  <div className={styles.actionGrid}>
                    <Button variant="success" size="lg" icon={<span>▶️</span>} disabled>
                      Start Node
                    </Button>
                    <Button variant="danger" size="lg" icon={<span>⏹️</span>} disabled>
                      Stop Node
                    </Button>
                    <Button variant="outline" size="lg" icon={<span>🔄</span>} disabled>
                      Restart Node
                    </Button>
                    <Button variant="ghost" size="lg" icon={<span>🗑️</span>} disabled>
                      Clear Cache
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}

function HeightIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>;
}

function PeerIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m9 9H3" /></svg>;
}

function MempoolIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
}

function LatencyIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function OpsArt() {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(245,241,248,0.95)_100%)]">
      <div className="absolute left-10 top-10 h-24 w-24 rounded-full bg-[rgba(196,156,255,0.24)] blur-2xl" />
      <div className="absolute right-12 bottom-12 h-28 w-28 rounded-full bg-[rgba(114,119,255,0.18)] blur-2xl" />
      <div className="absolute inset-x-10 bottom-10 top-24 rounded-[28px] border border-[rgba(124,140,255,0.14)] bg-white/84" />
      <div className="absolute left-16 top-16 h-16 w-36 rounded-[18px] border border-[rgba(124,140,255,0.12)] bg-white/90" />
      <div className="absolute left-16 top-40 h-28 w-28 rounded-[24px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(196,156,255,0.22)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="absolute right-18 top-36 h-36 w-28 rounded-[26px] border border-[rgba(124,140,255,0.12)] bg-[linear-gradient(180deg,rgba(114,119,255,0.16)_0%,rgba(255,255,255,0.94)_100%)]" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#8e74e9_0%,#b89aff_100%)] text-white shadow-[0_22px_48px_rgba(142,116,233,0.24)]">
          <HeightIcon />
        </div>
        <div className="rounded-full border border-[rgba(124,140,255,0.16)] bg-white/90 px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--kc-accent)]">
          Operations dashboard prelude
        </div>
      </div>
    </div>
  );
}
