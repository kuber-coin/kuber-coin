'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { validateAmount, validateAddress } from '../utils/validation';
import { formatCurrency } from '../utils/formatters';
import styles from './send.module.css';

function feeBadgeVariant(key: string): 'warning' | 'info' | 'default' {
  if (key === 'fast') return 'warning';
  if (key === 'standard') return 'info';
  return 'default';
}

export default function SendPage() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('standard');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<{ recipient?: string; amount?: string }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const balance = 12847.5;
  
  const fees = {
    slow: { rate: 0.0001, time: '~30 min', cost: 0.0001 },
    standard: { rate: 0.001, time: '~10 min', cost: 0.001 },
    fast: { rate: 0.01, time: '~2 min', cost: 0.01 },
  };

  const handleSend = () => {
    const newErrors: { recipient?: string; amount?: string } = {};

    const addressValidation = validateAddress(recipient);
    if (!addressValidation.valid) {
      newErrors.recipient = addressValidation.error;
    }

    const amountValidation = validateAmount(amount, balance);
    if (!amountValidation.valid) {
      newErrors.amount = amountValidation.error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    setSuccess(false);
    setShowSuccessMessage(false);
    
    // Simulate API call
    globalThis.setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setShowSuccessMessage(true);
      
      // Clear form and hide success message after 3 seconds
      globalThis.setTimeout(() => {
        setRecipient('');
        setAmount('');
        setMemo('');
        setFee('standard');
        setShowSuccessMessage(false);
      }, 3000);
    }, 2000);
  };

  const isRecipientValid = recipient.length >= 20 && validateAddress(recipient).valid;
  const isAmountValid = !!amount && parseFloat(amount) > 0 && parseFloat(amount) <= balance && validateAmount(amount, balance).valid;

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💰', label: 'Wallet', href: '/' },
    { icon: '📊', label: 'Transactions', href: '/transactions' },
    { icon: '📤', label: 'Send', href: '/send' },
    { icon: '📥', label: 'Receive', href: '/receive' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const selectedFee = fees[fee as keyof typeof fees];
  const totalAmount = Number.parseFloat(amount || '0') + selectedFee.cost;

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Send KuberCoin</h1>
            <p className={styles.subtitle}>Transfer KBR to another address</p>
          </div>
          <StatCard
            icon="💰"
            label="Available Balance"
            value={formatCurrency(balance)}
            variant="blue"
          />
        </header>

        <div className={styles.grid}>
          <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Transaction Details</h3>

              <div className={styles.form}>
                <Input
                  label="Recipient Address"
                  placeholder="Enter wallet address..."
                  value={recipient}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRecipient(val);
                    if (errors.recipient) setErrors({ ...errors, recipient: undefined });
                  }}
                  error={errors.recipient}
                  success={isRecipientValid}
                  icon={<span>👤</span>}
                />

                <Input
                  label="Amount (KBR)"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAmount(val);
                    if (errors.amount) setErrors({ ...errors, amount: undefined });
                  }}
                  error={errors.amount}
                  success={isAmountValid}
                  icon={<span>💰</span>}
                  helperText={`Max: ${formatCurrency(balance)}`}
                />

                <div className={styles.quickAmounts}>
                  <span className={styles.label}>Quick Amount:</span>
                  <div className={styles.buttons}>
                    {[25, 50, 75, 100].map((percent) => (
                      <Button
                        key={percent}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(((balance * percent) / 100).toFixed(2))}
                      >
                        {percent}%
                      </Button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Memo (Optional)"
                  placeholder="Add a note..."
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  icon={<span>📝</span>}
                  maxLength={100}
                />

                <Divider />

                <div className={styles.feeSection}>
                  <div id="fee-label" className={styles.label}>
                    Transaction Fee
                  </div>
                  <div className={styles.feeOptions} aria-labelledby="fee-label">
                    {Object.entries(fees).map(([key, value]) => (
                      <button
                        key={key}
                        className={`${styles.feeOption} ${fee === key ? styles.active : ''}`}
                        onClick={() => setFee(key)}
                        type="button"
                      >
                        <div className={styles.feeHeader}>
                          <span className={styles.feeName}>{key}</span>
                          <Badge variant={feeBadgeVariant(key)}>
                            {value.time}
                          </Badge>
                        </div>
                        <div className={styles.feeCost}>
                          {formatCurrency(value.cost)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleSend}
                  loading={loading}
                  disabled={!recipient || !amount || loading}
                  icon={<span>📤</span>}
                >
                  Send {totalAmount > 0 ? formatCurrency(totalAmount) : 'KBR'}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Transaction Summary</h3>

              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Amount</span>
                  <span className={styles.summaryValue}>
                    {amount ? formatCurrency(Number.parseFloat(amount)) : '0.00 KBR'}
                  </span>
                </div>

                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Network Fee</span>
                  <span className={styles.summaryValue}>
                    {formatCurrency(selectedFee.cost)}
                  </span>
                </div>

                <Divider />

                <div className={`${styles.summaryRow} ${styles.total}`}>
                  <span className={styles.summaryLabel}>Total</span>
                  <span className={styles.summaryValue}>
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                <Divider />

                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Remaining Balance</span>
                  <span className={styles.summaryValue}>
                    {formatCurrency(balance - totalAmount)}
                  </span>
                </div>
              </div>

              <div className={styles.info}>
                <h4>Important Notes</h4>
                <ul>
                  <li>Double-check the recipient address before sending</li>
                  <li>Transactions cannot be reversed once confirmed</li>
                  <li>Network fees are non-refundable</li>
                  <li>Estimated confirmation time: {selectedFee.time}</li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>

        {showSuccessMessage && (
          <div className={styles.successToast}>
            <div className={styles.successContent}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>Transaction Sent!</div>
                <div className={styles.successMessage}>
                  Sent {formatCurrency(parseFloat(amount))} to {recipient.substring(0, 10)}...
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
