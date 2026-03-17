import { NextResponse } from 'next/server';
import { WalletRpcError, callWalletRpc } from '../_utils/rpc';

export async function GET() {
  try {
    const wallets = await callWalletRpc<string[]>('listwallets');
    // The node appends .dat when listing, so a wallet stored as foo.dat is
    // listed as foo.dat.dat. Normalise by stripping the redundant suffix.
    const normalized = wallets.map((w) =>
      w.endsWith('.dat.dat') ? w.slice(0, -4) : w,
    );
    return NextResponse.json({ wallets: normalized });
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to load wallets' },
      { status: 500 }
    );
  }
}
