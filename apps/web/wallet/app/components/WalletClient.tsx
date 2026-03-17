'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './WalletClient.module.css';
import AppHeader from './AppHeader';
import StatusBanner from './StatusBanner';
import Modal from './Modal';
import { StatCard } from './StatCard';

const BALANCE_SKELETON_KEYS = ['bal-sk-1', 'bal-sk-2', 'bal-sk-3', 'bal-sk-4', 'bal-sk-5'];

type WalletInfo = {
  address: string;
  height: number;
  spendable: number;
  total: number;
  immature: number;
};

type WalletEntry = {
  file: string;
  display: string;
};

type TxEntry = {
  txid?: string;
  [key: string]: any;
};

type PendingSend = {
  to: string;
  amount: number;
};

function normalizeWalletFile(name: string) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('.dat') ? trimmed : `${trimmed}.dat`;
}

function displayWalletName(file: string) {
  const trimmed = (file || '').trim();
  return trimmed.toLowerCase().endsWith('.dat') ? trimmed.slice(0, -4) : trimmed;
}

function isLikelyAddress(input: string) {
  const value = (input || '').trim();
  if (value.length < 5) return false;
  if (/\s/.test(value)) return false;
  return /^[a-zA-Z0-9]+$/.test(value);
}

export default function WalletClient() {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [selectedWalletFile, setSelectedWalletFile] = useState('');

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('1000');
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState<TxEntry[]>([]);
  const [headerQuery, setHeaderQuery] = useState('');

  const [txid, setTxid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  const [txDetailsOpen, setTxDetailsOpen] = useState(false);
  const [txDetailsData, setTxDetailsData] = useState<TxEntry | null>(null);
  const [txDetailsCopyHint, setTxDetailsCopyHint] = useState<string | null>(null);

  const selectedWalletDisplay = useMemo(() => {
    if (!selectedWalletFile) return '';
    return wallets.find((w) => w.file === selectedWalletFile)?.display || displayWalletName(selectedWalletFile);
  }, [wallets, selectedWalletFile]);

  const filteredHistory = useMemo(() => {
    const q = headerQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((tx) => {
      const s = (tx?.txid || JSON.stringify(tx)).toString().toLowerCase();
      return s.includes(q);
    });
  }, [history, headerQuery]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    globalThis.setTimeout(() => setToast(null), 1600);
  }, []);

  const copyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied`);
      } catch {
        showToast('Copy failed');
      }
    },
    [showToast]
  );

  const copyFromModal = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setTxDetailsCopyHint(`${label} copied`);
      globalThis.setTimeout(() => setTxDetailsCopyHint(null), 1400);
    } catch {
      setTxDetailsCopyHint('Copy failed');
      globalThis.setTimeout(() => setTxDetailsCopyHint(null), 1400);
    }
  }, []);

  const openTxDetails = useCallback((tx: TxEntry) => {
    setTxDetailsData(tx);
    setTxDetailsCopyHint(null);
    setTxDetailsOpen(true);
  }, []);

  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch('/api/wallets');
      if (!res.ok) throw new Error('Failed to load wallets');
      const data = await res.json();
      const files: string[] = data.wallets || [];

      const entries: WalletEntry[] = files
        .map((file) => ({ file, display: displayWalletName(file) }))
        .sort((a, b) => {
          if (a.display === 'test-wallet') return -1;
          if (b.display === 'test-wallet') return 1;
          return a.display.localeCompare(b.display);
        });

      setWallets(entries);

      if (!selectedWalletFile) {
        const preferred = entries.find((w) => w.display === 'test-wallet')?.file;
        setSelectedWalletFile(preferred || entries[0]?.file || '');
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedWalletFile]);

  const loadBalance = useCallback(async () => {
    if (!selectedWalletFile) return;

    try {
      setLoadingBalance(true);
      const res = await fetch(`/api/wallet/balance?name=${encodeURIComponent(selectedWalletFile)}`);
      if (!res.ok) throw new Error('Failed to load balance');
      const data = await res.json();
      setWalletInfo(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingBalance(false);
    }
  }, [selectedWalletFile]);

  const loadHistory = useCallback(async () => {
    if (!selectedWalletFile) return;
    try {
      const res = await fetch(`/api/wallet/history?name=${encodeURIComponent(selectedWalletFile)}`);
      const data = await res.json();
      setHistory(data.transactions || []);
    } catch {
      setHistory([]);
    }
  }, [selectedWalletFile]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    if (!selectedWalletFile) return;
    loadBalance();
    const interval = globalThis.setInterval(loadBalance, 10000);
    return () => globalThis.clearInterval(interval);
  }, [selectedWalletFile, loadBalance]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  const openConfirm = (to: string, amount: number) => {
    setPendingSend({ to, amount });
    setConfirmOpen(true);
  };

  const executeSend = useCallback(async () => {
    if (!pendingSend || !selectedWalletFile) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    setTxid(null);

    try {
      const res = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectedWalletFile,
          to: pendingSend.to,
          amount: pendingSend.amount,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Send failed');
      }

      setTxid(data.txid);
      setSuccess('Transaction sent successfully');
      setConfirmOpen(false);
      setPendingSend(null);
      setSendTo('');
      setSendAmount('1000');
      globalThis.setTimeout(loadBalance, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pendingSend, selectedWalletFile, loadBalance]);

  const handleSendClick = () => {
    if (!selectedWalletFile) return;

    const to = sendTo.trim();
    const amount = Number.parseInt(sendAmount, 10);

    if (!to) return;
    if (!isLikelyAddress(to)) {
      setError('Invalid address');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    setError(null);
    openConfirm(to, amount);
  };

  const handleCreateWallet = async () => {
    const name = createName.trim();
    if (!name) {
      setError('Wallet name is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setCreatedMnemonic(null);

    try {
      const res = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Create wallet failed');
      }

      setCreatedMnemonic(data.mnemonic || null);
      setSuccess('Wallet created');
      await loadWallets();
      if (data.name) {
        setSelectedWalletFile(normalizeWalletFile(data.name));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <AppHeader
        title="💰 KuberCoin Wallet"
        active="Wallet"
        center={
          <div className={styles.headerSearch}>
            <div className={styles.headerSearchForm}>
              <input
                type="search"
                placeholder="Filter history / txid…"
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
                className={styles.headerSearchInput}
                aria-label="Filter transaction history"
              />
              {headerQuery ? (
                <button
                  type="button"
                  className={styles.headerSearchBtnSecondary}
                  onClick={() => setHeaderQuery('')}
                >
                  Clear
                </button>
              ) : null}
              <button type="button" className={styles.headerSearchBtn} onClick={() => setActiveTab('history')}>
                History
              </button>
            </div>
          </div>
        }
        right={
          selectedWalletDisplay ? (
            <div className={styles.headerMeta}>
              <div className={styles.headerMetaLabel}>Selected</div>
              <div className={styles.headerMetaValue}>{selectedWalletDisplay}</div>
            </div>
          ) : null
        }
      />

      <StatusBanner />

      {toast && (
        <output className={styles.toast} aria-live="polite">
          {toast}
        </output>
      )}

      <main className={styles.main}>
        {error && <div className={`${styles.error} error-message`}>{error}</div>}
        {success && (
          <div className={`${styles.success} success-message transaction-success`}>
            {success}
            {txid && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.9 }}>
                TXID: <span data-testid="transaction-id">{txid}</span>
              </div>
            )}
          </div>
        )}

        {/* Wallet Analytics */}
        {walletInfo && (
          <section className={styles.statsSection}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.titleIcon}>💰</span>{' '}
              Wallet Overview
            </h2>
            <div className={styles.statsGrid}>
              <StatCard
                icon="💵"
                label="Total Balance"
                value={`${walletInfo.total.toFixed(8)} KBR`}
                variant="blue"
              />
              <StatCard
                icon="✅"
                label="Spendable"
                value={`${walletInfo.spendable.toFixed(8)} KBR`}
                trend={walletInfo.spendable > 0 ? '🟢 Available' : ''}
                variant="gold"
              />
              <StatCard
                icon="⏳"
                label="Immature"
                value={`${walletInfo.immature.toFixed(8)} KBR`}
                variant="purple"
              />
              <StatCard
                icon="📦"
                label="Sync Height"
                value={walletInfo.height.toLocaleString()}
                variant="green"
              />
            </div>
          </section>
        )}

        <section className={styles.card}>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Wallet</h2>
            <button
              type="button"
              data-testid="create-wallet-button"
              className={styles.refreshBtn}
              onClick={() => {
                setCreateOpen(true);
                setCreateName(`test-wallet-${Date.now()}`);
                setCreatedMnemonic(null);
              }}
            >
              + Create
            </button>
          </div>

          <div style={{ marginTop: '0.75rem', position: 'relative' }}>
            <button
              type="button"
              data-testid="wallet-selector"
              className={styles.select}
              onClick={() => setWalletDropdownOpen((v) => !v)}
            >
              {selectedWalletDisplay || 'Select wallet'}
            </button>

            {walletDropdownOpen && (
              <div style={{ marginTop: '0.5rem' }}>
                {wallets.map((w) => (
                  <button
                    key={w.file}
                    type="button"
                    data-testid="wallet-option"
                    className={styles.select}
                    onClick={() => {
                      setSelectedWalletFile(w.file);
                      setWalletDropdownOpen(false);
                      setSettingsOpen(false);
                      setTxid(null);
                      setSuccess(null);
                      setError(null);
                      setActiveTab('send');
                    }}
                  >
                    {w.display}
                  </button>
                ))}
              </div>
            )}
          </div>

          {wallets.length === 0 && <p className={styles.hint}>No wallets found.</p>}
        </section>

        {(walletInfo || (selectedWalletFile && loadingBalance)) && (
          <section className={styles.card}>
            <h2>Balance</h2>
            {walletInfo ? (
              <>
                <div className={styles.balanceGrid}>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>Address</div>
                    <div className={styles.monoRow}>
                      <div className={styles.balanceValue + ' ' + styles.address}>{walletInfo.address}</div>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        onClick={() => void copyText(walletInfo.address, 'Address')}
                        aria-label="Copy address"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>Height</div>
                    <div className={styles.balanceValue}>{walletInfo.height.toLocaleString()}</div>
                  </div>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>Spendable</div>
                    <div className={styles.balanceValue + ' ' + styles.amount} data-testid="wallet-balance">
                      {Math.floor(walletInfo.spendable).toLocaleString()} KC
                    </div>
                  </div>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>Total</div>
                    <div className={styles.balanceValue}>{walletInfo.total.toLocaleString()} sat</div>
                  </div>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>Immature</div>
                    <div className={styles.balanceValue}>{walletInfo.immature.toLocaleString()} sat</div>
                  </div>
                </div>

                <button onClick={loadBalance} className={styles.refreshBtn} data-testid="refresh-balance" type="button">
                  Refresh Balance
                </button>
              </>
            ) : (
              <div className={styles.balanceGrid}>
                {BALANCE_SKELETON_KEYS.map((key, index) => (
                  <div className={styles.balanceItem} key={key}>
                    <div className={styles.balanceLabel}>
                      <span className={styles.skeletonLine} style={{ width: '5rem' }} />
                    </div>
                    <div className={styles.balanceValue}>
                      <span
                        className={styles.skeletonLine}
                        style={{ width: index === 0 ? '18rem' : '8rem' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setActiveTab('send');
                  setSettingsOpen(false);
                }}
              >
                Send
              </button>
              <button type="button" data-testid="history-tab" className={styles.actionBtn} onClick={() => setActiveTab('history')}>
                History
              </button>
              <button type="button" data-testid="settings-menu" className={styles.actionBtn} onClick={() => setSettingsOpen((v) => !v)}>
                Settings
              </button>
            </div>

            {settingsOpen && selectedWalletFile && (
              <div style={{ marginTop: '0.75rem' }}>
                <a
                  data-testid="export-backup"
                  className={styles.actionBtn}
                  href={`/api/wallet/export?name=${encodeURIComponent(selectedWalletFile)}`}
                  download
                >
                  Export Backup
                </a>
              </div>
            )}
          </section>
        )}

        {walletInfo && activeTab === 'send' && (
          <section className={styles.card}>
            <h2>Send Transaction</h2>
            <div className={styles.sendForm}>
              <div className={styles.formGroup}>
                <label htmlFor="sendTo">To Address</label>
                <input
                  id="sendTo"
                  type="text"
                  placeholder="m..."
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className={styles.input}
                  data-testid="to-address"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="sendAmount">Amount (satoshis)</label>
                <input
                  id="sendAmount"
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  className={styles.input}
                  data-testid="amount"
                  min="1"
                  required
                />
              </div>
              <button type="button" disabled={loading} className={styles.sendBtn} data-testid="send-button" onClick={handleSendClick}>
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>

            {txid && (
              <div className="transaction-success" style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>TXID:</span>
                  <span data-testid="transaction-id" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {txid}
                  </span>
                  <button type="button" className={styles.copyBtn} onClick={() => void copyText(txid, 'TXID')}>
                    Copy
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {walletInfo && activeTab === 'history' && (
          <section className={styles.card}>
            <h2>Transaction History</h2>
            <div data-testid="transaction-history" className={styles.historyList}>
              {filteredHistory.length === 0 ? (
                <div className="transaction-item">No transactions</div>
              ) : (
                filteredHistory.map((tx) => {
                  const key = typeof tx.txid === 'string' && tx.txid ? tx.txid : JSON.stringify(tx);
                  return (
                    <div key={key} className="transaction-item">
                      <div className={styles.txMain}>{tx.txid || JSON.stringify(tx)}</div>
                      <button
                        type="button"
                        className={styles.txDetailsBtn}
                        onClick={() => openTxDetails(tx)}
                      >
                        Details
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <a href="http://localhost:3200" target="_blank" rel="noopener">
          Explorer
        </a>
        {' · '}
        <a href="http://localhost:3100" target="_blank" rel="noopener">
          Monitoring
        </a>
        {' · '}
        <a href="http://localhost:3300" target="_blank" rel="noopener">
          Operations
        </a>
      </footer>

      <Modal
        title="Confirm Transaction"
        open={confirmOpen}
        onCloseAction={() => {
          setConfirmOpen(false);
          setPendingSend(null);
        }}
        className="confirmation-dialog"
      >
        {pendingSend ? (
          <>
            <div className={styles.dialogGrid}>
              <div className={styles.dialogLabel}>To</div>
              <div className={styles.dialogValue}>{pendingSend.to}</div>

              <div className={styles.dialogLabel}>Amount</div>
              <div className={styles.dialogValue}>{pendingSend.amount.toLocaleString()}</div>
            </div>

            {pendingSend.amount >= 500000 && (
              <div className={`large-amount-warning ${styles.dialogWarning}`}>Large amount warning</div>
            )}

            <div className={styles.dialogActions}>
              <button
                type="button"
                data-testid="confirm-send"
                className={styles.primaryBtn}
                onClick={() => void executeSend()}
                disabled={loading}
              >
                Confirm
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingSend(null);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        title="Create Wallet"
        open={createOpen}
        onCloseAction={() => {
          setCreateOpen(false);
          setCreatedMnemonic(null);
        }}
      >
        <div className={styles.dialogStack}>
          <input
            className={styles.input}
            data-testid="wallet-name-input"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="wallet name"
          />

          <div className={styles.dialogActions}>
            <button
              type="button"
              data-testid="create-button"
              className={styles.primaryBtn}
              onClick={handleCreateWallet}
              disabled={loading}
            >
              Create
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setCreateOpen(false);
                setCreatedMnemonic(null);
              }}
            >
              Close
            </button>
          </div>

          {createdMnemonic && (
            <div className={styles.mnemonicBox}>
              <div className={styles.mnemonicLabel}>Mnemonic (save this)</div>
              <div data-testid="mnemonic-phrase" className={styles.mnemonicPhrase}>
                {createdMnemonic}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="Transaction Details"
        open={txDetailsOpen}
        onCloseAction={() => {
          setTxDetailsOpen(false);
          setTxDetailsData(null);
          setTxDetailsCopyHint(null);
        }}
      >
        {txDetailsData ? (
          <>
            <div className={styles.txDetailsSummary}>
              {txDetailsData.txid && (
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>TXID</div>
                  <div className={styles.summaryValue} title={txDetailsData.txid}>
                    {txDetailsData.txid}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              {txDetailsData.txid && (
                <button
                  type="button"
                  className={styles.modalBtn}
                  onClick={() => void copyFromModal(txDetailsData.txid!, 'TXID')}
                >
                  Copy TXID
                </button>
              )}
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={() => {
                  const text = JSON.stringify(txDetailsData, null, 2);
                  void copyFromModal(text, 'JSON');
                }}
              >
                Copy JSON
              </button>
            </div>

            {txDetailsCopyHint && <div className={styles.txDetailsToast}>{txDetailsCopyHint}</div>}

            <pre className={styles.txDetailsJson}>{JSON.stringify(txDetailsData, null, 2)}</pre>
          </>
        ) : (
          <div>No transaction data available.</div>
        )}
      </Modal>
    </div>
  );
}
