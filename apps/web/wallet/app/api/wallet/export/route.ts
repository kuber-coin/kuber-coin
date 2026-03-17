import { NextRequest, NextResponse } from 'next/server';
import { WalletRpcError, callWalletRpc, normalizeWalletName, withLoadedWallet } from '../../_utils/rpc';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'Wallet name is required' }, { status: 400 });
  }

  try {
    const wallet = await withLoadedWallet(
      name,
      async () => {
        const [walletInfo, addresses, descriptors] = await Promise.all([
          callWalletRpc<any>('getwalletinfo'),
          callWalletRpc<Array<{ address: string; label?: string }>>('listreceivedbyaddress', [0]),
          callWalletRpc<{ descriptors?: Array<{ desc: string }> }>('listdescriptors').catch(() => ({ descriptors: [] })),
        ]);

        const privateKeys: string[] = [];
        if (!walletInfo.watch_only) {
          for (const entry of addresses) {
            try {
              const key = await callWalletRpc<string>('dumpprivkey', [entry.address]);
              privateKeys.push(key);
            } catch {
              // Skip keys that cannot be dumped.
            }
          }
        }

        return {
          version: walletInfo.walletversion ?? 1,
          label: walletInfo.walletname ?? normalizeWalletName(name),
          network: 'mainnet',
          private_keys: privateKeys,
          addresses: addresses.map((entry) => entry.address),
          address_labels: Object.fromEntries(
            addresses
              .filter((entry) => entry.label)
              .map((entry) => [entry.address, entry.label]),
          ),
          birthday_height: 0,
          watch_only: Boolean(walletInfo.watch_only),
          mnemonic: null,
          xpub: null,
          descriptors: (descriptors.descriptors || []).map((entry) => entry.desc),
        };
      },
      { unlock: true },
    );

    const filename = normalizeWalletName(name);
    return new NextResponse(JSON.stringify(wallet, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error.message || 'Export failed' },
      { status: 500 },
    );
  }
}
