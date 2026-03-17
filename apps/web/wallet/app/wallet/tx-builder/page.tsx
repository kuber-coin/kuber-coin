'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { Checkbox } from '../../components/Checkbox';
import { Divider } from '../../components/Divider';
import Modal from '../../components/Modal';
import styles from './tx-builder.module.css';

interface TxOutput {
  id: string;
  address: string;
  amount: number;
}

interface SelectedUTXO {
  txid: string;
  vout: number;
  amount: number;
  confirmations: number;
}

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function feeBadgeVariant(key: string): 'default' | 'success' | 'info' {
  switch (key) {
    case 'slow':
      return 'default';
    case 'fast':
      return 'success';
    default:
      return 'info';
  }
}

export default function TransactionBuilderPage() {
  const [outputs, setOutputs] = useState<TxOutput[]>([{ id: createId(), address: '', amount: 0 }]);
  const [feeRate, setFeeRate] = useState('medium');
  const [enableRBF, setEnableRBF] = useState(true);
  const [selectedUTXOs] = useState<SelectedUTXO[]>([]);
  const [customFeeRate, setCustomFeeRate] = useState('10');
  const [lockTime, setLockTime] = useState('0');
  const [showSignModal, setShowSignModal] = useState(false);
  const [unsignedTx, setUnsignedTx] = useState('');

  const sidebarItems = [
    { icon: '💰', label: 'Wallet', href: '/dashboard' },
    { icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
    { icon: '📍', label: 'Addresses', href: '/wallet/addresses' },
    { icon: '💎', label: 'UTXOs', href: '/wallet/utxos' },
    { icon: '📝', label: 'Transaction Builder', href: '/wallet/tx-builder' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const feeEstimates = {
    slow: { rate: 5, time: '~60 minutes', cost: 0.00001 },
    medium: { rate: 10, time: '~20 minutes', cost: 0.00002 },
    fast: { rate: 20, time: '~10 minutes', cost: 0.00004 },
    custom: { rate: Number.parseInt(customFeeRate, 10) || 10, time: 'varies', cost: 0.00002 },
  };

  const addOutput = () => {
    setOutputs([...outputs, { id: createId(), address: '', amount: 0 }]);
  };

  const removeOutput = (id: string) => {
    setOutputs(outputs.filter((output) => output.id !== id));
  };

  const updateOutput = <K extends keyof Omit<TxOutput, 'id'>>(id: string, field: K, value: TxOutput[K]) => {
    setOutputs((prev) =>
      prev.map((output) => (output.id === id ? { ...output, [field]: value } : output))
    );
  };

  const calculateTotal = () => {
    return outputs.reduce((sum, output) => sum + (output.amount || 0), 0);
  };

  const estimateFee = () => {
    const selectedFee = feeEstimates[feeRate as keyof typeof feeEstimates];
    return selectedFee.cost;
  };

  const buildTransaction = () => {
    const tx = {
      version: 2,
      lockTime: Number.parseInt(lockTime, 10) || 0,
      inputs: selectedUTXOs.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        sequence: enableRBF ? 0xfffffffd : 0xffffffff,
      })),
      outputs: outputs.map(output => ({
        address: output.address,
        amount: output.amount,
      })),
      fee: estimateFee(),
    };
    setUnsignedTx(JSON.stringify(tx, null, 2));
    setShowSignModal(true);
  };

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Transaction Builder</h1>
            <p className={styles.subtitle}>
              Build, Sign & Broadcast Transactions • Fee Estimation • Offline Signing Support
            </p>
          </div>
          <div className={styles.badges}>
            <Badge variant="info">RBF-Enabled</Badge>
            <Badge variant="purple" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
              PQ-Hybrid Sigs
            </Badge>
          </div>
        </header>

        <div className={styles.grid}>
          <div className={styles.mainColumn}>
            <Card variant="glass">
              <CardHeader>
                <h3>Transaction Outputs</h3>
              </CardHeader>
              <CardBody>
                {outputs.map((output, index) => (
                  <div key={output.id} className={styles.outputRow}>
                    <div className={styles.outputNumber}>{index + 1}</div>
                    <Input
                      label="Recipient Address"
                      value={output.address}
                      onChange={(e) => updateOutput(output.id, 'address', e.target.value)}
                      placeholder="kc1q..."
                    />
                    <Input
                      label="Amount (KC)"
                      type="number"
                      value={output.amount || ''}
                      onChange={(e) => updateOutput(output.id, 'amount', Number.parseFloat(e.target.value) || 0)}
                      placeholder="0.00000000"
                    />
                    {outputs.length > 1 && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeOutput(output.id)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" fullWidth onClick={addOutput}>
                  ➕ Add Another Output
                </Button>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <h3>Fee Estimation</h3>
              </CardHeader>
              <CardBody>
                <div className={styles.feeOptions}>
                  {Object.entries(feeEstimates).map(([key, estimate]) => (
                    <button
                      key={key}
                      className={`${styles.feeOption} ${feeRate === key ? styles.selected : ''}`}
                      onClick={() => setFeeRate(key)}
                      type="button"
                      aria-pressed={feeRate === key}
                    >
                      <div className={styles.feeHeader}>
                        <Badge variant={feeBadgeVariant(key)}>
                          {key.toUpperCase()}
                        </Badge>
                        <span className={styles.feeRate}>{estimate.rate} sat/vB</span>
                      </div>
                      <div className={styles.feeTime}>{estimate.time}</div>
                      <div className={styles.feeCost}>{estimate.cost.toFixed(8)} KC</div>
                    </button>
                  ))}
                </div>

                {feeRate === 'custom' && (
                  <Input
                    label="Custom Fee Rate (sat/vB)"
                    type="number"
                    value={customFeeRate}
                    onChange={(e) => setCustomFeeRate(e.target.value)}
                    placeholder="10"
                  />
                )}

                <Divider />

                <div className={styles.feeSettings}>
                  <Checkbox
                    label="Enable Replace-By-Fee (RBF)"
                    checked={enableRBF}
                    onChange={setEnableRBF}
                  />
                  <p className={styles.helperText}>
                    Allows you to increase the fee later if needed
                  </p>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <h3>Advanced Options</h3>
              </CardHeader>
              <CardBody>
                <Input
                  label="Lock Time (block height or timestamp)"
                  type="number"
                  value={lockTime}
                  onChange={(e) => setLockTime(e.target.value)}
                  placeholder="0"
                  helperText="0 = immediate broadcast, >0 = delayed until block/time"
                />

                <div className={styles.warningBox}>
                  <span className={styles.warningIcon}>⚠️</span>
                  <div>
                    <strong>Security Notice</strong>
                    <p>Transactions with lock time cannot be broadcast until the specified block height or timestamp.</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className={styles.sideColumn}>
            <Card variant="glass">
              <CardHeader>
                <h3>Transaction Summary</h3>
              </CardHeader>
              <CardBody>
                <div className={styles.summary}>
                  <div className={styles.summaryRow}>
                    <span>Total Amount:</span>
                    <span className={styles.summaryValue}>{calculateTotal().toFixed(8)} KC</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Network Fee:</span>
                    <span className={styles.summaryValue}>{estimateFee().toFixed(8)} KC</span>
                  </div>
                  <Divider />
                  <div className={styles.summaryRow}>
                    <strong>Total Cost:</strong>
                    <strong className={styles.summaryValue}>{(calculateTotal() + estimateFee()).toFixed(8)} KC</strong>
                  </div>

                  <div className={styles.txDetails}>
                    <div className={styles.detailRow}>
                      <span>Outputs:</span>
                      <Badge variant="default">{outputs.length}</Badge>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Fee Rate:</span>
                      <Badge variant="info">{feeEstimates[feeRate as keyof typeof feeEstimates].rate} sat/vB</Badge>
                    </div>
                    <div className={styles.detailRow}>
                      <span>RBF:</span>
                      <Badge variant={enableRBF ? 'success' : 'default'}>{enableRBF ? 'Enabled' : 'Disabled'}</Badge>
                    </div>
                  </div>
                </div>

                <Divider />

                <div className={styles.actionButtons}>
                  <Button variant="primary" fullWidth size="lg" onClick={buildTransaction}>
                    🔨 Build Transaction
                  </Button>
                  <Button variant="outline" fullWidth>
                    💾 Save Draft
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>
                <h4 className={styles.infoTitle}>🔐 Signature Options</h4>
                <div className={styles.signOptions}>
                  <Button variant="secondary" fullWidth>
                    🔑 Sign with Wallet
                  </Button>
                  <Button variant="outline" fullWidth>
                    💾 Export for Offline Signing
                  </Button>
                  <Button variant="outline" fullWidth>
                    📱 Sign with Hardware Wallet
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>
                <h4 className={styles.infoTitle}>💡 Tips</h4>
                <ul className={styles.tipsList}>
                  <li>Higher fees = faster confirmation</li>
                  <li>Use RBF to adjust fees later</li>
                  <li>Offline signing for cold storage</li>
                  <li>Verify addresses before sending</li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>

        <Modal
          isOpen={showSignModal}
          onCloseAction={() => setShowSignModal(false)}
          title="Sign & Broadcast Transaction"
          size="lg"
        >
          <div className={styles.modalContent}>
            <div className={styles.txPreview}>
              <h4>Unsigned Transaction</h4>
              <pre className={styles.txCode}>{unsignedTx}</pre>
            </div>

            <div className={styles.warningBox}>
              <span className={styles.warningIcon}>🔒</span>
              <div>
                <strong>Hybrid Signature Required</strong>
                <p>This transaction will be signed with both classical (ECDSA) and post-quantum (Dilithium3) signatures.</p>
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button variant="outline" onClick={() => setShowSignModal(false)}>
                Cancel
              </Button>
              <Button variant="secondary">
                Export for Offline Signing
              </Button>
              <Button variant="primary">
                Sign & Broadcast
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
