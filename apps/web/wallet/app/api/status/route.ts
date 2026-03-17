import { NextResponse } from 'next/server';
import { getWalletAuthHeaders } from '../_utils/auth';

const WALLET_API_URL = process.env.KUBERCOIN_WALLET_API_URL || 'http://localhost:8634';

type CheckResult = {
  key: string;
  name: string;
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

async function checkOne(key: string, name: string, url: string): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      url,
      { method: 'GET', headers: getWalletAuthHeaders() },
      2000
    );
    const ms = Date.now() - started;
    if (!res.ok) return { key, name, ok: false, status: res.status, ms, error: `HTTP ${res.status}` };
    return { key, name, ok: true, status: res.status, ms };
  } catch (e: any) {
    return { key, name, ok: false, ms: Date.now() - started, error: e?.message || 'unreachable' };
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
  const [node, grafana, prom] = await Promise.all([
    checkOne('node', 'Node API', `${WALLET_API_URL}/api/health`),
    firstOk('grafana', 'Grafana', ['http://grafana:3000/api/health', 'http://localhost:3000/api/health']),
    firstOk('prom', 'Prometheus', ['http://prometheus:9090/-/healthy', 'http://localhost:9092/-/healthy']),
  ]);

  const checks = [node, grafana, prom];
  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ ok, ts: Date.now(), checks });
}
