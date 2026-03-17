'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { Button } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import styles from './network.module.css';

export default function NetworkMonitorPage() {
  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🌐', label: 'Network', href: '/explorer/network' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const [refreshInterval, setRefreshInterval] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Refresh network data
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const networkStats = {
    connectedPeers: 0,
    maxConnections: 0,
    inboundPeers: 0,
    outboundPeers: 0,
    networkHashrate: '--',
    totalNodes: 0,
    bandwidthIn: '--',
    bandwidthOut: '--',
  };

  const peers: Array<{
    id: number;
    address: string;
    version: string;
    services: string[];
    direction: 'outbound' | 'inbound';
    connected: string;
    latency: number;
    bytesRecv: number;
    bytesSent: number;
    banned: boolean;
  }> = [];

  const nodeDistribution: Array<{ region: string; count: number; percentage: number }> = [];

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 50) return 'success';
    if (latency < 100) return 'warning';
    return 'danger';
  };

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Network Monitor</h1>
            <p className={styles.subtitle}>
              Real-Time P2P Network Topology • {networkStats.connectedPeers} Connected Peers
            </p>
          </div>
          <div className={styles.headerActions}>
            <Badge variant="default" size="lg">
              Status unknown
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
              {autoRefresh ? '⏸ Pause' : '▶ Resume'}
            </Button>
          </div>
        </header>

        <div className={styles.statsGrid}>
          <StatCard
            icon="👥"
            label="Connected Peers"
            value={`${networkStats.connectedPeers}/${networkStats.maxConnections}`}
            variant="primary"
          />
          <StatCard
            icon="📥"
            label="Inbound Peers"
            value={networkStats.inboundPeers}
            variant="success"
          />
          <StatCard
            icon="📤"
            label="Outbound Peers"
            value={networkStats.outboundPeers}
            variant="info"
          />
          <StatCard
            icon="🌐"
            label="Total Network Nodes"
            value={networkStats.totalNodes.toLocaleString()}
            variant="default"
          />
          <StatCard
            icon="⚡"
            label="Network Hashrate"
            value={networkStats.networkHashrate}
            variant="primary"
          />
          <StatCard
            icon="⬇️"
            label="Bandwidth In"
            value={networkStats.bandwidthIn}
            variant="success"
          />
          <StatCard
            icon="⬆️"
            label="Bandwidth Out"
            value={networkStats.bandwidthOut}
            variant="info"
          />
          <StatCard
            icon="🔄"
            label="Refresh Rate"
            value={`${refreshInterval}s`}
            variant="default"
          />
        </div>

        <Card variant="glass">
          <CardHeader>
            <div className={styles.cardHeader}>
              <h3>Connected Peers</h3>
              <div className={styles.filters}>
                <Button variant="secondary" size="sm">
                  ⚙️ Configure
                </Button>
                <Button variant="secondary" size="sm">
                  🔄 Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <Table
              columns={[
                { key: 'address', label: 'Peer Address' },
                { key: 'version', label: 'Version' },
                { key: 'direction', label: 'Direction' },
                { key: 'latency', label: 'Latency' },
                { key: 'traffic', label: 'Traffic' },
                { key: 'connected', label: 'Connected' },
                { key: 'actions', label: 'Actions' },
              ]}
              data={peers.map((peer) => ({
                address: (
                  <div className={styles.peerAddress}>
                    <code>{peer.address}</code>
                    <div className={styles.services}>
                      {peer.services.map((s) => (
                        <Badge key={s} variant="default" size="sm">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ),
                version: <Badge variant="info">{peer.version}</Badge>,
                direction: (
                  <Badge variant={peer.direction === 'inbound' ? 'success' : 'primary'}>
                    {peer.direction === 'inbound' ? '📥 IN' : '📤 OUT'}
                  </Badge>
                ),
                latency: (
                  <Badge variant={getLatencyColor(peer.latency)} size="lg">
                    {peer.latency}ms
                  </Badge>
                ),
                traffic: (
                  <div className={styles.traffic}>
                    <span className={styles.trafficIn}>⬇ {formatBytes(peer.bytesRecv)}</span>
                    <span className={styles.trafficOut}>⬆ {formatBytes(peer.bytesSent)}</span>
                  </div>
                ),
                connected: peer.connected,
                actions: (
                  <div className={styles.actions}>
                    <Button variant="ghost" size="sm">
                      ℹ️
                    </Button>
                    <Button variant="ghost" size="sm">
                      🚫
                    </Button>
                  </div>
                ),
              }))}
            />
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <h3>Global Node Distribution</h3>
          </CardHeader>
          <CardBody>
            <div className={styles.distributionGrid}>
              {nodeDistribution.length === 0 ? (
                <div className={styles.emptyState}>No node distribution data available.</div>
              ) : (
                nodeDistribution.map((region) => (
                  <div key={region.region} className={styles.regionCard}>
                    <div className={styles.regionHeader}>
                      <h4>{region.region}</h4>
                      <Badge variant="primary" size="lg">
                        {region.count.toLocaleString()}
                      </Badge>
                    </div>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${region.percentage}%` }}
                      />
                    </div>
                    <p className={styles.percentage}>{region.percentage}% of network</p>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardBody>
            <h4 className={styles.noteTitle}>🔒 Network Security Note</h4>
            <div className={styles.noteContent}>
              <p>
                This network monitor displays real-time P2P topology as reported by your node. All peer
                connections are established and managed by the node software following Bitcoin's peer
                discovery and connection protocols.
              </p>
              <div className={styles.importantNote}>
                <strong>⚠️ Critical Principle:</strong> The UI reads network state from the node but never
                initiates connections, modifies peer lists, or bypasses node network policies. All P2P
                networking is controlled by the node, ensuring security and consensus participation.
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
