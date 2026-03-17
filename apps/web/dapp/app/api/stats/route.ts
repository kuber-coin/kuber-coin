import { NextResponse } from 'next/server';

const NODE_URL = process.env.KUBERCOIN_RPC_URL || 'http://localhost:8080';

async function fetchWithTimeout(url: string, init: RequestInit, ms = 4000) {
  const ctrl = new AbortController();
  const t = globalThis.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    globalThis.clearTimeout(t);
  }
}

export async function GET() {
  try {
    const [infoRes, peersRes] = await Promise.all([
      fetchWithTimeout(`${NODE_URL}/api/info`, {}, 4000),
      fetchWithTimeout(`${NODE_URL}/api/peers`, {}, 4000),
    ]);

    const info = infoRes.ok ? (await infoRes.json().catch(() => null)) : null;
    const peers = peersRes.ok ? (await peersRes.json().catch(() => null)) : null;

    return NextResponse.json({
      online: info !== null,
      blockHeight: typeof info?.height === 'number' ? info.height + 1 : null,
      mempoolSize: typeof info?.mempool_size === 'number' ? info.mempool_size : null,
      peerCount: typeof peers?.total === 'number' ? peers.total : null,
      network: typeof info?.network === 'string' ? info.network : null,
      version: typeof info?.version === 'string' ? info.version : null,
    });
  } catch {
    return NextResponse.json({ online: false, blockHeight: null, mempoolSize: null, peerCount: null, network: null, version: null });
  }
}
