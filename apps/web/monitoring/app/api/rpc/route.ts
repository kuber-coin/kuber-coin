import { NextResponse } from 'next/server';
import { getRpcAuthHeaders } from '../_utils/auth';

const RPC_URL = process.env.KUBERCOIN_RPC_URL ?? 'http://localhost:8332';
const RPC_USER = process.env.KUBERCOIN_RPC_USER;
const RPC_PASS = process.env.KUBERCOIN_RPC_PASS;

async function rpcCall(method: string, params: unknown[] = []) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getRpcAuthHeaders(),
  };

  if (RPC_USER && RPC_PASS) {
    const token = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC HTTP ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message ?? 'RPC error');
  }
  return json.result;
}

export async function GET() {
  try {
    const [height, bestHash, peers, mempool] = await Promise.all([
      rpcCall('getblockcount'),
      rpcCall('getbestblockhash'),
      rpcCall('getpeerinfo'),
      rpcCall('getmempoolinfo'),
    ]);

    const bestHashString = typeof bestHash === 'string' ? bestHash : '';

    return NextResponse.json({
      ok: true,
      height: typeof height === 'number' ? height : Number(height ?? 0),
      bestHash: bestHashString,
      peerCount: Array.isArray(peers) ? peers.length : 0,
      mempoolSize: typeof mempool === 'object' && mempool && 'size' in (mempool as any)
        ? Number((mempool as any).size)
        : 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, height: 0, bestHash: '', peerCount: 0, mempoolSize: 0, error: msg });
  }
}
