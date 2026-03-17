'use client';

import React from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { ProgressBar } from '../../components/ProgressBar';
import styles from './health.module.css';

export default function ChainHealthPage() {
  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💊', label: 'Chain Health', href: '/explorer/health' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '🔔', label: 'Alerts', href: '/alerts' },
  ];

  const healthMetrics = {
    overall: 0,
    syncStatus: 0,
    peerConnectivity: 0,
    blockPropagation: 0,
    transactionRelay: 0,
    mempoolHealth: 0,
    storageHealth: 0,
    networkLatency: 0,
  };

  const chainMetrics = {
    currentHeight: 0,
    targetHeight: 0,
    syncProgress: 0,
    avgBlockTime: 0,
    targetBlockTime: 0,
    orphanRate: 0,
    reorgDepth: 0,
    maxReorgDepth: 0,
  };

  const systemHealth: Array<{
    category: string;
    status: string;
    checks: Array<{ name: string; status: string; detail: string }>;
  }> = [];

  const getHealthColor = (score: number): 'success' | 'warning' | 'danger' => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'danger';
  };

  const getStatusBadge = (status: string) => {
    if (status === 'healthy' || status === 'pass') {
      return <Badge variant="success">✓ {status.toUpperCase()}</Badge>;
    }
    if (status === 'warning') {
      return <Badge variant="warning">⚠ WARNING</Badge>;
    }
    return <Badge variant="danger">✗ CRITICAL</Badge>;
  };

  const blockTimeProgress = chainMetrics.avgBlockTime > 0
    ? (chainMetrics.targetBlockTime / chainMetrics.avgBlockTime) * 100
    : 0;

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Chain Health Dashboard</h1>
            <p className={styles.subtitle}>
              No health data available
            </p>
          </div>
          <div className={styles.overallHealth}>
            <div className={styles.healthScore}>
              <span className={styles.scoreValue}>
                {healthMetrics.overall > 0 ? `${healthMetrics.overall}%` : '--'}
              </span>
              <span className={styles.scoreLabel}>Health Score</span>
            </div>
            <Badge variant={getHealthColor(healthMetrics.overall)} size="lg">
              {healthMetrics.overall > 0
                ? healthMetrics.overall >= 90
                  ? '✓ HEALTHY'
                  : '⚠ DEGRADED'
                : 'UNKNOWN'}
            </Badge>
          </div>
        </header>

        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>🔄</span>
              <span className={styles.metricLabel}>Sync Status</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.syncStatus}%</div>
            <ProgressBar value={healthMetrics.syncStatus} variant={getHealthColor(healthMetrics.syncStatus)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>👥</span>
              <span className={styles.metricLabel}>Peer Connectivity</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.peerConnectivity}%</div>
            <ProgressBar value={healthMetrics.peerConnectivity} variant={getHealthColor(healthMetrics.peerConnectivity)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>📦</span>
              <span className={styles.metricLabel}>Block Propagation</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.blockPropagation}%</div>
            <ProgressBar value={healthMetrics.blockPropagation} variant={getHealthColor(healthMetrics.blockPropagation)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>💳</span>
              <span className={styles.metricLabel}>Transaction Relay</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.transactionRelay}%</div>
            <ProgressBar value={healthMetrics.transactionRelay} variant={getHealthColor(healthMetrics.transactionRelay)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>🗃️</span>
              <span className={styles.metricLabel}>Mempool Health</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.mempoolHealth}%</div>
            <ProgressBar value={healthMetrics.mempoolHealth} variant={getHealthColor(healthMetrics.mempoolHealth)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>💾</span>
              <span className={styles.metricLabel}>Storage Health</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.storageHealth}%</div>
            <ProgressBar value={healthMetrics.storageHealth} variant={getHealthColor(healthMetrics.storageHealth)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>⚡</span>
              <span className={styles.metricLabel}>Network Latency</span>
            </div>
            <div className={styles.metricValue}>{healthMetrics.networkLatency}%</div>
            <ProgressBar value={healthMetrics.networkLatency} variant={getHealthColor(healthMetrics.networkLatency)} />
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>⏱️</span>
              <span className={styles.metricLabel}>Block Time Target</span>
            </div>
            <div className={styles.metricValue}>
              {chainMetrics.avgBlockTime > 0 ? `${chainMetrics.avgBlockTime}m` : '--'}
              <span className={styles.metricSubtext}>
                {chainMetrics.targetBlockTime > 0 ? ` / ${chainMetrics.targetBlockTime}m` : ''}
              </span>
            </div>
            <ProgressBar 
              value={blockTimeProgress} 
              variant="info" 
            />
          </div>
        </div>

        <div className={styles.grid}>
          {systemHealth.length === 0 ? (
            <Card variant="glass">
              <CardBody>
                <div className={styles.emptyState}>No subsystem health data available.</div>
              </CardBody>
            </Card>
          ) : (
            systemHealth.map((category) => (
              <Card key={category.category} variant="glass">
                <CardHeader>
                  <div className={styles.categoryHeader}>
                    <h3>{category.category}</h3>
                    {getStatusBadge(category.status)}
                  </div>
                </CardHeader>
                <CardBody>
                  <div className={styles.checks}>
                    {category.checks.map((check) => (
                      <div key={check.name} className={styles.checkRow}>
                        <div className={styles.checkInfo}>
                          <div className={styles.checkName}>
                            {getStatusBadge(check.status)}
                            <span>{check.name}</span>
                          </div>
                          <div className={styles.checkDetail}>{check.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <Card variant="glass">
          <CardBody>
            <h4 className={styles.noteTitle}>📊 Health Monitoring Principles</h4>
            <div className={styles.noteContent}>
              <p>
                The Chain Health Dashboard aggregates metrics from your node to provide visibility into blockchain
                and system health. All metrics are derived from node-reported data and consensus state.
              </p>
              <div className={styles.importantNote}>
                <strong>⚠️ Critical Principle:</strong> This dashboard monitors and displays health metrics but
                does not control node behavior, modify consensus rules, or intervene in blockchain operations. All
                health thresholds and alerts are informational only.
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
