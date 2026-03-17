'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Pagination } from '../components/Pagination';
import { Tabs } from '../components/Tabs';
import { formatCurrency, formatRelativeTime, truncateHash } from '../utils/formatters';
import styles from './transactions.module.css';
import walletService from '@/services/wallet';

interface Transaction {
  txid: string;
  type: 'sent' | 'received' | 'mining';
  amount: number;
  confirmations: number;
  timestamp: Date;
  status: 'confirmed' | 'pending' | 'failed';
  fee?: number;
}

function typeBadgeVariant(type: Transaction['type']): 'success' | 'warning' | 'danger' {
  switch (type) {
    case 'received':
      return 'success';
    case 'sent':
      return 'danger';
    case 'mining':
    default:
      return 'warning';
  }
}

function typeLabel(type: Transaction['type']): string {
  switch (type) {
    case 'mining':
      return '⛏️ Mining';
    case 'received':
      return '📥 Received';
    case 'sent':
    default:
      return '📤 Sent';
  }
}

function statusBadgeVariant(status: Transaction['status']): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
    default:
      return 'danger';
  }
}

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const pageSize = 10;

  useEffect(() => {
    const loadTransactions = async () => {
      const activeWallet = walletService.getActiveWallet();
      if (!activeWallet) {
        setTransactions([]);
        return;
      }

      try {
        const history = await walletService.getTransactionHistory(activeWallet.address, 100);
        setTransactions(
          history.map((tx) => ({
            txid: tx.txid,
            type: tx.type === 'sent' ? 'sent' : 'received',
            amount: tx.type === 'sent' ? -tx.amount : tx.amount,
            confirmations: tx.confirmations,
            timestamp: new Date(tx.timestamp || Date.now()),
            status: tx.confirmations > 0 ? 'confirmed' : 'pending',
            fee: tx.fee,
          }))
        );
      } catch {
        setTransactions([]);
      }
    };

    loadTransactions();
  }, []);

  const columns: TableColumn<Transaction>[] = [
    {
      key: 'txid',
      header: 'Transaction ID',
      width: '35%',
      copyable: true,
      render: (value) => (
        <span className={styles.hash}>{truncateHash(value, 10, 8)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '12%',
      render: (value: Transaction['type']) => <Badge variant={typeBadgeVariant(value)}>{typeLabel(value)}</Badge>,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '15%',
      align: 'right',
      render: (value: number) => (
        <span className={value > 0 ? styles.positive : styles.negative}>
          {value > 0 ? '+' : ''}{formatCurrency(Math.abs(value))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (value: Transaction['status'], row) => (
        <Badge
          variant={statusBadgeVariant(value)}
          dot
        >
          {value === 'confirmed' ? `${row.confirmations} conf.` : value}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      header: 'Time',
      width: '16%',
      render: (value: Date) => (
        <span className={styles.time}>{formatRelativeTime(value)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '10%',
      align: 'right',
      render: (_, row) => (
        <Button variant="ghost" size="sm">
          Details
        </Button>
      ),
    },
  ];

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💰', label: 'Wallet', href: '/' },
    { icon: '📊', label: 'Transactions', href: '/transactions' },
    { icon: '📤', label: 'Send', href: '/send' },
    { icon: '📥', label: 'Receive', href: '/receive' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const filteredTxs = transactions.filter((tx) => {
    if (activeTab === 'sent' && tx.type !== 'sent') return false;
    if (activeTab === 'received' && tx.type !== 'received') return false;
    if (activeTab === 'mining' && tx.type !== 'mining') return false;
    if (searchQuery && !tx.txid.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredTxs.length / pageSize);
  const paginatedTxs = filteredTxs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Transaction History</h1>
            <p className={styles.subtitle}>View all your transactions</p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="outline" icon={<span>📥</span>}>
              Export CSV
            </Button>
            <Button variant="primary" icon={<span>📤</span>}>
              New Transaction
            </Button>
          </div>
        </header>

        <Card variant="glass">
          <CardBody>
            <div className={styles.controls}>
              <Tabs
                tabs={[
                  { id: 'all', label: 'All', icon: '📋' },
                  { id: 'received', label: 'Received', icon: '📥' },
                  { id: 'sent', label: 'Sent', icon: '📤' },
                  { id: 'mining', label: 'Mining', icon: '⛏️' },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
                variant="pills"
              />
              
              <Input
                placeholder="Search by transaction ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<span>🔍</span>}
              />
            </div>

            <Table
              columns={columns}
              data={paginatedTxs}
              onRowClick={(tx) => console.log('Clicked:', tx.txid)}
              hoverable
              striped
            />

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredTxs.length}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
