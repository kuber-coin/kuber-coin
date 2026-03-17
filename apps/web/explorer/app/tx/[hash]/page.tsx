'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Divider } from '../../components/Divider';
import { Table, TableColumn } from '../../components/Table';
import { ProgressBar } from '../../components/ProgressBar';
import { formatCurrency, formatRelativeTime, formatBytes } from '../../utils/formatters';
import styles from './transaction.module.css';

interface TransactionInput {
  address: string;
  amount: number;
  txid: string;
}

interface TransactionOutput {
  address: string;
  amount: number;
  spent?: boolean;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const hash = (params?.hash as string) ?? '';

  const [transaction, setTransaction] = useState<any | null>(null);
  const [inputs, setInputs] = useState<TransactionInput[]>([]);
  const [outputs, setOutputs] = useState<TransactionOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔍', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '💰', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
  ];

  const rpcCall = useCallback(async (method: string, rpcParams: any[] = []) => {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params: rpcParams, id: Date.now() }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? 'RPC error');
    return json.result;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!hash) return;
      try {
        setLoading(true);
        setLoadError(null);
        const tx = await rpcCall('getrawtransaction', [hash, true]);
        setTransaction({
          status: (tx.confirmations ?? 0) > 0 ? 'confirmed' : 'pending',
          confirmations: tx.confirmations ?? 0,
          timestamp: new Date((tx.time ?? tx.blocktime ?? 0) * 1000),
          blockHeight: tx.height ?? 0,
          blockHash: tx.blockhash ?? '',
          fee: tx.fee ?? 0,
          size: tx.size ?? 0,
          weight: tx.weight ?? 0,
          version: tx.version ?? 1,
        });
        setInputs((tx.vin ?? []).map((vin: any) => ({
          address: vin.coinbase ? 'coinbase' : (vin.address ?? '—'),
          amount: vin.value ?? 0,
          txid: vin.txid ?? '',
        })));
        setOutputs((tx.vout ?? []).map((vout: any) => ({
          address: vout.scriptPubKey?.address ?? vout.scriptPubKey?.addresses?.[0] ?? '—',
          amount: vout.value ?? 0,
          spent: false,
        })));
      } catch (err: any) {
        setLoadError(err.message ?? 'Failed to load transaction');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [hash, rpcCall]);

  const totalInput = inputs.reduce((sum, input) => sum + input.amount, 0);
  const totalOutput = outputs.reduce((sum, output) => sum + output.amount, 0);

  const inputColumns: TableColumn<TransactionInput>[] = [
    {
      key: 'address',
      header: 'Address',
      width: '60%',
      copyable: true,
      render: (value: string) => (
        <span className={styles.address}>{value}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '40%',
      align: 'right',
      render: (value: number) => (
        <span className={styles.amount}>{value.toFixed(4)} KBR</span>
      ),
    },
  ];

  const outputColumns: TableColumn<TransactionOutput>[] = [
    {
      key: 'address',
      header: 'Address',
      width: '50%',
      copyable: true,
      render: (value: string) => (
        <span className={styles.address}>{value}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '30%',
      align: 'right',
      render: (value: number) => (
        <span className={styles.amount}>{value.toFixed(4)} KBR</span>
      ),
    },
    {
      key: 'spent',
      header: 'Status',
      width: '20%',
      align: 'center',
      render: (value: boolean) => (
        <Badge variant={value ? 'default' : 'success'}>
          {value ? 'Spent' : 'Unspent'}
        </Badge>
      ),
    },
  ];

  const statusVariant = (status: string) => {
    if (status === 'confirmed') return 'success' as const;
    if (status === 'pending') return 'warning' as const;
    return 'danger' as const;
  };
  const status = transaction?.status || 'unknown';

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Transaction Details</h1>
            <div className={styles.txHash}>
              <span className={styles.hashLabel}>TX Hash:</span>
              <span className={styles.hash}>{hash}</span>
              <CopyButton text={hash} />
            </div>
          </div>
          <Badge variant={statusVariant(status)}>
            {status}
          </Badge>
        </header>

        {loading && (
          <div className={styles.emptyState}>
            <p>Loading transaction…</p>
          </div>
        )}

        {!loading && loadError && (
          <div className={styles.emptyState}>
            <p>Error: {loadError}</p>
          </div>
        )}

        {!loading && !loadError && !transaction && (
          <div className={styles.emptyState}>
            <p>Transaction data is unavailable. Connect an RPC backend to load details.</p>
          </div>
        )}

        {!loading && !loadError && transaction && (
          <div>
          <div className={styles.grid}>
            <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Overview</h3>
              
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.label}>Status</span>
                  <div className={styles.statusInfo}>
                    <Badge variant="success">Confirmed</Badge>
                    <span className={styles.confirmations}>
                      {transaction.confirmations} confirmations
                    </span>
                  </div>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Timestamp</span>
                  <div className={styles.value}>
                    {transaction.timestamp.toLocaleString()}
                    <span className={styles.relative}>
                      ({formatRelativeTime(transaction.timestamp)})
                    </span>
                  </div>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Block Height</span>
                  <div className={styles.value}>
                    <a href={`/block/${transaction.blockHeight}`} className={styles.link}>
                      #{transaction.blockHeight}
                    </a>
                  </div>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Block Hash</span>
                  <div className={styles.valueWithCopy}>
                    <span className={styles.hash}>{transaction.blockHash}</span>
                    <CopyButton text={transaction.blockHash} size="sm" />
                  </div>
                </div>

                <Divider />

                <div className={styles.infoItem}>
                  <span className={styles.label}>Fee</span>
                  <span className={styles.value}>
                    {transaction.fee} KBR
                    <span className={styles.feeUsd}>
                      ({formatCurrency(transaction.fee * 0.189)})
                    </span>
                  </span>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Size</span>
                  <span className={styles.value}>{formatBytes(transaction.size)}</span>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Weight</span>
                  <span className={styles.value}>{transaction.weight.toLocaleString()} WU</span>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.label}>Version</span>
                  <span className={styles.value}>{transaction.version}</span>
                </div>
              </div>

              <Divider />

              <div className={styles.confirmationProgress}>
                <div className={styles.progressHeader}>
                  <span>Confirmation Progress</span>
                  <span>{transaction.confirmations}/100</span>
                </div>
                <ProgressBar
                  value={(transaction.confirmations / 100) * 100}
                  variant={transaction.confirmations >= 6 ? 'success' : 'warning'}
                  showLabel={false}
                />
                <div className={styles.milestones}>
                  <span className={transaction.confirmations >= 1 ? styles.reached : ''}>
                    1
                  </span>
                  <span className={transaction.confirmations >= 6 ? styles.reached : ''}>
                    6
                  </span>
                  <span className={transaction.confirmations >= 100 ? styles.reached : ''}>
                    100
                  </span>
                </div>
              </div>
            </CardBody>
            </Card>

            <Card variant="glass">
            <CardBody>
              <h3 className={styles.cardTitle}>Transaction Flow</h3>
              
              <div className={styles.flowDiagram}>
                <div className={styles.flowSection}>
                  <div className={styles.flowHeader}>
                    <span className={styles.flowIcon}>📤</span>
                    <h4>Inputs ({inputs.length})</h4>
                    <Badge variant="info">{totalInput.toFixed(4)} KBR</Badge>
                  </div>
                  <div className={styles.flowList}>
                    {inputs.map((input) => (
                      <div key={input.txid} className={styles.flowItem}>
                        <span className={styles.flowAddress}>{input.address}</span>
                        <span className={styles.flowAmount}>
                          {input.amount.toFixed(4)} KBR
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.flowArrow}>
                  <span>→</span>
                  <div className={styles.feeLabel}>
                    Fee: {transaction.fee} KBR
                  </div>
                </div>

                <div className={styles.flowSection}>
                  <div className={styles.flowHeader}>
                    <span className={styles.flowIcon}>📥</span>
                    <h4>Outputs ({outputs.length})</h4>
                    <Badge variant="success">{totalOutput.toFixed(4)} KBR</Badge>
                  </div>
                  <div className={styles.flowList}>
                    {outputs.map((output) => (
                      <div key={`${output.address}-${output.amount}`} className={styles.flowItem}>
                        <span className={styles.flowAddress}>{output.address}</span>
                        <span className={styles.flowAmount}>
                          {output.amount.toFixed(4)} KBR
                        </span>
                        <Badge variant={output.spent ? 'default' : 'success'} size="sm">
                          {output.spent ? 'Spent' : 'UTXO'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardBody>
            </Card>
          </div>

          <Card variant="glass">
          <CardBody>
            <h3 className={styles.cardTitle}>Inputs</h3>
            <Table
              columns={inputColumns}
              data={inputs}
              hoverable
              striped
            />
          </CardBody>
          </Card>

          <Card variant="glass">
          <CardBody>
            <h3 className={styles.cardTitle}>Outputs</h3>
            <Table
              columns={outputColumns}
              data={outputs}
              hoverable
              striped
            />
          </CardBody>
          </Card>

          <div className={styles.actions}>
          <Button variant="outline" icon={<span>📋</span>}>
            View Raw Transaction
          </Button>
          <Button variant="outline" icon={<span>📥</span>}>
            Export JSON
          </Button>
          <Button variant="primary" icon={<span>🔍</span>}>
            View in Block
          </Button>
          </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
