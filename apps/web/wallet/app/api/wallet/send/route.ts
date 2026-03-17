import { NextRequest, NextResponse } from 'next/server';
import { WalletRpcError, callWalletRpc, withLoadedWallet } from '../../_utils/rpc';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const from = String(body?.from || '');
    const to = String(body?.to || '');
    const amount = Number(body?.amount);

    if (!from || !to || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'from, to, and amount are required' }, { status: 400 });
    }

    const result = await withLoadedWallet(
      from,
      async () => callWalletRpc<{ txid: string } | string>('sendtoaddress', [to, Math.trunc(amount)]),
      { unlock: true },
    );

    // The node may return either a plain txid string or an object { txid: string }.
    const txid =
      typeof result === 'object' && result !== null
        ? (result as { txid: string }).txid
        : (result as string);

    return NextResponse.json({ ok: true, txid });
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error.message || 'Send transaction failed' },
      { status: 500 }
    );
  }
}
