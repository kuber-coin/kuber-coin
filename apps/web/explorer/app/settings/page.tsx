'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Checkbox } from '../components/Checkbox';
import { Dropdown } from '../components/Dropdown';
import { Tabs } from '../components/Tabs';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { ProgressBar } from '../components/ProgressBar';
import styles from './settings.module.css';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [walletName, setWalletName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [autoLock, setAutoLock] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [backupReminders, setBackupReminders] = useState(true);

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '�', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '💰', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>Manage your wallet preferences</p>
          </div>
        </header>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'general', label: 'General', icon: '⚙️' },
                { id: 'security', label: 'Security', icon: '🔒' },
                { id: 'notifications', label: 'Notifications', icon: '🔔' },
                { id: 'backup', label: 'Backup', icon: '💾' },
                { id: 'advanced', label: 'Advanced', icon: '🔧' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="underline"
            />

            <div className={styles.tabContent}>
              {activeTab === 'general' && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>General Settings</h3>
                  
                  <div className={styles.form}>
                    <Input
                      label="Wallet Name"
                      value={walletName}
                      onChange={(e) => setWalletName(e.target.value)}
                      icon={<span>💼</span>}
                      helperText="Display name for this wallet"
                    />

                    <Dropdown
                      label="Display Currency"
                      options={[
                        { value: 'USD', label: 'US Dollar (USD)', icon: '$' },
                        { value: 'EUR', label: 'Euro (EUR)', icon: '€' },
                        { value: 'GBP', label: 'British Pound (GBP)', icon: '£' },
                        { value: 'JPY', label: 'Japanese Yen (JPY)', icon: '¥' },
                      ]}
                      value={currency}
                      onChange={setCurrency}
                    />

                    <Dropdown
                      label="Language"
                      options={[
                        { value: 'en', label: 'English', icon: '🇺🇸' },
                        { value: 'es', label: 'Español', icon: '🇪🇸' },
                        { value: 'fr', label: 'Français', icon: '🇫🇷' },
                        { value: 'de', label: 'Deutsch', icon: '🇩🇪' },
                        { value: 'ja', label: '日本語', icon: '🇯🇵' },
                      ]}
                      value={language}
                      onChange={setLanguage}
                    />

                    <div className={styles.checkboxGroup}>
                      <Checkbox
                        label="Enable sound effects"
                        checked={soundEffects}
                        onChange={setSoundEffects}
                      />
                      <Checkbox
                        label="Show balance in overview"
                        checked
                      />
                      <Checkbox
                        label="Compact view mode"
                        checked={false}
                      />
                    </div>

                    <Button variant="primary" icon={<span>💾</span>}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Security Settings</h3>

                  <div className={styles.securityCards}>
                    <div className={styles.securityCard}>
                      <div className={styles.securityHeader}>
                        <div className={styles.securityIcon}>🔐</div>
                        <div>
                          <h4>Password Protection</h4>
                          <p>Change your wallet password</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Change Password
                      </Button>
                    </div>

                    <div className={styles.securityCard}>
                      <div className={styles.securityHeader}>
                        <div className={styles.securityIcon}>📱</div>
                        <div>
                          <h4>Two-Factor Authentication</h4>
                          <p>
                            {twoFactor ? 'Enabled' : 'Add extra security layer'}
                          </p>
                        </div>
                        <Badge variant={twoFactor ? 'success' : 'warning'}>
                          {twoFactor ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <Button
                        variant={twoFactor ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => setTwoFactor(!twoFactor)}
                      >
                        {twoFactor ? 'Disable' : 'Enable'} 2FA
                      </Button>
                    </div>

                    <div className={styles.securityCard}>
                      <div className={styles.securityHeader}>
                        <div className={styles.securityIcon}>⏱️</div>
                        <div>
                          <h4>Auto-Lock</h4>
                          <p>Lock wallet after inactivity</p>
                        </div>
                      </div>
                      <Checkbox
                        label="Enable auto-lock (15 minutes)"
                        checked={autoLock}
                        onChange={setAutoLock}
                      />
                    </div>

                    <div className={styles.securityCard}>
                      <div className={styles.securityHeader}>
                        <div className={styles.securityIcon}>🔑</div>
                        <div>
                          <h4>Private Keys</h4>
                          <p>Export your private keys</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Export Keys
                      </Button>
                    </div>
                  </div>

                  <Divider />

                  <div className={styles.dangerZone}>
                    <h4>⚠️ Danger Zone</h4>
                    <p>Irreversible actions that affect your wallet</p>
                    <div className={styles.dangerActions}>
                      <Button variant="danger" size="sm">
                        Reset Wallet
                      </Button>
                      <Button variant="danger" size="sm">
                        Delete Wallet
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Notification Preferences</h3>

                  <div className={styles.form}>
                    <div className={styles.notificationGroup}>
                      <div className={styles.notificationHeader}>
                        <h4>Desktop Notifications</h4>
                        <Badge variant={notifications ? 'success' : 'default'}>
                          {notifications ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <Checkbox
                        label="Enable desktop notifications"
                        checked={notifications}
                        onChange={setNotifications}
                      />
                    </div>

                    <Divider />

                    <h4 className={styles.subheading}>Notify me about:</h4>
                    <div className={styles.checkboxGroup}>
                      <Checkbox label="Incoming transactions" checked />
                      <Checkbox label="Outgoing transactions" checked />
                      <Checkbox label="Mining rewards" checked />
                      <Checkbox label="Block confirmations" checked={false} />
                      <Checkbox label="Wallet sync status" checked />
                      <Checkbox label="Security alerts" checked />
                      <Checkbox label="System updates" checked={false} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'backup' && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Backup & Recovery</h3>

                  <div className={styles.backupStatus}>
                    <div className={styles.backupInfo}>
                      <span className={styles.backupIcon}>💾</span>
                      <div>
                        <h4>Last Backup</h4>
                        <p>No backups recorded</p>
                      </div>
                    </div>
                    <Badge variant="default">Not configured</Badge>
                  </div>

                  <ProgressBar value={0} variant="default" showLabel />

                  <div className={styles.backupActions}>
                    <Button variant="primary" icon={<span>💾</span>} fullWidth disabled>
                      Backup Wallet Now
                    </Button>
                    <Button variant="outline" icon={<span>📥</span>} fullWidth disabled>
                      Restore from Backup
                    </Button>
                  </div>

                  <Divider />

                  <div className={styles.recoveryPhrase}>
                    <h4>Recovery Phrase</h4>
                    <p>Recovery phrase requires a configured wallet backend</p>
                    <div className={styles.phraseActions}>
                      <Button variant="outline" icon={<span>👁️</span>} disabled>
                        View Recovery Phrase
                      </Button>
                      <Button variant="outline" icon={<span>🖨️</span>} disabled>
                        Print Paper Wallet
                      </Button>
                    </div>
                  </div>

                  <Checkbox
                    label="Remind me to backup weekly"
                    checked={backupReminders}
                    onChange={setBackupReminders}
                  />
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Advanced Settings</h3>

                  <div className={styles.form}>
                    <Input
                      label="RPC Port"
                      type="number"
                      value=""
                      icon={<span>🔌</span>}
                      helperText="Port for RPC connections"
                      placeholder="Not configured"
                      disabled
                    />

                    <Input
                      label="Max Connections"
                      type="number"
                      value=""
                      icon={<span>🌐</span>}
                      helperText="Maximum peer connections"
                      placeholder="Not configured"
                      disabled
                    />

                    <Dropdown
                      label="Transaction Fee Priority"
                      options={[
                        { value: 'low', label: 'Low (Slow)', icon: '🐢' },
                        { value: 'medium', label: 'Medium (Standard)', icon: '🚶' },
                        { value: 'high', label: 'High (Fast)', icon: '🚀' },
                      ]}
                      value=""
                      placeholder="Not configured"
                      disabled
                    />

                    <div className={styles.checkboxGroup}>
                      <Checkbox label="Enable coin control" checked={false} />
                      <Checkbox label="Enable replace-by-fee (RBF)" checked />
                      <Checkbox label="Spend unconfirmed change" checked />
                      <Checkbox label="Enable debug logging" checked={false} />
                    </div>

                    <Button variant="primary" icon={<span>💾</span>} disabled>
                      Save Advanced Settings
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
