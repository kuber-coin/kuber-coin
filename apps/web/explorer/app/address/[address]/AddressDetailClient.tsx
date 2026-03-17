'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { CopyButton } from '../../components/CopyButton';
import { Table, TableColumn } from '../../components/Table';
import { Pagination } from '../../components/Pagination';
import { LineChart } from '../../components/LineChart';
import { formatRelativeTime, truncateHash } from '../../utils/formatters';
import styles from './address.module.css';

interface AddressTransaction {
  txid: string;
  amount: number;
  timestamp: number;
  confirmations: number;
  blockHeight: number;
  blockHash: string;
  inputs: number;
  outputs: number;
}

function buildReceivedHistory(transactions: AddressTransaction[]) {
  let runningTotal = 0;
  return [...transactions]
    .sort((a, b) => a.blockHeight - b.blockHeight)
    .map((tx) => {
      runningTotal += tx.amount;
      return {
        label: new Date(tx.timestamp).toLocaleDateString(),
        value: Number(runningTotal.toFixed(8)),
      };
    });
}

export default function AddressDetailClient({ address }: { address: string }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [addressData, setAddressData] = useState({
    balance: 0,
    totalReceived: 0,
    totalSent: 0,
    transactionCount: 0,
    firstSeen: 0,
    lastSeen: 0,
  });
  const [transactions, setTransactions] = useState<AddressTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const [balRes, txRes] = await Promise.all([
          fetch(`/api/node/balance/${encodeURIComponent(address)}`, { cache: 'no-store' }),
          fetch(`/api/node/address/${encodeURIComponent(address)}/txs`, { cache: 'no-store' }),
        ]);

        if (!balRes.ok) throw new Error(`Balance fetch failed: HTTP ${balRes.status}`);
        if (!txRes.ok) throw new Error(`Address transaction fetch failed: HTTP ${txRes.status}`);

        const balData = await balRes.json();
        const txData: any[] = await txRes.json();
        const uniqueHeights = [...new Set(txData.map((tx) => Number(tx.block_height || 0)).filter((height) => height >= 0))];
        const blockTimes = new Map<number, number>();

        await Promise.all(uniqueHeights.map(async (height) => {
          try {
            const blockRes = await fetch(`/api/node/block-by-height/${height}`, { cache: 'no-store' });
            if (!blockRes.ok) return;
            const block = await blockRes.json();
            blockTimes.set(height, Number(block.timestamp || 0) * 1000);
          } catch {
            // Ignore per-block timestamp failures and leave timestamp as zero.
          }
        }));

        const mappedTransactions = txData
          .map((tx: any, index: number) => ({
            txid: tx.txid ?? `unknown-${index}`,
            amount: Number((tx.value_received ?? 0) / 1e8),
            timestamp: blockTimes.get(Number(tx.block_height || 0)) || 0,
            confirmations: Number(tx.confirmations ?? 0),
            blockHeight: Number(tx.block_height || 0),
            blockHash: String(tx.block_hash || ''),
            inputs: Number(tx.inputs || 0),
            outputs: Number(tx.outputs || 0),
          }))
          .sort((a, b) => b.blockHeight - a.blockHeight);

        if (!cancelled) {
          setAddressData({
            balance: (balData.spendable ?? 0) / 1e8,
            totalReceived: (balData.total_received ?? 0) / 1e8,
            totalSent: (balData.total_sent ?? 0) / 1e8,
            transactionCount: mappedTransactions.length,
            firstSeen: mappedTransactions.at(-1)?.timestamp || 0,
            lastSeen: mappedTransactions[0]?.timestamp || 0,
          });
          setTransactions(mappedTransactions);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setFetchError(error instanceof Error ? error.message : 'Failed to load address data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔍', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '💰', label: 'Transactions', href: '/transactions' },
    { icon: '📊', label: 'Statistics', href: '/statistics' },
  ];

  const historyData = useMemo(() => buildReceivedHistory(transactions), [transactions]);
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTxs = transactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const txColumns: TableColumn<AddressTransaction>[] = [
    {
      key: 'txid',
      header: 'Transaction Hash',
      width: '26%',
      render: (value: string) => <a href={`/tx/${value}`} className={styles.txLink}>{truncateHash(value, 16)}</a>,
    },
    {
      key: 'amount',
      header: 'Received',
      width: '16%',
      align: 'right',
      render: (value: number) => <span className={styles.received}>+{value.toFixed(8)} KBR</span>,
    },
    {
      key: 'blockHeight',
      header: 'Block',
      width: '14%',
      render: (_value: number, row) => <a href={`/block/${row.blockHash}`} className={styles.link}>#{row.blockHeight}</a>,
    },
    {
      key: 'inputs',
      header: 'IO',
      width: '14%',
      render: (_value: number, row) => <span className={styles.time}>{row.inputs} in / {row.outputs} out</span>,
    },
    {
      key: 'timestamp',
      header: 'Time',
      width: '18%',
      render: (value: number) => <span className={styles.time}>{value ? formatRelativeTime(new Date(value)) : 'Unknown'}</span>,
    },
    {
      key: 'confirmations',
      header: 'Confirms',
      width: '12%',
      render: (value: number) => <Badge variant={value > 0 ? 'success' : 'warning'}>{value}</Badge>,
    },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Address Details</h1>
            <div className={styles.addressRow}>
              <code className={styles.address}>{address}</code>
              <CopyButton text={address} />
            </div>
            <p style={{ marginTop: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>Received-flow view backed by the current address index and balance endpoints.</p>
          </div>
        </header>

        {loading ? <p>Loading address data...</p> : null}
        {fetchError ? <p style={{ color: 'var(--color-error, #ef4444)' }}>{fetchError}</p> : null}

        {!loading && !fetchError ? (
          <>
            <div className={styles.statsGrid}>
              <StatCard icon="💰" label="Spendable Balance" value={`${addressData.balance.toFixed(8)} KBR`} variant="blue" />
              <StatCard icon="📥" label="Total Received" value={`${addressData.totalReceived.toFixed(8)} KBR`} variant="green" />
              <StatCard icon="📤" label="Total Sent" value={`${addressData.totalSent.toFixed(8)} KBR`} variant="gold" />
              <StatCard icon="🔄" label="Indexed Receipts" value={addressData.transactionCount.toString()} variant="blue" />
            </div>

            <Card variant="glass">
              <CardBody>
                <div className={styles.balanceChart}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>Cumulative Received</h3>
                      <p style={{ margin: '0.35rem 0 0', color: 'rgba(255,255,255,0.65)' }}>
                        First seen: {addressData.firstSeen ? new Date(addressData.firstSeen).toLocaleString() : 'Unknown'}
                        {' · '}
                        Last seen: {addressData.lastSeen ? new Date(addressData.lastSeen).toLocaleString() : 'Unknown'}
                      </p>
                    </div>
                    <Badge variant="info">Receive-only index</Badge>
                  </div>
                  <LineChart data={historyData} color="rgb(59, 130, 246)" height={220} showGrid showArea />
                </div>

                <div className={styles.txTable}>
                  <Table columns={txColumns} data={paginatedTxs} striped hoverable emptyMessage="No indexed receipts for this address." />
                </div>

                {totalPages > 1 ? (
                  <div className={styles.pagination}>
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={itemsPerPage} totalItems={transactions.length} />
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
