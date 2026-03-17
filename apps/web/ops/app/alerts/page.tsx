'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Tabs } from '../components/Tabs';
import { Checkbox } from '../components/Checkbox';
import { Input } from '../components/Input';
import { Dropdown } from '../components/Dropdown';
import { Divider } from '../components/Divider';
import { formatRelativeTime } from '../utils/formatters';
import styles from './alerts.module.css';

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('active');
  const [filterLevel, setFilterLevel] = useState('all');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);

  const alerts: Alert[] = [];

  const alertRules: Array<{
    name: string;
    condition: string;
    level: Alert['level'];
    enabled: boolean;
  }> = [];

  const levelVariant = (level: Alert['level']) => {
    if (level === 'warning') return 'warning' as const;
    if (level === 'info') return 'info' as const;
    return 'error' as const;
  };

  const columns: TableColumn<Alert>[] = [
    {
      key: 'level',
      header: 'Level',
      width: '10%',
      render: (value: string) => (
        <Badge
          variant={levelVariant(value as Alert['level'])}
        >
          {value}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: 'Alert',
      width: '25%',
      render: (value: string) => (
        <span className={styles.alertTitle}>{value}</span>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      width: '30%',
      render: (value: string) => (
        <span className={styles.message}>{value}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '15%',
      render: (value: string) => (
        <Badge variant="default">{value}</Badge>
      ),
    },
    {
      key: 'timestamp',
      header: 'Time',
      width: '12%',
      render: (value: Date) => (
        <span className={styles.time}>{formatRelativeTime(value)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '8%',
      align: 'right',
      render: (_, row) =>
        row.acknowledged ? null : (
          <Button variant="outline" size="sm">
            Ack
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

  const activeAlerts = alerts.filter((a) => !a.acknowledged);
  const historyAlerts = alerts.filter((a) => a.acknowledged);

  const filteredAlerts = (activeTab === 'active' ? activeAlerts : historyAlerts).filter(
    (a) => filterLevel === 'all' || a.level === filterLevel
  );

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>System Alerts</h1>
            <p className={styles.subtitle}>
              {activeAlerts.length} active alerts requiring attention
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="outline" icon={<span>✓</span>}>
              Acknowledge All
            </Button>
            <Button variant="primary" icon={<span>➕</span>}>
              Create Alert Rule
            </Button>
          </div>
        </header>

        <div className={styles.grid}>
          <Card variant="glass">
            <CardBody>
              <div className={styles.controls}>
                <Tabs
                  tabs={[
                    {
                      id: 'active',
                      label: 'Active',
                      icon: '🔴',
                      badge: activeAlerts.length.toString(),
                    },
                    { id: 'history', label: 'History', icon: '📜' },
                    { id: 'rules', label: 'Rules', icon: '📋' },
                  ]}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  variant="pills"
                />

                <Dropdown
                  options={[
                    { value: 'all', label: 'All Levels' },
                    { value: 'critical', label: 'Critical' },
                    { value: 'error', label: 'Error' },
                    { value: 'warning', label: 'Warning' },
                    { value: 'info', label: 'Info' },
                  ]}
                  value={filterLevel}
                  onChange={setFilterLevel}
                />
              </div>

              {(activeTab === 'active' || activeTab === 'history') && (
                <Table
                  columns={columns}
                  data={filteredAlerts}
                  onRowClick={(alert) => console.log('Alert:', alert.id)}
                  hoverable
                  striped
                />
              )}

              {activeTab === 'rules' && (
                <div className={styles.rules}>
                  <div className={styles.rulesList}>
                    {alertRules.length === 0 ? (
                      <div className={styles.emptyState}>No alert rules configured.</div>
                    ) : (
                      alertRules.map((rule) => (
                        <div key={rule.name} className={styles.ruleItem}>
                          <div className={styles.ruleInfo}>
                            <div className={styles.ruleHeader}>
                              <h4>{rule.name}</h4>
                              <Badge variant={levelVariant(rule.level)}>
                                {rule.level}
                              </Badge>
                            </div>
                            <p>{rule.condition}</p>
                          </div>
                          <div className={styles.ruleActions}>
                            <Badge variant={rule.enabled ? 'success' : 'default'}>
                              {rule.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Notification Settings</h3>

              <div className={styles.notificationSettings}>
                <div className={styles.notificationGroup}>
                  <div className={styles.notificationHeader}>
                    <span className={styles.notificationIcon}>📧</span>
                    <div>
                      <h4>Email Notifications</h4>
                      <p>Not configured</p>
                    </div>
                  </div>
                  <Checkbox
                    label="Enable email alerts"
                    checked={emailNotifications}
                    onChange={setEmailNotifications}
                  />
                </div>

                <Divider />

                <div className={styles.notificationGroup}>
                  <div className={styles.notificationHeader}>
                    <span className={styles.notificationIcon}>📱</span>
                    <div>
                      <h4>SMS Notifications</h4>
                      <p>Not configured</p>
                    </div>
                  </div>
                  <Checkbox
                    label="Enable SMS alerts"
                    checked={smsNotifications}
                    onChange={setSmsNotifications}
                  />
                </div>

                <Divider />

                <div className={styles.notificationGroup}>
                  <div className={styles.notificationHeader}>
                    <span className={styles.notificationIcon}>🔗</span>
                    <div>
                      <h4>Webhook</h4>
                      <p>POST to external endpoint</p>
                    </div>
                  </div>
                  <Checkbox
                    label="Enable webhook"
                    checked={webhookEnabled}
                    onChange={setWebhookEnabled}
                  />
                  {webhookEnabled && (
                    <Input
                        placeholder="Enter webhook URL"
                      icon={<span>🔗</span>}
                    />
                  )}
                </div>
              </div>

              <Divider />

              <h4 className={styles.subheading}>Alert Levels</h4>
              <div className={styles.checkboxGroup}>
                <Checkbox label="Critical alerts" checked />
                <Checkbox label="Error alerts" checked />
                <Checkbox label="Warning alerts" checked />
                <Checkbox label="Info alerts" checked={false} />
              </div>

              <Button variant="primary" fullWidth icon={<span>💾</span>}>
                Save Notification Settings
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
