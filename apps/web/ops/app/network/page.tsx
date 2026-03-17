'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { Tabs } from '../components/Tabs';
import { Search } from '../components/Search';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { Avatar } from '../components/Avatar';
import { Dropdown } from '../components/Dropdown';
import { formatBytes, formatRelativeTime } from '../utils/formatters';
import styles from './network.module.css';

interface Peer {
  id: string;
  address: string;
  country: string;
  version: string;
  latency: number;
  bytesReceived: number;
  bytesSent: number;
  connectionTime: Date;
  status: 'active' | 'syncing' | 'idle';
}

export default function NetworkPage() {
  const [activeTab, setActiveTab] = useState('peers');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    fetch('/api/peers')
      .then((res) => res.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setPeers(data.map((p, i) => ({
          id: p.id ?? String(i),
          address: p.addr ?? p.address ?? '—',
          country: p.country ?? '—',
          version: p.subver ?? p.version ?? '—',
          latency: p.pingtime != null ? Math.round(p.pingtime * 1000) : 0,
          bytesReceived: p.bytesrecv ?? p.bytesReceived ?? 0,
          bytesSent: p.bytessent ?? p.bytesSent ?? 0,
          connectionTime: new Date((p.conntime ?? 0) * 1000),
          status: (p.synced_headers != null && p.synced_headers < p.blocks) ? 'syncing' : 'active',
        })));
      })
      .catch(() => {/* node not reachable — leave empty */});
  }, []);

  const latencyVariant = (value: number) => {
    if (value < 100) return 'success' as const;
    if (value < 200) return 'warning' as const;
    return 'error' as const;
  };

  const columns: TableColumn<Peer>[] = [
    {
      key: 'address',
      header: 'Peer Address',
      width: '25%',
      copyable: true,
      render: (value: string, row: Peer) => (
        <div className={styles.peerCell}>
          <Avatar size="sm" status={row.status} />
          <span className={styles.address}>{value}</span>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Location',
      width: '10%',
      render: (value: string) => (
        <Badge variant="default">{value}</Badge>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      width: '10%',
      render: (value: string) => <span className={styles.version}>{value}</span>,
    },
    {
      key: 'latency',
      header: 'Latency',
      width: '10%',
      render: (value: number) => (
        <Badge variant={latencyVariant(value)}>
          {value}ms
        </Badge>
      ),
    },
    {
      key: 'bytesReceived',
      header: 'Received',
      width: '12%',
      render: (value: number) => formatBytes(value),
    },
    {
      key: 'bytesSent',
      header: 'Sent',
      width: '12%',
      render: (value: number) => formatBytes(value),
    },
    {
      key: 'connectionTime',
      header: 'Connected',
      width: '13%',
      render: (value: Date) => formatRelativeTime(value),
    },
    {
      key: 'actions',
      header: '',
      width: '8%',
      align: 'right',
      render: () => (
        <Button variant="ghost" size="sm">
          ⋮
        </Button>
      ),
    },
  ];

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '⚙️', label: 'Operations', href: '/' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '🔔', label: 'Alerts', href: '/alerts' },
    { icon: '🌐', label: 'Network', href: '/network' },
  ];

  const filteredPeers = peers
    .filter((p) => filterStatus === 'all' || p.status === filterStatus)
    .filter(
      (p) =>
        searchQuery === '' ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.country.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const bandwidthData: Array<{ label: string; value: number }> = [];
  const connectionData: Array<{ label: string; value: number }> = [];

  const totalBytesReceived = peers.reduce((sum, p) => sum + p.bytesReceived, 0);
  const totalBytesSent = peers.reduce((sum, p) => sum + p.bytesSent, 0);
  const avgLatency = peers.length > 0
    ? Math.round(peers.reduce((sum, p) => sum + p.latency, 0) / peers.length)
    : 0;

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Network Overview</h1>
            <p className={styles.subtitle}>
              {peers.length} active peer connections
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="outline" icon={<span>🔄</span>}>
              Refresh
            </Button>
            <Button variant="primary" icon={<span>➕</span>}>
              Add Peer
            </Button>
          </div>
        </header>

        <div className={styles.statsGrid}>
          <StatCard
            title="Total Peers"
            value={peers.length.toString()}
            trend="+3"
            icon="🌐"
            iconBg="rgba(96, 165, 250, 0.1)"
          />
          <StatCard
            title="Data Received"
            value={formatBytes(totalBytesReceived)}
            trend="+12%"
            icon="📥"
            iconBg="rgba(34, 197, 94, 0.1)"
          />
          <StatCard
            title="Data Sent"
            value={formatBytes(totalBytesSent)}
            trend="+8%"
            icon="📤"
            iconBg="rgba(251, 146, 60, 0.1)"
          />
          <StatCard
            title="Avg Latency"
            value={`${avgLatency}ms`}
            trend="-5ms"
            icon="⚡"
            iconBg="rgba(168, 85, 247, 0.1)"
          />
        </div>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                {
                  id: 'peers',
                  label: 'Peers',
                  icon: '👥',
                  badge: peers.length.toString(),
                },
                { id: 'bandwidth', label: 'Bandwidth', icon: '📊' },
                { id: 'topology', label: 'Topology', icon: '🗺️' },
              ]}
              defaultTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId)}
              variant="pills"
            />

            {activeTab === 'peers' && (
              <>
                <div className={styles.controls}>
                  <Search
                    value={searchQuery}
                    onChange={(value) => setSearchQuery(value)}
                    placeholder="Search by address or location..."
                  />
                  <Dropdown
                    options={[
                      { value: 'all', label: 'All Peers' },
                      { value: 'active', label: 'Active' },
                      { value: 'syncing', label: 'Syncing' },
                      { value: 'idle', label: 'Idle' },
                    ]}
                    value={filterStatus}
                    onChange={setFilterStatus}
                  />
                </div>

                <Table
                  columns={columns}
                  data={filteredPeers}
                  onRowClick={(peer: Peer) => console.log('Peer:', peer.id)}
                  hoverable
                  striped
                />
              </>
            )}

            {activeTab === 'bandwidth' && (
              <div className={styles.charts}>
                <div className={styles.chartSection}>
                  <h3 className={styles.chartTitle}>
                    Bandwidth Usage (GB/month)
                  </h3>
                  <LineChart data={bandwidthData} color="#60a5fa" height={300} />
                </div>

                <div className={styles.chartSection}>
                  <h3 className={styles.chartTitle}>
                    Connections by Region
                  </h3>
                  <BarChart
                    data={connectionData.map((item) => ({ ...item, color: '#a78bfa' }))}
                    height={300}
                    direction="horizontal"
                  />
                </div>

                <div className={styles.bandwidthStats}>
                  <div className={styles.bandwidthItem}>
                    <span className={styles.bandwidthLabel}>Total Download</span>
                    <span className={styles.bandwidthValue}>
                      {formatBytes(totalBytesReceived)}
                    </span>
                  </div>
                  <div className={styles.bandwidthItem}>
                    <span className={styles.bandwidthLabel}>Total Upload</span>
                    <span className={styles.bandwidthValue}>
                      {formatBytes(totalBytesSent)}
                    </span>
                  </div>
                  <div className={styles.bandwidthItem}>
                    <span className={styles.bandwidthLabel}>Peak Speed</span>
                    <span className={styles.bandwidthValue}>--</span>
                  </div>
                  <div className={styles.bandwidthItem}>
                    <span className={styles.bandwidthLabel}>Avg Speed</span>
                    <span className={styles.bandwidthValue}>--</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'topology' && (
              <div className={styles.topology}>
                <div className={styles.topologyMap}>
                  <div className={styles.node} style={{ top: '50%', left: '50%' }}>
                    <div className={styles.nodeCore}>
                      <span>You</span>
                    </div>
                  </div>
                  {peers.slice(0, 8).map((peer, i) => {
                    const angle = (i * 360) / 8;
                    const radius = 150;
                    const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
                    const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
                    return (
                      <div
                        key={peer.id}
                        className={styles.node}
                        style={{ top: `${y}%`, left: `${x}%` }}
                      >
                        <div className={styles.nodePeer}>
                          <Avatar size="xs" status={peer.status} />
                          <span className={styles.nodeLabel}>{peer.country}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.topologyLegend}>
                  <div className={styles.legendItem}>
                    <Avatar size="xs" status="active" />
                    <span>Active</span>
                  </div>
                  <div className={styles.legendItem}>
                    <Avatar size="xs" status="syncing" />
                    <span>Syncing</span>
                  </div>
                  <div className={styles.legendItem}>
                    <Avatar size="xs" status="idle" />
                    <span>Idle</span>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
