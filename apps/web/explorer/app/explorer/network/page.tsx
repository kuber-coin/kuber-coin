'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { Button } from '../../components/Button';
import styles from './network.module.css';

export default function NetworkMonitorPage() {
  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🌐', label: 'Network', href: '/explorer/network' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const [refreshInterval] = useState(15);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [peers, setPeers] = useState<Array<{
    id: number; address: string; version: string; services: string[];
    direction: 'outbound' | 'inbound'; connected: string;
    latency: number; bytesRecv: number; bytesSent: number; banned: boolean;
  }>>([]);
  const [networkStats, setNetworkStats] = useState({
    connectedPeers: 0, maxConnections: 125, inboundPeers: 0, outboundPeers: 0,
    networkHashrate: '--', totalNodes: 0, bandwidthIn: '--', bandwidthOut: '--',
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchNetwork = useCallback(async () => {
    try {
      const [peersRes, infoRes] = await Promise.all([
        fetch('/api/node/peers').catch(() => null),
        fetch('/api/node/info').catch(() => null),
      ]);
      const peersData = peersRes?.ok ? await peersRes.json().catch(() => null) : null;
      const info = infoRes?.ok ? await infoRes.json().catch(() => null) : null;

      if (peersData) {
        const peerList = (peersData.peers ?? []).map((p: Record<string, unknown>, idx: number) => ({
          id: idx,
          address: (p.address as string) ?? (p.addr as string) ?? 'unknown',
          version: (p.version as string) ?? (p.subver as string) ?? '?',
          services: Array.isArray(p.services) ? p.services : [],
          direction: ((p.direction as string) === 'inbound' || (p.inbound as boolean)) ? 'inbound' : 'outbound',
          connected: (p.connected_since as string) ?? (p.conntime ? new Date((p.conntime as number) * 1000).toLocaleString() : '--'),
          latency: (p.latency as number) ?? (p.pingtime ? Math.round((p.pingtime as number) * 1000) : 0),
          bytesRecv: (p.bytes_recv as number) ?? (p.bytesrecv as number) ?? 0,
          bytesSent: (p.bytes_sent as number) ?? (p.bytessent as number) ?? 0,
          banned: false,
        } as typeof peers[0]));
        setPeers(peerList);
        const inbound = peerList.filter((p: typeof peers[0]) => p.direction === 'inbound').length;
        const outbound = peerList.length - inbound;
        setNetworkStats(prev => ({
          ...prev,
          connectedPeers: peerList.length,
          inboundPeers: inbound,
          outboundPeers: outbound,
          totalNodes: peerList.length,
        }));
      }
      if (info) {
        setNetworkStats(prev => ({ ...prev, connectedPeers: info.peers ?? prev.connectedPeers }));
      }
      setLastUpdated(new Date());
    } catch {
      // keep existing values
    }
  }, []);

  useEffect(() => {
    fetchNetwork();
    if (!autoRefresh) return;
    const interval = setInterval(fetchNetwork, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchNetwork]);

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
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()} · ${peers.length} peers` : 'Loading…'}
            </p>
          </div>
          <div className={styles.headerActions}>
                <Badge variant={peers.length > 0 ? 'success' : 'default'} size="lg">
                  {peers.length > 0 ? `${peers.length} peers connected` : 'No peers'}
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
            variant="blue"
          />
          <StatCard
            icon="📥"
            label="Inbound Peers"
            value={networkStats.inboundPeers}
            variant="green"
          />
          <StatCard
            icon="📤"
            label="Outbound Peers"
            value={networkStats.outboundPeers}
            variant="blue"
          />
          <StatCard
            icon="🌐"
            label="Total Network Nodes"
            value={networkStats.totalNodes.toLocaleString()}
            variant="gold"
          />
          <StatCard
            icon="⚡"
            label="Network Hashrate"
            value={networkStats.networkHashrate}
            variant="blue"
          />
          <StatCard
            icon="⬇️"
            label="Bandwidth In"
            value={networkStats.bandwidthIn}
            variant="green"
          />
          <StatCard
            icon="⬆️"
            label="Bandwidth Out"
            value={networkStats.bandwidthOut}
            variant="blue"
          />
          <StatCard
            icon="🔄"
            label="Refresh Rate"
            value={`${refreshInterval}s`}
            variant="gold"
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
                <Button variant="secondary" size="sm" onClick={fetchNetwork}>
                  🔄 Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <Table
              columns={[
                { key: 'address', header: 'Peer Address' },
                { key: 'version', header: 'Version' },
                { key: 'direction', header: 'Direction' },
                { key: 'latency', header: 'Latency' },
                { key: 'traffic', header: 'Traffic' },
                { key: 'connected', header: 'Connected' },
                { key: 'actions', header: 'Actions' },
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
