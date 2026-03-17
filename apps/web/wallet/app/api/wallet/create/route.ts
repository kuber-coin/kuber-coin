import { NextRequest, NextResponse } from 'next/server';
import {
  WalletRpcError,
  callWalletRpc,
  normalizeWalletName,
  resolveWalletPassphrase,
} from '../../_utils/rpc';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = normalizeWalletName(String(body?.name || ''));
    if (!name) {
      return NextResponse.json({ error: 'Wallet name is required' }, { status: 400 });
    }

    const passphrase = resolveWalletPassphrase(body?.passphrase);
    await callWalletRpc('unloadwallet', []).catch(() => undefined);
    const data = await callWalletRpc<{ name: string; address: string }>('createwallet', [
      name,
      passphrase,
      false,
      false,
    ]);
    await callWalletRpc('unloadwallet', []).catch(() => undefined);

    return NextResponse.json({
      name,
      address: data.address,
      mnemonic: null,
      encrypted: true,
    });
  } catch (error: any) {
    if (error instanceof WalletRpcError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error.message || 'Create wallet failed' },
      { status: 500 }
    );
  }
}
