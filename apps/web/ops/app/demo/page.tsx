'use client';

import React from 'react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Input } from '../components/Input';
import { Dropdown } from '../components/Dropdown';
import { Checkbox } from '../components/Checkbox';
import { NotificationCenter } from '../components/NotificationCenter';
import { Avatar } from '../components/Avatar';
import styles from './demo.module.css';

export default function OpsDemo() {
  const notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: 'warning' | 'success' | 'info' | 'error';
    timestamp: Date;
    read: boolean;
  }> = [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>⚙️ Operations Dashboard</h1>
          <Badge variant="success" dot pulse>Operational</Badge>
        </div>
        <div className={styles.headerRight}>
          <NotificationCenter notifications={notifications} />
          <Avatar fallback="OP" status="online" />
        </div>
      </header>

      <section className={styles.stats}>
        <div className={styles.statsGrid}>
          <StatCard
            icon="📊"
            label="Block Height"
            value="--"
            trend="No data"
            variant="blue"
          />
          <StatCard
            icon="👥"
            label="Connected Peers"
            value="--"
            trend="No data"
            variant="green"
          />
          <StatCard
            icon="🔄"
            label="Mempool TXs"
            value="--"
            trend="No data"
            variant="purple"
          />
          <StatCard
            icon="⚡"
            label="RPC Latency"
            value="--"
            trend="No data"
            variant="gold"
          />
        </div>
      </section>

      <div className={styles.grid}>
        <Card variant="glass">
          <CardBody>
            <h3 className={styles.cardTitle}>Node Configuration</h3>
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
              <Dropdown
                label="Network"
                options={[
                  { value: 'mainnet', label: 'Mainnet', icon: '🌍' },
                  { value: 'testnet', label: 'Testnet', icon: '🧪' },
                  { value: 'regtest', label: 'Regtest', icon: '⚙️' }
                ]}
                value=""
                placeholder="Not configured"
                disabled
              />
              <div className={styles.checkboxGroup}>
                <Checkbox label="Enable mining" checked={false} disabled />
                <Checkbox label="Accept incoming connections" checked={false} disabled />
                <Checkbox label="Enable transaction indexing" checked={false} disabled />
              </div>
              <Button variant="primary" fullWidth disabled>
                Save Configuration
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardBody>
            <h3 className={styles.cardTitle}>Quick Actions</h3>
            <div className={styles.actions}>
              <Button variant="success" fullWidth icon={<span>▶️</span>} disabled>
                Start Node
              </Button>
              <Button variant="danger" fullWidth icon={<span>⏹️</span>} disabled>
                Stop Node
              </Button>
              <Button variant="outline" fullWidth icon={<span>🔄</span>} disabled>
                Restart Node
              </Button>
              <Button variant="ghost" fullWidth icon={<span>🗑️</span>} disabled>
                Clear Cache
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
