'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { CopyButton } from '../components/CopyButton';
import { Divider } from '../components/Divider';
import { Input } from '../components/Input';
import styles from './receive.module.css';

export default function ReceivePage() {
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [showQR, setShowQR] = useState(false);

  const address = 'kb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

  const generatePaymentURI = () => {
    let uri = `kubercoin:${address}`;
    const params = [];
    if (amount) params.push(`amount=${amount}`);
    if (label) params.push(`label=${encodeURIComponent(label)}`);
    if (params.length > 0) uri += `?${params.join('&')}`;
    return uri;
  };

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💰', label: 'Wallet', href: '/' },
    { icon: '📊', label: 'Transactions', href: '/transactions' },
    { icon: '📤', label: 'Send', href: '/send' },
    { icon: '📥', label: 'Receive', href: '/receive' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Receive KuberCoin</h1>
            <p className={styles.subtitle}>Share your address to receive KBR</p>
          </div>
        </header>

        <div className={styles.grid}>
          <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Your Receiving Address</h3>

              <div className={styles.addressSection}>
                <div className={styles.qrPlaceholder}>
                  <div className={styles.qrCode}>
                    <span className={styles.qrIcon}>📱</span>
                    <p>QR Code</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
                    {showQR ? 'Hide' : 'Show'} QR Code
                  </Button>
                </div>

                <div className={styles.addressDisplay}>
                  <div className={styles.label}>Address</div>
                  <div className={styles.addressBox}>
                    <code className={styles.address}>{address}</code>
                    <CopyButton text={address} />
                  </div>
                  <div className={styles.addressActions}>
                    <Button variant="outline" size="sm" icon={<span>📋</span>}>
                      Copy Address
                    </Button>
                    <Button variant="outline" size="sm" icon={<span>📤</span>}>
                      Share
                    </Button>
                  </div>
                </div>
              </div>

              <Divider />

              <div className={styles.customizeSection}>
                <h4 className={styles.sectionTitle}>Customize Payment Request</h4>
                <p className={styles.sectionDesc}>
                  Optional: Add amount and label to create a payment request
                </p>

                <div className={styles.form}>
                  <Input
                    label="Amount (KBR)"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    icon={<span>💰</span>}
                    helperText="Leave empty to receive any amount"
                  />

                  <Input
                    label="Label"
                    placeholder="What is this payment for?"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    icon={<span>📝</span>}
                    helperText="Helps identify this payment"
                    maxLength={50}
                  />

                  {(amount || label) && (
                    <div className={styles.uriBox}>
                      <div className={styles.label}>Payment URI</div>
                      <div className={styles.uriDisplay}>
                        <code className={styles.uri}>{generatePaymentURI()}</code>
                        <CopyButton text={generatePaymentURI()} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Recent Received Transactions</h3>

              <div className={styles.recentTxs}>
                {[
                  { amount: 250.5, from: 'kb1qxy...x0wlh', time: '2 hours ago', status: 'confirmed' },
                  { amount: 100, from: 'kb1abc...def12', time: '5 hours ago', status: 'confirmed' },
                  { amount: 50, from: 'kb1xyz...789ab', time: '1 day ago', status: 'confirmed' },
                ].map((tx) => (
                  <div key={`${tx.from}-${tx.time}-${tx.amount}`} className={styles.txItem}>
                    <div className={styles.txIcon}>📥</div>
                    <div className={styles.txInfo}>
                      <div className={styles.txAmount}>+{tx.amount} KBR</div>
                      <div className={styles.txFrom}>From: {tx.from}</div>
                    </div>
                    <div className={styles.txMeta}>
                      <Badge variant="success" size="sm">{tx.status}</Badge>
                      <span className={styles.txTime}>{tx.time}</span>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="ghost" size="sm" fullWidth>
                View All Transactions →
              </Button>

              <Divider />

              <div className={styles.info}>
                <h4>💡 Tips</h4>
                <ul>
                  <li>Share this address to receive KuberCoin</li>
                  <li>You can generate new addresses for privacy</li>
                  <li>Each address can be used multiple times</li>
                  <li>Always verify the address before sharing</li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
