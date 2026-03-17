'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { CopyButton } from '../../components/CopyButton';
import { Search } from '../../components/Search';
import { Pagination } from '../../components/Pagination';
import { Tabs } from '../../components/Tabs';
import Modal from '../../components/Modal';
import { Input } from '../../components/Input';
import walletService from '@/services/wallet';
import styles from './addresses.module.css';

interface Address {
  address: string;
  balance: number;
  used: boolean;
  txCount: number;
  lastUsed: string | null;
  path: string;
  type: 'receive' | 'change';
  watchOnly?: boolean;
}

export default function AddressesPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCount, setGenerateCount] = useState('1');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pageSize = 10;

  const loadAddresses = async () => {
    setLoading(true);
    setError(null);

    try {
      await walletService.updateAllBalances();
      const wallets = walletService.getWallets();
      const addressRows = await Promise.all(
        wallets.map(async (wallet, index) => {
          const history = await walletService.getTransactionHistory(wallet.address, 100).catch(() => []);
          const latestTimestamp = history
            .map((tx) => tx.timestamp)
            .filter((timestamp): timestamp is number => typeof timestamp === 'number')
            .sort((left, right) => right - left)[0];

          return {
            address: wallet.address,
            balance: wallet.balance + wallet.unconfirmedBalance,
            used: history.length > 0 || wallet.balance > 0 || wallet.unconfirmedBalance > 0,
            txCount: history.length,
            lastUsed: latestTimestamp ? new Date(latestTimestamp).toLocaleString() : null,
            path: wallet.watchOnly ? 'watch-only' : `m/44'/0'/0'/0/${index}`,
            type: 'receive' as const,
            watchOnly: wallet.watchOnly,
          };
        })
      );

      setAddresses(addressRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses');
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAddresses();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const sidebarItems = [
    { icon: '💰', label: 'Wallet', href: '/dashboard' },
    { icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
    { icon: '📍', label: 'Addresses', href: '/wallet/addresses' },
    { icon: '💎', label: 'UTXOs', href: '/wallet/utxos' },
    { icon: '📝', label: 'Transaction Builder', href: '/wallet/tx-builder' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const filteredAddresses = addresses.filter((addr) => {
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'used' && addr.used) ||
      (activeTab === 'unused' && !addr.used) ||
      (activeTab === 'receive' && addr.type === 'receive') ||
      (activeTab === 'change' && addr.type === 'change');
    const matchesSearch =
      searchQuery === '' || addr.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pagedAddresses = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAddresses.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredAddresses]);

  const hasReuseWarning = addresses.some((addr) => addr.used && addr.balance > 0);

  const handleGenerateAddresses = async () => {
    const requested = Number.parseInt(generateCount, 10);
    if (!Number.isFinite(requested) || requested <= 0 || requested > 100) {
      setError('Enter a number between 1 and 100');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      for (let index = 0; index < requested; index += 1) {
        const label = requested === 1
          ? `Receive Address ${addresses.length + 1}`
          : `Receive Address ${addresses.length + index + 1}`;
        await walletService.generateWallet(label);
      }

      await loadAddresses();
      setSuccess(`Generated ${requested} new ${requested === 1 ? 'address' : 'addresses'}`);
      setShowGenerateModal(false);
      setGenerateCount('1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate addresses');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'address',
      header: 'Address',
      render: (_value: unknown, addr: Address) => (
        <div className={styles.addressCell}>
          <code className={styles.addressCode}>{addr.address.slice(0, 20)}...{addr.address.slice(-8)}</code>
          <CopyButton text={addr.address} size="sm" />
          {addr.used && addr.txCount > 1 && (
            <Badge variant="warning" size="sm">Reused</Badge>
          )}
          {addr.watchOnly && (
            <Badge variant="default" size="sm">Watch-only</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (_value: unknown, addr: Address) => (
        <span className={styles.balance}>
          {addr.balance.toFixed(8)} KC
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (_value: unknown, addr: Address) => (
        <Badge variant={addr.type === 'receive' ? 'info' : 'default'}>
          {addr.type}
        </Badge>
      ),
    },
    {
      key: 'txCount',
      header: 'Transactions',
      render: (_value: unknown, addr: Address) => addr.txCount,
    },
    {
      key: 'lastUsed',
      header: 'Last Used',
      render: (_value: unknown, addr: Address) => addr.lastUsed || 'Never',
    },
    {
      key: 'path',
      header: 'Derivation Path',
      render: (_value: unknown, addr: Address) => (
        <code className={styles.pathCode}>{addr.path}</code>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (_value: unknown, addr: Address) => (
        <Badge variant={addr.used ? 'success' : 'default'}>
          {addr.used ? 'Used' : 'Fresh'}
        </Badge>
      ),
    },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Address Manager</h1>
            <p className={styles.subtitle}>
              HD Address Generation • BIP-44 Derivation • One-Time Use Detection
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowGenerateModal(true)} disabled={submitting}>
            ➕ Generate New Address
          </Button>
        </header>

        {error && (
          <div className={styles.warningBanner}>
            <span className={styles.warningIcon}>⚠️</span>
            <div>
              <strong>Address manager error</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className={styles.warningBanner}>
            <span className={styles.warningIcon}>✅</span>
            <div>
              <strong>Addresses updated</strong>
              <p>{success}</p>
            </div>
          </div>
        )}

        {hasReuseWarning && (
          <div className={styles.warningBanner}>
            <span className={styles.warningIcon}>⚠️</span>
            <div>
              <strong>Address Reuse Detected</strong>
              <p>
                Some addresses have been used multiple times. For privacy, generate a new address for each transaction.
              </p>
            </div>
            <Button variant="outline" size="sm">
              Learn More
            </Button>
          </div>
        )}

        <Card variant="glass">
          <CardHeader>
            <div className={styles.cardHeader}>
              <h3>Your Addresses</h3>
              <Search
                onChange={(query) => setSearchQuery(query)}
                placeholder="Search addresses..."
              />
            </div>
          </CardHeader>
          <CardBody>
            <Tabs
              tabs={[
                { id: 'all', label: `All Addresses (${addresses.length})` },
                { id: 'used', label: `Used (${addresses.filter(a => a.used).length})` },
                { id: 'unused', label: `Fresh (${addresses.filter(a => !a.used).length})` },
                { id: 'receive', label: `Receive (${addresses.filter(a => a.type === 'receive').length})` },
                { id: 'change', label: `Change (${addresses.filter(a => a.type === 'change').length})` },
              ]}
              defaultTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId)}
              variant="pills"
            />

            <div className={styles.tableContainer}>
              <Table
                columns={columns}
                data={pagedAddresses}
                loading={loading}
                emptyMessage="No wallet addresses available yet. Generate a receive address to start using this wallet."
                hoverable
              />
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(filteredAddresses.length / pageSize))}
              onPageChange={setCurrentPage}
              totalItems={filteredAddresses.length}
              itemsPerPage={pageSize}
            />
          </CardBody>
        </Card>

        <div className={styles.infoGrid}>
          <Card variant="glass">
            <CardBody>
              <h4 className={styles.infoTitle}>🔐 Privacy Best Practices</h4>
              <ul className={styles.infoList}>
                <li>Use a fresh address for each incoming transaction</li>
                <li>Avoid reusing addresses to prevent transaction linking</li>
                <li>Change addresses are automatically used for outputs</li>
                <li>HD wallet generates unlimited addresses from one seed</li>
              </ul>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody>
              <h4 className={styles.infoTitle}>📊 Address Statistics</h4>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{addresses.length}</span>
                  <span className={styles.statLabel}>Total Addresses</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{addresses.filter(a => a.used).length}</span>
                  <span className={styles.statLabel}>Used</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{addresses.filter(a => !a.used).length}</span>
                  <span className={styles.statLabel}>Fresh</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Modal
          isOpen={showGenerateModal}
          onCloseAction={() => setShowGenerateModal(false)}
          title="Generate New Addresses"
          size="md"
        >
          <div className={styles.modalContent}>
            <p>Generate one or more fresh addresses from your HD wallet.</p>
            <Input
              label="Number of Addresses"
              type="number"
              value={generateCount}
              onChange={(e) => setGenerateCount(e.target.value)}
              placeholder="1"
            />
            <p className={styles.helperText}>How many addresses to generate (max 100)</p>
            <div className={styles.infoBox}>
              <strong>Derivation Path:</strong> m/44'/0'/0'/0/n
              <br />
              <small>Next index: {addresses.filter(a => a.type === 'receive').length}</small>
            </div>
            <div className={styles.modalActions}>
              <Button variant="outline" onClick={() => setShowGenerateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleGenerateAddresses()} disabled={submitting}>
                {submitting ? 'Generating…' : 'Generate Addresses'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
