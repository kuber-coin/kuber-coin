'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { Tabs } from '../components/Tabs';
import { Checkbox } from '../components/Checkbox';
import { Divider } from '../components/Divider';
import styles from './metrics.module.css';

export default function MetricsPage() {
  const [activeTab, setActiveTab] = useState('system');
  const [refreshInterval, setRefreshInterval] = useState('10');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const statusVariant = (value: string) => {
    if (value === 'normal') return 'success' as const;
    if (value === 'warning') return 'warning' as const;
    return 'error' as const;
  };

  const cpuData: Array<{ label: string; value: number }> = [];
  const memoryData: Array<{ label: string; value: number }> = [];
  const rpcMethodsData: Array<{ label: string; value: number }> = [];

  interface MetricRow {
    metric: string;
    current: string;
    average: string;
    peak: string;
    status: 'normal' | 'warning' | 'critical';
  }

  const systemMetrics: MetricRow[] = [];
  const blockchainMetrics: MetricRow[] = [];

  const columns: TableColumn<MetricRow>[] = [
    { key: 'metric', header: 'Metric', width: '30%' },
    { key: 'current', header: 'Current', width: '20%', align: 'right' },
    { key: 'average', header: 'Average (24h)', width: '20%', align: 'right' },
    { key: 'peak', header: 'Peak (24h)', width: '20%', align: 'right' },
    {
      key: 'status',
      header: 'Status',
      width: '10%',
      align: 'center',
      render: (value: string) => (
        <Badge variant={statusVariant(value)}>
          {value}
        </Badge>
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

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>System Metrics</h1>
            <p className={styles.subtitle}>Real-time performance monitoring</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.refreshControl}>
              <Checkbox
                label="Auto-refresh"
                checked={autoRefresh}
                onChange={setAutoRefresh}
              />
              <Input
                type="number"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                disabled={!autoRefresh}
                style={{ width: '80px' }}
              />
              <span className={styles.refreshLabel}>seconds</span>
            </div>
            <Button variant="outline" icon={<span>📥</span>}>
              Export Data
            </Button>
          </div>
        </header>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'system', label: 'System', icon: '💻' },
                { id: 'blockchain', label: 'Blockchain', icon: '⛓️' },
                { id: 'network', label: 'Network', icon: '🌐' },
                { id: 'rpc', label: 'RPC', icon: '🔌' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="underline"
            />

            <div className={styles.tabContent}>
              {activeTab === 'system' && (
                <>
                  <div className={styles.chartsGrid}>
                    <Card variant="elevated">
                      <CardBody>
                        <h4 className={styles.chartTitle}>CPU Usage (%)</h4>
                        <LineChart data={cpuData} height={200} animated />
                      </CardBody>
                    </Card>

                    <Card variant="elevated">
                      <CardBody>
                        <h4 className={styles.chartTitle}>Memory Usage (MB)</h4>
                        <LineChart data={memoryData} height={200} color="#f59e0b" animated />
                      </CardBody>
                    </Card>
                  </div>

                  <Divider />

                  <Table columns={columns} data={systemMetrics} compact />
                </>
              )}

              {activeTab === 'blockchain' && (
                <Table columns={columns} data={blockchainMetrics} compact />
              )}

              {activeTab === 'rpc' && (
                <div>
                  <h4 className={styles.sectionTitle}>RPC Method Calls (Last 24h)</h4>
                  <BarChart data={rpcMethodsData} height={300} horizontal animated />
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
