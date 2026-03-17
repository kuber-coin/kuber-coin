'use client';

import React, { useEffect, useState } from 'react';

type BlockDetailClientProps = Readonly<{ hash: string }>;

type BlockResponse = {
  bits?: string;
  hash?: string;
  height?: number;
  merkleroot?: string;
  nTx?: number;
  nonce?: number;
  previousblockhash?: string;
  time?: number;
  tx?: string[];
};

const shellStyle: React.CSSProperties = {
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '2rem 1rem 3rem',
};

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d7e3f4',
  borderRadius: '20px',
  boxShadow: '0 18px 40px rgba(14, 42, 71, 0.08)',
  padding: '1.25rem',
};

const metaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.75rem',
  marginTop: '1rem',
};

const metaCardStyle: React.CSSProperties = {
  background: '#f6f9fc',
  border: '1px solid #e3ebf5',
  borderRadius: '14px',
  padding: '0.9rem 1rem',
};

const metaLabelStyle: React.CSSProperties = {
  color: '#5f748c',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const metaValueStyle: React.CSSProperties = {
  color: '#10253d',
  fontSize: '1.05rem',
  fontWeight: 700,
  marginTop: '0.4rem',
  wordBreak: 'break-word',
};

const monoStyle: React.CSSProperties = {
  fontFamily: 'Consolas, Monaco, monospace',
  wordBreak: 'break-all',
};

export default function BlockDetailClient({ hash }: BlockDetailClientProps) {
  const [block, setBlock] = useState<BlockResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblock', params: [hash] }),
        });

        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error?.message || `HTTP ${res.status}`);
        }
        if (data?.error) {
          throw new Error(data.error.message || 'RPC error');
        }

        if (!cancelled) {
          setBlock(data.result);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load block';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const txList = Array.isArray(block?.tx) ? block.tx : [];
  const timestamp = typeof block?.time === 'number' ? new Date(block.time * 1000).toLocaleString() : 'Unknown';

  return (
    <div className="block-detail" style={shellStyle}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ color: '#0d6b58', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.8rem' }}>
          Explorer
        </div>
        <h2 style={{ margin: '0.35rem 0 0.75rem', fontSize: '2rem', color: '#10253d' }}>Block Detail</h2>
        <div style={{ ...monoStyle, color: '#47627d', fontSize: '0.95rem' }}>{hash}</div>
      </div>

      {loading && <div style={panelStyle}>Loading block details...</div>}
      {error && <div style={{ ...panelStyle, color: '#b42318' }}>{error}</div>}
      {block != null && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section style={panelStyle}>
            <div style={metaGridStyle}>
              <div style={metaCardStyle}>
                <div style={metaLabelStyle}>Height</div>
                <div style={metaValueStyle}>{block.height ?? 'Unknown'}</div>
              </div>
              <div style={metaCardStyle}>
                <div style={metaLabelStyle}>Transactions</div>
                <div style={metaValueStyle}>{block.nTx ?? txList.length}</div>
              </div>
              <div style={metaCardStyle}>
                <div style={metaLabelStyle}>Timestamp</div>
                <div style={metaValueStyle}>{timestamp}</div>
              </div>
              <div style={metaCardStyle}>
                <div style={metaLabelStyle}>Nonce</div>
                <div style={metaValueStyle}>{block.nonce ?? 'Unknown'}</div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.85rem' }}>
              <div>
                <div style={metaLabelStyle}>Merkle Root</div>
                <div style={{ ...metaValueStyle, ...monoStyle, fontSize: '0.92rem' }}>{block.merkleroot ?? 'Unknown'}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>Previous Block</div>
                <div style={{ ...metaValueStyle, ...monoStyle, fontSize: '0.92rem' }}>{block.previousblockhash ?? 'Genesis'}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>Bits</div>
                <div style={{ ...metaValueStyle, ...monoStyle, fontSize: '0.92rem' }}>{block.bits ?? 'Unknown'}</div>
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <h3 style={{ margin: '0 0 0.85rem', color: '#10253d' }}>Transactions</h3>
            {txList.length === 0 ? (
              <div style={{ color: '#5f748c' }}>No transactions recorded in this block.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {txList.map((txid, index) => (
                  <div key={txid} style={{ ...metaCardStyle, padding: '0.8rem 0.9rem' }}>
                    <div style={metaLabelStyle}>Transaction {index + 1}</div>
                    <div style={{ ...metaValueStyle, ...monoStyle, fontSize: '0.9rem' }}>{txid}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <h3 style={{ margin: '0 0 0.85rem', color: '#10253d' }}>Raw JSON</h3>
            <pre style={{ ...monoStyle, whiteSpace: 'pre-wrap', margin: 0, color: '#14314d' }}>{JSON.stringify(block, null, 2)}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
