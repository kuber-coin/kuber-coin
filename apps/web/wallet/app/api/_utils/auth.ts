export function getWalletAuthHeaders(): Record<string, string> {
  // Only read server-side env vars. Never use NEXT_PUBLIC_* here — those are
  // embedded into the browser bundle and would expose the node auth key.
  const key = process.env.KUBERCOIN_WALLET_API_KEY || '';

  if (!key) {
    return {};
  }

  const value = /^(Bearer|ApiKey)\s/i.test(key) ? key : `Bearer ${key}`;
  return { Authorization: value };
}
