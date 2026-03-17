'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import walletService, { WalletInfo } from '@/services/wallet';
import transactionLabelsService, { TransactionLabel } from '@/services/transactionLabels';

interface TransactionRecord {
  txid: string;
  address?: string;
  amount: number;
  confirmations: number;
  type: 'received' | 'sent' | 'other';
  timestamp?: number;
  fee?: number;
  inputs?: Array<{ address?: string; amount?: number }>;
  outputs?: Array<{ address?: string; amount?: number }>;
  label?: TransactionLabel;
}

export default function TransactionHistoryPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'confirmations'>('date');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTxid, setEditingTxid] = useState<string | null>(null);
  const [labelNote, setLabelNote] = useState('');
  const [labelTags, setLabelTags] = useState('');
  const [labelCategory, setLabelCategory] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    loadWallets();
  }, []);

  useEffect(() => {
    if (activeWallet) {
      loadTransactionHistory();
    }
  }, [activeWallet]);

  useEffect(() => {
    applyFilters();
  }, [transactions, filter, sortBy, searchTerm]);

  const loadWallets = async () => {
    const allWallets = walletService.getWallets();
    setWallets(allWallets);
    
    const active = walletService.getActiveWallet();
    setActiveWallet(active);
    
    if (active) {
      await walletService.updateWalletBalance(active.address);
      const updated = walletService.getWallet(active.address);
      if (updated) {
        setActiveWallet(updated);
      }
    }
  };

  const loadTransactionHistory = async () => {
    if (!activeWallet) return;

    setLoading(true);
    setError(null);

    try {
      const history = await walletService.getTransactionHistory(activeWallet.address, 100);
      
      const txRecords: TransactionRecord[] = history.map((tx) => ({
        ...tx,
        label: transactionLabelsService.getLabel(tx.txid),
      }));

      setTransactions(txRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Filter by type
    if (filter === 'received') {
      filtered = filtered.filter(tx => tx.type === 'received');
    } else if (filter === 'sent') {
      filtered = filtered.filter(tx => tx.type === 'sent');
    } else if (filter === 'pending') {
      filtered = filtered.filter(tx => tx.confirmations === 0);
    }

    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter(tx => tx.label?.tags.includes(tagFilter));
    }

    // Search filter (now includes notes and tags)
    if (searchTerm) {
      filtered = filtered.filter(tx =>
        tx.txid.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.label?.note && tx.label.note.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.label?.tags && tx.label.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
      );
    }

    // Sort
    if (sortBy === 'date') {
      filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (sortBy === 'amount') {
      filtered.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === 'confirmations') {
      filtered.sort((a, b) => b.confirmations - a.confirmations);
    }

    setFilteredTransactions(filtered);
  };

  const handleExport = () => {
    const csv = [
      ['TXID', 'Type', 'Amount (KBC)', 'Confirmations', 'Address', 'Timestamp'].join(','),
      ...filteredTransactions.map(tx => [
        tx.txid,
        tx.type,
        tx.amount.toFixed(8),
        tx.confirmations,
        tx.address,
        tx.timestamp ? new Date(tx.timestamp).toISOString() : 'N/A',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubercoin-transactions-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewTransaction = (txid: string) => {
    router.push(`/explorer/transaction/${txid}`);
  };

  const handleSelectWallet = (wallet: WalletInfo) => {
    setActiveWallet(wallet);
    walletService.setActiveWallet(wallet.address);
  };

  const getStatusBadge = (confirmations: number) => {
    if (confirmations === 0) {
      return <Badge variant="warning">Pending</Badge>;
    } else if (confirmations < 6) {
      return <Badge variant="info">{confirmations} Confirms</Badge>;
    } else {
      return <Badge variant="success">Confirmed</Badge>;
    }
  };

  const getTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const handleEditLabel = (txid: string) => {
    const label = transactionLabelsService.getLabel(txid);
    if (label) {
      setLabelNote(label.note || '');
      setLabelTags(label.tags.join(', '));
      setLabelCategory(label.category || '');
    } else {
      setLabelNote('');
      setLabelTags('');
      setLabelCategory('');
    }
    setEditingTxid(txid);
  };

  const handleSaveLabel = () => {
    if (!editingTxid) return;

    const tags = labelTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t);

    transactionLabelsService.addLabel(
      editingTxid,
      labelNote,
      tags,
      labelCategory
    );

    // Reload transactions to update labels
    loadTransactionHistory();
    setEditingTxid(null);
  };

  const handleDeleteLabel = (txid: string) => {
    transactionLabelsService.deleteLabel(txid);
    loadTransactionHistory();
  };

  const getAllTags = (): string[] => {
    const allTags = new Set<string>();
    transactions.forEach(tx => {
      tx.label?.tags.forEach(tag => allTags.add(tag));
    });
    return Array.from(allTags).sort();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Transaction History
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
          View and manage your transaction history
        </p>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#EF4444',
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
        {/* Sidebar */}
        <div style={{ display: 'grid', gap: '1.5rem', height: 'fit-content' }}>
          {/* Wallet Selection */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Active Wallet
              </h3>
              {activeWallet ? (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    {activeWallet.label}
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {activeWallet.balance.toFixed(8)}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                    KBC
                  </div>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                  No wallet selected
                </div>
              )}
            </CardBody>
          </Card>

          {/* Filters */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Filter
              </h3>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {(['all', 'received', 'sent', 'pending'] as const).map((filterType) => (
                  <button
                    key={filterType}
                    data-testid={`tx-filter-${filterType}`}
                    aria-pressed={filter === filterType}
                    onClick={() => setFilter(filterType)}
                    style={{
                      padding: '0.75rem',
                      background: filter === filterType ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: filter === filterType ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      textTransform: 'capitalize',
                    }}
                  >
                    {filterType}
                  </button>
                ))}
              </div>

              {/* Tags Filter */}
              {getAllTags().length > 0 && (
                <>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '1rem' }}>
                    Filter by Tag
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      onClick={() => setTagFilter(null)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: !tagFilter ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                        border: !tagFilter ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      All
                    </button>
                    {getAllTags().map(tag => (
                      <button
                        key={tag}
                        onClick={() => setTagFilter(tag)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: tagFilter === tag ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                          border: tagFilter === tag ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {/* Sort Options */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Sort By
              </h3>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {(['date', 'amount', 'confirmations'] as const).map((sortType) => (
                  <button
                    key={sortType}
                    onClick={() => setSortBy(sortType)}
                    style={{
                      padding: '0.75rem',
                      background: sortBy === sortType ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: sortBy === sortType ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      textTransform: 'capitalize',
                    }}
                  >
                    {sortType}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Actions */}
          <Card variant="glass">
            <CardBody>
              <Button
                onClick={handleExport}
                disabled={filteredTransactions.length === 0}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  opacity: filteredTransactions.length === 0 ? 0.5 : 1,
                  cursor: filteredTransactions.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                📥 Export CSV
              </Button>
            </CardBody>
          </Card>
        </div>

        {/* Main Content */}
        <div>
          {/* Search Bar */}
          <div style={{ marginBottom: '1.5rem' }}>
            <Card variant="glass">
              <CardBody>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by transaction ID or address..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                }}
              />
              </CardBody>
            </Card>
          </div>

          {/* Transaction List */}
          {loading ? (
            <Card variant="glass">
              <CardBody>
                <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  Loading transactions...
                </div>
              </CardBody>
            </Card>
          ) : filteredTransactions.length === 0 ? (
            <Card variant="glass">
              <CardBody>
                <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  {searchTerm ? 'No transactions found matching your search' : 'No transactions yet'}
                </div>
              </CardBody>
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {filteredTransactions.map((tx, idx) => (
                <Card key={`${tx.txid}-${idx}`} variant="glass">
                  <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: tx.type === 'received' 
                              ? 'rgba(16, 185, 129, 0.2)' 
                              : 'rgba(239, 68, 68, 0.2)',
                            border: tx.type === 'received'
                              ? '2px solid #10B981'
                              : '2px solid #EF4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                          }}>
                            {tx.type === 'received' ? '↓' : '↑'}
                          </div>
                          <div>
                            <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                              {tx.type === 'received' ? 'Received' : 'Sent'}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                              {getTimestamp(tx.timestamp)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)' }}>TXID:</div>
                          <div style={{ color: '#8B5CF6', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {tx.txid.slice(0, 32)}...{tx.txid.slice(-16)}
                          </div>

                          <div style={{ color: 'rgba(255,255,255,0.6)' }}>Address:</div>
                          <div style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>
                            {tx.address}
                          </div>

                          <div style={{ color: 'rgba(255,255,255,0.6)' }}>Status:</div>
                          <div>{getStatusBadge(tx.confirmations)}</div>
                        </div>

                        {/* Label Display */}
                        {tx.label && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px' }}>
                            {tx.label.note && (
                              <div style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                📝 {tx.label.note}
                              </div>
                            )}
                            {tx.label.category && (
                              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                Category: {tx.label.category}
                              </div>
                            )}
                            {tx.label.tags.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {tx.label.tags.map(tag => (
                                  <span
                                    key={tag}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      background: 'rgba(139, 92, 246, 0.2)',
                                      border: '1px solid #8B5CF6',
                                      borderRadius: '12px',
                                      color: '#8B5CF6',
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => handleDeleteLabel(tx.txid)}
                              style={{
                                marginTop: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid #EF4444',
                                borderRadius: '4px',
                                color: '#EF4444',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Remove Label
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', marginLeft: '2rem' }}>
                        <div style={{
                          color: tx.type === 'received' ? '#10B981' : '#EF4444',
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          marginBottom: '0.25rem',
                        }}>
                          {tx.type === 'received' ? '+' : '-'}{tx.amount.toFixed(8)}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                          KBC
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <Button
                            onClick={() => handleViewTransaction(tx.txid)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(139, 92, 246, 0.2)',
                              border: '1px solid #8B5CF6',
                              color: '#8B5CF6',
                              fontSize: '0.85rem',
                            }}
                          >
                            View Details
                          </Button>
                          <Button
                            onClick={() => handleEditLabel(tx.txid)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(16, 185, 129, 0.2)',
                              border: '1px solid #10B981',
                              color: '#10B981',
                              fontSize: '0.85rem',
                            }}
                          >
                            {tx.label ? 'Edit' : 'Add'} Label
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {/* Summary */}
          {filteredTransactions.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <Card variant="glass">
                <CardBody>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      Total Transactions
                    </div>
                    <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                      {filteredTransactions.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      Total Received
                    </div>
                    <div style={{ color: '#10B981', fontSize: '1.5rem', fontWeight: 700 }}>
                      {filteredTransactions
                        .filter(tx => tx.type === 'received')
                        .reduce((sum, tx) => sum + tx.amount, 0)
                        .toFixed(8)} KBC
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      Pending
                    </div>
                    <div style={{ color: '#FBBF24', fontSize: '1.5rem', fontWeight: 700 }}>
                      {filteredTransactions.filter(tx => tx.confirmations === 0).length}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
            </div>
          )}
        </div>
      </div>

      {/* Edit Label Dialog */}
      {editingTxid && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 50,
        }}>
          <div style={{
            background: '#1A1A2E',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '100%',
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}>
            <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
              {transactionLabelsService.getLabel(editingTxid) ? 'Edit' : 'Add'} Transaction Label
            </h2>

            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Note
                </label>
                <textarea
                  value={labelNote}
                  onChange={(e) => setLabelNote(e.target.value)}
                  placeholder="Add a note about this transaction..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={labelTags}
                  onChange={(e) => setLabelTags(e.target.value)}
                  placeholder="payment, invoice, salary"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Category
                </label>
                <select
                  value={labelCategory}
                  onChange={(e) => setLabelCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="">Select category...</option>
                  <option value="payment">Payment</option>
                  <option value="income">Income</option>
                  <option value="exchange">Exchange</option>
                  <option value="mining">Mining</option>
                  <option value="trading">Trading</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button
                onClick={() => setEditingTxid(null)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveLabel}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                  border: 'none',
                  color: '#fff',
                }}
              >
                Save Label
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
