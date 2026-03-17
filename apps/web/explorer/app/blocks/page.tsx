'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Pagination } from '../components/Pagination';
import { formatRelativeTime, truncateHash, formatBytes } from '../utils/formatters';
import styles from './blocks.module.css';

interface Block {
  height: number;
  hash: string;
  timestamp: Date;
  transactions: number;
  size: number;
  miner: string;
  reward: number;
}

export default function BlocksPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const rpcCall = useCallback(async (method: string, params: any[] = []) => {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? 'RPC error');
    return json.result;
  }, []);

  const loadBlocks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const height: number = await rpcCall('getblockcount');
      const fetched: Block[] = [];
      const limit = Math.min(pageSize * 3, height + 1);
      for (let i = 0; i < limit; i++) {
        const hash: string = await rpcCall('getblockhash', [height - i]);
        const block: any = await rpcCall('getblock', [hash, 1]);
        fetched.push({
          height: block.height ?? height - i,
          hash: block.hash ?? hash,
          timestamp: new Date((block.time ?? 0) * 1000),
          transactions: Array.isArray(block.tx) ? block.tx.length : 0,
          size: block.size ?? 0,
          miner: block.miner ?? '—',
          reward: block.reward ?? 0,
        });
      }
      setBlocks(fetched);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load blocks');
    } finally {
      setLoading(false);
    }
  }, [rpcCall]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const columns: TableColumn<Block>[] = [
    {
      key: 'height',
      header: 'Height',
      width: '10%',
      render: (value: number) => (
        <span className={styles.height}>#{value.toLocaleString()}</span>
      ),
    },
    {
      key: 'hash',
      header: 'Block Hash',
      width: '30%',
      copyable: true,
      render: (value: string) => (
        <span className={styles.hash}>{truncateHash(value, 12, 10)}</span>
      ),
    },
    {
      key: 'transactions',
      header: 'TXs',
      width: '10%',
      align: 'center',
      render: (value: number) => (
        <Badge variant="info">{value}</Badge>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      width: '12%',
      align: 'right',
      render: (value: number) => (
        <span className={styles.size}>{formatBytes(value)}</span>
      ),
    },
    {
      key: 'miner',
      header: 'Miner',
      width: '15%',
      render: (value: string) => (
        <Badge variant="purple">{value}</Badge>
      ),
    },
    {
      key: 'timestamp',
      header: 'Age',
      width: '15%',
      render: (value: Date) => (
        <span className={styles.time}>{formatRelativeTime(value)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '8%',
      align: 'right',
      render: (_value: unknown, row: Block) => (
        <Link href={`/block/${row.hash}`}>
          <Button variant="ghost" size="sm">View</Button>
        </Link>
      ),
    },
  ];

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔍', label: 'Explorer', href: '/' },
    { icon: '📦', label: 'Blocks', href: '/blocks' },
    { icon: '�', label: 'Statistics', href: '/statistics' },
  ];

  const filteredBlocks = blocks.filter((block) => {
    if (!searchQuery) return true;
    return (
      block.height.toString().includes(searchQuery) ||
      block.hash.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filteredBlocks.length / pageSize);
  const paginatedBlocks = filteredBlocks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Recent Blocks</h1>
            <p className={styles.subtitle}>
              Latest {blocks.length} blocks on the blockchain
            </p>
          </div>
          <Input
            placeholder="Search by height or hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<span>🔍</span>}
          />
        </header>

        <Card variant="glass">
          <CardBody>
            {loading ? (
              <div className={styles.emptyState}>Loading blocks…</div>
            ) : error ? (
              <div className={styles.emptyState}>Error: {error}</div>
            ) : blocks.length === 0 ? (
              <div className={styles.emptyState}>
                No block data available. Connect an RPC backend to load blocks.
              </div>
            ) : (
              <Table
                columns={columns}
                data={paginatedBlocks}
                onRowClick={(block: Block) => console.log('Block:', block.height)}
                hoverable
                striped
              />
            )}

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredBlocks.length}
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
