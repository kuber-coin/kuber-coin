'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Table } from '../../components/Table';
import { CopyButton } from '../../components/CopyButton';
import { Search } from '../../components/Search';
import { Pagination } from '../../components/Pagination';
import { Tabs } from '../../components/Tabs';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/Input';
import styles from './addresses.module.css';

interface Address {
  address: string;
  balance: number;
  used: boolean;
  txCount: number;
  lastUsed: string | null;
  path: string;
  type: 'receive' | 'change';
}

export default function AddressesPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCount, setGenerateCount] = useState('1');

  const sidebarItems = [
    { icon: '💰', label: 'Wallet', href: '/dashboard' },
    { icon: '🔑', label: 'Key Manager', href: '/wallet/key-manager' },
    { icon: '📍', label: 'Addresses', href: '/wallet/addresses' },
    { icon: '💎', label: 'UTXOs', href: '/wallet/utxos' },
    { icon: '📝', label: 'Transaction Builder', href: '/wallet/tx-builder' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  const addresses: Address[] = [];

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

  const hasReuseWarning = addresses.some((addr) => addr.used && addr.balance > 0);

  const columns = [
    {
      key: 'address',
      label: 'Address',
      render: (address: string, row: Address) => (
        <div className={styles.addressCell}>
          <code className={styles.addressCode}>{address.slice(0, 20)}...{address.slice(-8)}</code>
          <CopyButton text={address} size="sm" />
          {row.used && row.txCount > 1 && (
            <Badge variant="warning" size="sm">Reused</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Balance',
      render: (balance: number) => (
        <span className={styles.balance}>
          {balance.toFixed(8)} KC
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (_value: Address['type'], row: Address) => (
        <Badge variant={row.type === 'receive' ? 'info' : 'default'}>
          {row.type}
        </Badge>
      ),
    },
    {
      key: 'txCount',
      label: 'Transactions',
      render: (txCount: number) => txCount,
    },
    {
      key: 'path',
      label: 'Derivation Path',
      render: (path: string) => (
        <code className={styles.pathCode}>{path}</code>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: unknown, row: Address) => (
        <Badge variant={row.used ? 'success' : 'default'}>
          {row.used ? 'Used' : 'Fresh'}
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
          <Button variant="primary" onClick={() => setShowGenerateModal(true)}>
            ➕ Generate New Address
          </Button>
        </header>

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
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search addresses..."
              />
            </div>
          </CardHeader>
          <CardBody>
            <Tabs
              tabs={[
                { id: 'all', label: 'All Addresses', badge: addresses.length.toString() },
                { id: 'used', label: 'Used', badge: addresses.filter(a => a.used).length.toString() },
                { id: 'unused', label: 'Fresh', badge: addresses.filter(a => !a.used).length.toString() },
                { id: 'receive', label: 'Receive', badge: addresses.filter(a => a.type === 'receive').length.toString() },
                { id: 'change', label: 'Change', badge: addresses.filter(a => a.type === 'change').length.toString() },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="pills"
            />

            <div className={styles.tableContainer}>
              <Table
                columns={columns}
                data={filteredAddresses}
                hoverable
              />
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={filteredAddresses.length}
              itemsPerPage={10}
              onPageChange={setCurrentPage}
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
          onClose={() => setShowGenerateModal(false)}
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
              helperText="How many addresses to generate (max 100)"
            />
            <div className={styles.infoBox}>
              <strong>Derivation Path:</strong> m/44'/0'/0'/0/n
              <br />
              <small>Next index: {addresses.filter(a => a.type === 'receive').length}</small>
            </div>
            <div className={styles.modalActions}>
              <Button variant="outline" onClick={() => setShowGenerateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  alert('Address generation requires a wallet backend.');
                  setShowGenerateModal(false);
                }}
              >
                Generate Addresses
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
