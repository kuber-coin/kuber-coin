'use client';

import { useEffect, useState } from 'react';
import styles from './StatusBanner.module.css';

type CheckResult = {
  key: string;
  name: string;
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
};

type StatusResponse = {
  ok: boolean;
  ts: number;
  checks: CheckResult[];
};

export default function StatusBanner() {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const json = (await res.json()) as StatusResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({ ok: false, ts: Date.now(), checks: [{ key: 'status', name: 'Status', ok: false, error: 'unavailable' }] });
        }
      }
    };

    void run();
    const t = globalThis.setInterval(run, 10000);
    return () => {
      cancelled = true;
      globalThis.clearInterval(t);
    };
  }, []);

  if (!data) {
    return (
      <div className={styles.banner}>
        <div className={styles.pillMuted}>Checking services…</div>
      </div>
    );
  }

  return (
    <div className={styles.banner}>
      {data.checks.map((c) => (
        <div
          key={c.key}
          className={c.ok ? styles.pillOk : styles.pillBad}
          title={c.ok ? `${c.name} OK` : `${c.name} ${c.error ?? 'down'}`}
        >
          {c.name}
          {typeof c.ms === 'number' ? ` · ${Math.round(c.ms)}ms` : ''}
        </div>
      ))}
    </div>
  );
}
