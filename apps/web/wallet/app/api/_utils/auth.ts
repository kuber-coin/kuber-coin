export function getWalletAuthHeaders(): Record<string, string> {
  const key =
    process.env.KUBERCOIN_WALLET_API_KEY ||
    process.env.NEXT_PUBLIC_WALLET_API_KEY ||
    process.env.NEXT_PUBLIC_API_KEY ||
    '';

  if (!key) {
    return {};
  }

  const value = /^(Bearer|ApiKey)\s/i.test(key) ? key : `Bearer ${key}`;
  return { Authorization: value };
}
