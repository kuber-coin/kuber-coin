import { NextResponse } from 'next/server';
import { getRpcAuthHeaders } from '../_utils/auth';

const RPC_URL = process.env.KUBERCOIN_RPC_URL || 'http://localhost:8634';
const METRICS_URL = process.env.KUBERCOIN_METRICS_URL || 'http://localhost:9091/metrics';

type CheckResult = {
  key: string;
  name: string;
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    globalThis.clearTimeout(t);
  }
}

async function checkRpc(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      RPC_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getRpcAuthHeaders(),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblockcount', params: [] }),
      },
      2000
    );

    const ms = Date.now() - started;
    if (!res.ok) return { key: 'rpc', name: 'RPC', ok: false, status: res.status, ms, error: `HTTP ${res.status}` };

    const data: unknown = await res.json().catch(() => null);
    if (!isRecord(data)) return { key: 'rpc', name: 'RPC', ok: false, ms, error: 'RPC error' };
    const error = data.error;
    if (error != null) {
      const message = isRecord(error) && typeof error.message === 'string' ? error.message : 'RPC error';
      return { key: 'rpc', name: 'RPC', ok: false, ms, error: message };
    }

    return { key: 'rpc', name: 'RPC', ok: true, status: res.status, ms };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unreachable';
    return { key: 'rpc', name: 'RPC', ok: false, ms: Date.now() - started, error: msg };
  }
}

async function checkMetrics(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(METRICS_URL, { method: 'GET' }, 2000);
    const ms = Date.now() - started;
    if (!res.ok) return { key: 'metrics', name: 'Metrics', ok: false, status: res.status, ms, error: `HTTP ${res.status}` };
    return { key: 'metrics', name: 'Metrics', ok: true, status: res.status, ms };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unreachable';
    return { key: 'metrics', name: 'Metrics', ok: false, ms: Date.now() - started, error: msg };
  }
}

async function checkOne(key: string, name: string, url: string): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { method: 'GET' }, 2000);
    const ms = Date.now() - started;
    if (!res.ok) return { key, name, ok: false, status: res.status, ms, error: `HTTP ${res.status}` };
    return { key, name, ok: true, status: res.status, ms };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unreachable';
    return { key, name, ok: false, ms: Date.now() - started, error: msg };
  }
}

async function firstOk(key: string, name: string, urls: string[]): Promise<CheckResult> {
  for (const u of urls) {
    const r = await checkOne(key, name, u);
    if (r.ok) return r;
  }
  return { key, name, ok: false, error: 'unreachable' };
}

export async function GET() {
  const [rpc, metrics, grafana, prom] = await Promise.all([
    checkRpc(),
    checkMetrics(),
    firstOk('grafana', 'Grafana', ['http://grafana:3000/api/health', 'http://localhost:3000/api/health']),
    firstOk('prom', 'Prometheus', ['http://prometheus:9090/-/healthy', 'http://localhost:9092/-/healthy']),
  ]);

  const checks = [rpc, metrics, grafana, prom];
  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ ok, ts: Date.now(), checks });
}
