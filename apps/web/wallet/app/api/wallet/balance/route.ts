import { NextRequest, NextResponse } from 'next/server';
import { WalletRpcError, callWalletRpc, withLoadedWallet } from '../../_utils/rpc';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');
    
    if (!name) {
      return NextResponse.json({ error: 'Wallet name is required' }, { status: 400 });
    }

    const data = await withLoadedWallet(name, async () => {
      const [walletInfo, received, height] = await Promise.all([
        callWalletRpc<{ balance: number }>('getwalletinfo'),
        callWalletRpc<Array<{ address: string }>>('listreceivedbyaddress', [0]),
        callWalletRpc<number>('getblockcount'),
      ]);

      return {
        address: received[0]?.address || '',
        height,
        spendable: walletInfo.balance ?? 0,
        total: walletInfo.balance ?? 0,
        immature: 0,
      };
    });

    return NextResponse.json(data);
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to load balance' },
      { status: 500 }
    );
  }
}
