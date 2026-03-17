'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import styles from './ExplorerClient.module.css';
import AppHeader from './AppHeader';
import StatusBanner from './StatusBanner';
import Modal from './Modal';
import { StatCard } from './StatCard';
import { FeatureCard } from './FeatureCard';

interface BlockData {
  hash: string;
  height: number;
  timestamp?: number;
  transactions?: number;
}

interface MempoolInfo {
  size: number;
  bytes?: number;
}

const BLOCK_SKELETON_KEYS = ['blk-sk-1', 'blk-sk-2', 'blk-sk-3', 'blk-sk-4', 'blk-sk-5', 'blk-sk-6'];

type ExplorerWsState = {
  wsEnabled: boolean;
  wsConnected: boolean;
  wsLastMessage: string;
  wsRetryCount: number;
  wsLatencyMs: number;
};

function clipMessageTokens(prev: string, token: string, maxTokens: number): string {
  const next = prev ? `${prev} ${token}` : token;
  const parts = next.split(/\s+/).filter(Boolean);
  return parts.slice(-maxTokens).join(' ');
}

function resolveExplorerWsUrl(): string | null {
  const g = globalThis as any;

  const globalOverride = typeof g.WS_URL === 'string' ? (g.WS_URL as string) : '';
  if (globalOverride) {
    try {
      g.sessionStorage?.setItem('WS_URL', globalOverride);
    } catch {
      // ignore
    }
    return globalOverride;
  }

  try {
    const stored = g.sessionStorage?.getItem('WS_URL');
    if (typeof stored === 'string' && stored) return stored;
  } catch {
    // ignore
  }

  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (typeof envUrl === 'string' && envUrl) return envUrl;

  return null;
}

