import { NextRequest, NextResponse } from 'next/server';
import { WalletRpcError, callWalletRpc, withLoadedWallet } from '../../_utils/rpc';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'Wallet name is required' }, { status: 400 });
  }

  try {
    const data = await withLoadedWallet(name, async () => {
      const addresses = await callWalletRpc<Array<{ address: string }>>('listreceivedbyaddress', [0]);
      const seen = new Set<string>();
      const transactions: Array<Record<string, unknown>> = [];

      for (const entry of addresses) {
        const txs = await callWalletRpc<Array<Record<string, unknown>>>('listtransactions', [
          entry.address,
          100,
          0,
          true,
        ]);
        for (const tx of txs) {
          const txid = typeof tx.txid === 'string' ? tx.txid : '';
          if (!txid || seen.has(txid)) {
            continue;
          }
          seen.add(txid);
          transactions.push(tx);
        }
      }

      return { transactions };
    });

    return NextResponse.json(data);
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to load history' },
      { status: 500 }
    );
  }
}
