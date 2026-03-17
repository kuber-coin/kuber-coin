import { getWalletAuthHeaders } from './auth';

const NODE_RPC_URL = process.env.KUBERCOIN_WALLET_API_URL || 'http://localhost:8634';
const SHARED_WALLET_PASSPHRASE =
  process.env.KUBERCOIN_WALLET_SHARED_PASSPHRASE ||
  process.env.KUBERCOIN_WALLET_DEFAULT_PASSPHRASE ||
  '';

type JsonRpcEnvelope<T> = {
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
};

export class WalletRpcError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status = 502, code?: number) {
    super(message);
    this.name = 'WalletRpcError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeWalletName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.toLowerCase().endsWith('.dat') || trimmed.toLowerCase().endsWith('.json')) {
    return trimmed;
  }
  return `${trimmed}.dat`;
}

export function resolveWalletPassphrase(passphrase?: string | null) {
  const candidate = passphrase?.trim() || SHARED_WALLET_PASSPHRASE.trim();
  if (!candidate) {
    throw new WalletRpcError(
      'wallet passphrase is required; set KUBERCOIN_WALLET_SHARED_PASSPHRASE or provide passphrase',
      400,
    );
  }
  return candidate;
}

export async function callWalletRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(NODE_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getWalletAuthHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
    cache: 'no-store',
  });

  const text = await response.text();
  let payload: JsonRpcEnvelope<T> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new WalletRpcError(text || `HTTP ${response.status}`, response.status || 502);
  }

  if (!response.ok) {
    throw new WalletRpcError(
      payload.error?.message || `HTTP ${response.status}`,
      response.status,
      payload.error?.code,
    );
  }

  if (payload.error) {
    const code = payload.error.code;
    const status = code === -1 || code === -4 || code === -6 || code === -13 || code === -14 || code === -15
      ? 400
      : 502;
    throw new WalletRpcError(payload.error.message || 'RPC request failed', status, code);
  }

  return payload.result as T;
}

export async function withLoadedWallet<T>(
  walletName: string,
  handler: () => Promise<T>,
  options?: { passphrase?: string | null; unlock?: boolean },
): Promise<T> {
  const normalizedName = normalizeWalletName(walletName);
  if (!normalizedName) {
    throw new WalletRpcError('wallet name is required', 400);
  }

  const passphrase = resolveWalletPassphrase(options?.passphrase);

  await callWalletRpc('unloadwallet', []).catch(() => undefined);
  await callWalletRpc('loadwallet', [normalizedName, passphrase]);

  try {
    if (options?.unlock) {
      await callWalletRpc('walletpassphrase', [passphrase, 30]);
    }
    return await handler();
  } finally {
    if (options?.unlock) {
      await callWalletRpc('walletlock', []).catch(() => undefined);
    }
    await callWalletRpc('unloadwallet', []).catch(() => undefined);
  }
}