function tryCreateWebSocket(url: string): WebSocket | null {
  try {
    return new WebSocket(url);
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket | null, payload: unknown): void {
  try {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function closeWebSocket(ws: WebSocket | null): void {
  try {
    ws?.close();
  } catch {
    // ignore
  }
}

function renderMempoolContent(args: {
  mempool: MempoolInfo | null;
  loadingData: boolean;
}): ReactNode {
  const { mempool, loadingData } = args;

  if (mempool) {
    const bytes = typeof mempool.bytes === 'number' ? mempool.bytes : null;
    return (
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Transactions</div>
          <div className={styles.statValue} data-testid="mempool-count">{mempool.size.toString()}</div>
        </div>
        {bytes === null ? null : (
          <div className={styles.stat}>
            <div className={styles.statLabel}>Size</div>
            <div className={styles.statValue}>{(bytes / 1024).toFixed(1)} KB</div>
          </div>
        )}
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className={styles.skeletonStack}>
        <div className={styles.skeletonLine} style={{ width: '45%' }} />
        <div className={styles.skeletonLine} style={{ width: '35%', marginTop: '0.35rem' }} />
      </div>
    );
  }

  return <div>Loading...</div>;
}

function renderDetailsContent(args: {
  router: { push: (href: string) => void };
  copyText: (text: string, label: string) => Promise<void>;
  detailsLoading: boolean;
  detailsError: string | null;
  detailsBlockHash: string;
  detailsBlockHeight: number | null;
  detailsData: any;
  detailsText: string;
}): ReactNode {
  const {
    router,
    copyText,
    detailsLoading,
    detailsError,
    detailsBlockHash,
    detailsBlockHeight,
    detailsData,
    detailsText,
  } = args;

  if (detailsLoading) {
    return <div className={styles.modalLoading}>Loading…</div>;
  }

  if (detailsError) {
    return <div className={styles.modalError}>{detailsError}</div>;
  }

  const txCount = Array.isArray(detailsData?.tx)
    ? detailsData.tx.length
    : (detailsData?.transactions as unknown) ?? '—';

  const timeLabel =
    typeof detailsData?.time === 'number' ? new Date(detailsData.time * 1000).toLocaleTimeString() : '—';

  return (
    <>
      <div className={styles.modalSummary}>
        <div className={styles.summaryRow}>
          <div className={styles.summaryLabel}>Hash</div>
          <div className={styles.summaryValue} title={detailsBlockHash}>
            {detailsBlockHash}
          </div>
        </div>
        <div className={styles.summaryPills}>
          <span className={styles.pill}>Height: {detailsBlockHeight ?? '—'}</span>
          <span className={styles.pill}>TX: {txCount}</span>
          <span className={styles.pill}>Time: {timeLabel}</span>
        </div>
      </div>

      <div className={styles.modalActions}>
        <button
          type="button"
          className={styles.modalBtn}
          onClick={() => {
            if (detailsBlockHash) void copyText(detailsBlockHash, 'Block hash');
          }}
        >
          Copy hash
        </button>
        <button
          type="button"
          className={styles.modalBtn}
          onClick={() => {
            if (detailsText) void copyText(detailsText, 'JSON');
          }}
          disabled={!detailsText}
        >
          Copy JSON
        </button>
        <button
          type="button"
          className={styles.modalBtnPrimary}
          onClick={() => {
            if (detailsBlockHash) router.push(`/block/${detailsBlockHash}`);
          }}
          disabled={!detailsBlockHash}
        >
          Open page
        </button>
      </div>

      <pre className={styles.modalJson}>{detailsText || 'No details available.'}</pre>
    </>
  );
}

function useExplorerWebSocket(options: {
  epoch: number;
  subBlocks: boolean;
  subTransactions: boolean;
  onActivity: () => void;
}): ExplorerWsState {
  const { epoch, subBlocks, subTransactions, onActivity } = options;

  const [wsConnected, setWsConnected] = useState(false);
  const [wsLastMessage, setWsLastMessage] = useState('');
  const [wsRetryCount, setWsRetryCount] = useState(0);
  const [wsLatencyMs, setWsLatencyMs] = useState(0);
  const [wsEnabled, setWsEnabled] = useState(false);

  const lastMessageRef = useRef('');
  const retryCountRef = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPingSentAt: number | null = null;

    const clearTimers = () => {
      if (pingTimer) {
        globalThis.clearInterval(pingTimer);
        pingTimer = null;
      }
      if (reconnectTimer) {
        globalThis.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const pushLastMessageToken = (token: string) => {
      const clipped = clipMessageTokens(lastMessageRef.current, token, 6);
      lastMessageRef.current = clipped;
      setWsLastMessage(clipped);
    };

    const sendSubscriptions = () => {
      if (subBlocks) sendJson(ws, { type: 'subscribe', channel: 'blocks' });
      if (subTransactions) sendJson(ws, { type: 'subscribe', channel: 'transactions' });
    };

    const sendPing = () => {
      lastPingSentAt = Date.now();
      sendJson(ws, { type: 'ping' });
    };

    const handleOpen = () => {
      setWsConnected(true);
      pushLastMessageToken('connected');
      sendSubscriptions();
      pingTimer = globalThis.setInterval(sendPing, 2000);
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data));
        const token = msg?.type ? String(msg.type) : 'message';
        pushLastMessageToken(token);

        if (msg?.type === 'pong') {
          if (lastPingSentAt) setWsLatencyMs(Math.max(0, Date.now() - lastPingSentAt));
          return;
        }

        if (msg?.type === 'block' || msg?.type === 'transaction') {
          onActivity();
        }
      } catch {
        // ignore
      }
    };

    const handleError = () => {
      setWsConnected(false);
      pushLastMessageToken('error');
    };

    const connect = () => {
      clearTimers();

      const url = resolveExplorerWsUrl();
      if (!url) {
        setWsEnabled(false);
        setWsConnected(false);
        setWsRetryCount(0);
        setWsLatencyMs(0);
        lastMessageRef.current = 'disabled';
        setWsLastMessage('disabled');
        return;
      }

      setWsEnabled(true);

      ws = tryCreateWebSocket(url);
      if (!ws) {
        setWsConnected(false);
        retryCountRef.current += 1;
        setWsRetryCount(retryCountRef.current);
        reconnectTimer = globalThis.setTimeout(connect, 5000);
        return;
      }

      ws.onopen = handleOpen;
      ws.onmessage = handleMessage;
      ws.onerror = handleError;
      ws.onclose = () => {
        setWsConnected(false);
        pushLastMessageToken('disconnected');

        retryCountRef.current += 1;
        setWsRetryCount(retryCountRef.current);

        clearTimers();
        reconnectTimer = globalThis.setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      clearTimers();
      closeWebSocket(ws);
    };
  }, [epoch, subBlocks, subTransactions, onActivity]);

  return { wsEnabled, wsConnected, wsLastMessage, wsRetryCount, wsLatencyMs };
}

export default function ExplorerClient() {
  const router = useRouter();
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [latestBlocks, setLatestBlocks] = useState<BlockData[]>([]);
  const [mempool, setMempool] = useState<MempoolInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subsOpen, setSubsOpen] = useState(false);
  const [subBlocks, setSubBlocks] = useState(true);
  const [subTransactions, setSubTransactions] = useState(true);
  const [wsEpoch, setWsEpoch] = useState(0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState('Details');
  const [detailsText, setDetailsText] = useState<string>('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsData, setDetailsData] = useState<any>(null);
  const [detailsBlockHash, setDetailsBlockHash] = useState<string>('');
  const [detailsBlockHeight, setDetailsBlockHeight] = useState<number | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      globalThis.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = globalThis.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1600);
  }, []);

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast(`Copy failed`);
    }
  }, [showToast]);

  const rpcCall = useCallback(async (method: string, params: any[] = []) => {
    try {
      const res = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      
      if (res.ok === false) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      if (data.error != null) {
        throw new Error(data.error.message || 'RPC error');
      }
      
      return data.result;
    } catch (err: any) {
      throw new Error(err.message || 'Network error');
    }
  }, []);

  const openBlockDetails = useCallback(async (block: BlockData) => {
    if (!block.hash) return;
    setDetailsTitle(`Block #${block.height}`);
    setDetailsText('');
    setDetailsError(null);
    setDetailsData(null);
    setDetailsBlockHash(block.hash);
    setDetailsBlockHeight(block.height);
    setDetailsLoading(true);
    setDetailsOpen(true);
    try {
      const result = await rpcCall('getblock', [block.hash]);
      setDetailsData(result);
      setDetailsText(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setDetailsError(err?.message || 'Failed to load block details');
      setDetailsText('');
    } finally {
      setDetailsLoading(false);
    }
  }, [rpcCall]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const height = await rpcCall('getblockcount');
      setBlockHeight(height);

      const mempoolInfo = await rpcCall('getmempoolinfo');
      setMempool(mempoolInfo);

      // Load latest blocks
      const blocks: BlockData[] = [];
      for (let i = 0; i < 10 && height - i >= 0; i++) {
        try {
          const blockHash = await rpcCall('getblockhash', [height - i]);
          const block = await rpcCall('getblock', [blockHash]);
          blocks.push({
            hash: block.hash || block.blockhash || '',
            height: height - i,
            timestamp: block.time || block.timestamp,
            transactions: block.tx?.length || block.transactions?.length || 0,
          });
        } catch {
          // Skip blocks that fail
        }
      }
      setLatestBlocks(blocks);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingData(false);
    }
  }, [rpcCall]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [loadData]);

  const { wsEnabled, wsConnected, wsLastMessage, wsRetryCount, wsLatencyMs } = useExplorerWebSocket({
    epoch: wsEpoch,
    subBlocks,
    subTransactions,
    onActivity: () => {
      void loadData();
    },
  });

  const handleSearch = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setLoading(true);
    setSearchResult(null);
    setError(null);

    void (async () => {
      try {
        // Try as block height
        if (/^\d+$/.test(query)) {
          const blockHash = await rpcCall('getblockhash', [Number.parseInt(query, 10)]);
          const result = await rpcCall('getblock', [blockHash]);
          const hash = result?.hash || result?.blockhash;
          if (hash) router.push(`/block/${hash}`);
          return;
        }

        // Try as block hash or tx id
        if (/^[0-9a-f]{64}$/i.test(query)) {
          try {
            const result = await rpcCall('getblock', [query]);
            setSearchResult({ type: 'block', data: result });

            const hash = result?.hash || result?.blockhash || query;
            router.push(`/block/${hash}`);
            return;
          } catch {
            const result = await rpcCall('gettransaction', [query]);
            setSearchResult({ type: 'transaction', data: result });
            return;
          }
        }

        setError('Invalid search query. Enter a block height, block hash, or transaction ID.');
      } catch (err: any) {
        setError(err?.message || 'Not found');
      } finally {
        setLoading(false);
      }
    })();
  };

  const mempoolContent = renderMempoolContent({ mempool, loadingData });
  const detailsContent = renderDetailsContent({
    router,
    copyText,
    detailsLoading,
    detailsError,
    detailsBlockHash,
    detailsBlockHeight,
    detailsData,
    detailsText,
  });
  const totalBlocksDisplay = blockHeight === null ? '0' : (blockHeight + 1).toLocaleString();

  return (
    <div className={styles.container}>
      <AppHeader
        title="🟢 Kuber Explorer"
        active="Explorer"
        center={
          <div className={styles.headerSearch}>
            <form onSubmit={handleSearch} className={styles.headerSearchForm}>
              <input
                type="search"
                placeholder="Search blocks / txs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.headerSearchInput}
                data-testid="search-input"
                aria-label="Search by block height, block hash, or transaction id"
              />
              <button
                type="submit"
                disabled={loading}
                className={styles.headerSearchBtn}
                data-testid="search-button"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>

              <button
                type="button"
                className={styles.headerSearchBtnSecondary}
                data-testid="subscription-settings"
                onClick={() => setSubsOpen((v) => !v)}
              >
                Subscriptions
              </button>
            </form>
          </div>
        }
        right={
          <div className={styles.status}>
            <span>
              Height:{' '}
              <span data-testid="blockchain-height">
                {blockHeight === null ? '0' : blockHeight.toString()}
              </span>
            </span>

            <span
              data-testid="ws-status"
              className={wsConnected ? 'connected' : 'disconnected'}
              style={{ fontWeight: 600 }}
            >
              {wsEnabled ? (wsConnected ? 'Connected' : 'Disconnected') : 'Polling'}
            </span>

            <span data-testid="ws-retry-count">{wsRetryCount}</span>
            <span data-testid="ws-latency">{wsLatencyMs}ms</span>
          </div>
        }
      />

      <StatusBanner />

      {toast && (
        <output className={styles.toast} aria-live="polite">
          {toast}
        </output>
      )}

      <main className={styles.main}>
        {subsOpen && (
          <section className={styles.subsPanel} aria-label="Subscription settings">
            <div className={styles.subsRow}>
              <label className={styles.subsLabel}>
                <input
                  type="checkbox"
                  data-testid="subscribe-blocks"
                  checked={subBlocks}
                  onChange={(e) => setSubBlocks(e.target.checked)}
                />
                <span>Blocks</span>
              </label>
              <label className={styles.subsLabel}>
                <input
                  type="checkbox"
                  data-testid="subscribe-transactions"
                  checked={subTransactions}
                  onChange={(e) => setSubTransactions(e.target.checked)}
                />
                <span>Transactions</span>
              </label>
              <button
                type="button"
                data-testid="apply-subscriptions"
                className={styles.subsApplyBtn}
                onClick={() => {
                  setWsEpoch((n) => n + 1);
                  setSubsOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          </section>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {searchResult && (
          <section className={styles.result}>
            <h2>{searchResult.type === 'block' ? 'Block' : 'Transaction'}</h2>
            <pre className={styles.json}>{JSON.stringify(searchResult.data, null, 2)}</pre>
          </section>
        )}

        {/* Market Statistics */}
        <section className={styles.statsSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.titleIcon}>📊</span>{' '}
            Network Statistics
          </h2>
          <div className={styles.statsGrid}>
            <StatCard
              icon="📦"
              label="Block Height"
              value={blockHeight === null ? '0' : blockHeight.toLocaleString()}
              variant="blue"
            />
            <StatCard
              icon="🔄"
              label="Mempool Size"
              value={mempool?.size?.toLocaleString() || '0'}
              trend={mempool && mempool.size > 0 ? `${mempool.size} pending` : ''}
              variant="gold"
            />
            <StatCard
              icon="⛓️"
              label="Total Blocks"
              value={totalBlocksDisplay}
              variant="green"
            />
            <StatCard
              icon="⚡"
              label="WS Latency"
              value={wsEnabled ? `${wsLatencyMs}ms` : 'polling'}
              trend={wsEnabled ? (wsConnected ? '🟢 Connected' : '🔴 Disconnected') : '🟡 Polling'}
              variant="purple"
            />
          </div>
        </section>

        <div style={{ marginBottom: '0.75rem' }}>
          Last WS message: <span data-testid="ws-last-message">{wsEnabled ? wsLastMessage : 'disabled'}</span>
        </div>

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>Latest Blocks</h2>
            <div className={styles.list} data-testid="blocks-list">
              {loadingData && latestBlocks.length === 0 ? (
                <>
                  {BLOCK_SKELETON_KEYS.map((key) => (
                    <div key={key} className={`${styles.listItem} ${styles.skeletonItem}`}>
                      <div className={`${styles.blockHeight} ${styles.skeletonBox}`} style={{ width: '4rem' }} />
                      <div className={styles.blockInfo}>
                        <div className={styles.skeletonLine} style={{ width: '80%' }} />
                        <div className={styles.skeletonLine} style={{ width: '55%', marginTop: '0.35rem' }} />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                latestBlocks.map((block) => (
                <div key={block.height} className={`${styles.listItem} block-item`}>
                  <div className={`${styles.blockHeight} block-height`}>#{block.height}</div>
                  <div className={styles.blockInfo}>
                    <div className={styles.hashRow}>
                      <button
                        type="button"
                        className={`${styles.hash} block-hash`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        title={block.hash}
                        onClick={() => {
                          if (block.hash) router.push(`/block/${block.hash}`);
                        }}
                      >
                        {block.hash}
                      </button>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label="Copy block hash"
                        onClick={() => {
                          if (block.hash) void copyText(block.hash, 'Block hash');
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        aria-label="Open block details"
                        onClick={() => {
                          void openBlockDetails(block);
                        }}
                      >
                        Details
                      </button>
                    </div>
                    <div className={styles.meta}>
                      {block.transactions ?? 0} tx{(block.transactions ?? 0) === 1 ? '' : 's'}
                      {block.timestamp && (
                        <> · {new Date(block.timestamp * 1000).toLocaleTimeString()}</>
                      )}
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2>Mempool</h2>
            <div data-testid="mempool-section">
            {mempoolContent}
            </div>
          </section>
        </div>

        {/* Features Section */}
        <section className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.titleIcon}>✨</span>{' '}
            Why Choose Kuber Explorer
          </h2>
          <div className={styles.featuresGrid}>
            <FeatureCard
              icon="🔒"
              title="Bank-Grade Security"
              description="Military-grade blockchain encryption protect your transactions around the clock"
              variant="blue"
            />
            <FeatureCard
              icon="⚡"
              title="Lightning Fast"
              description="Process thousands of transactions per second with minimal fees paid by you"
              variant="gold"
            />
            <FeatureCard
              icon="🌐"
              title="Community Driven"
              description="Join thousands of traders shaping the future of decentralized finance together"
              variant="purple"
            />
          </div>
        </section>
      </main>

      <Modal
        title={detailsTitle}
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsLoading(false);
          setDetailsError(null);
          setDetailsData(null);
          setDetailsText('');
          setDetailsBlockHash('');
          setDetailsBlockHeight(null);
        }}
      >
        {detailsContent}
      </Modal>

      <footer className={styles.footer}>
        <a href="http://localhost:3250" target="_blank" rel="noopener">Wallet</a>
        {' · '}
        <a href="http://localhost:3300" target="_blank" rel="noopener">Operations</a>
        {' · '}
        <a href="http://localhost:3000" target="_blank" rel="noopener">Grafana</a>
        {' · '}
        <a href="http://localhost:9092" target="_blank" rel="noopener">Prometheus</a>
      </footer>
    </div>
  );
}
