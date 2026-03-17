export function getRpcAuthHeaders(): Record<string, string> {
  const key = process.env.KUBERCOIN_API_KEY || process.env.KUBERCOIN_RPC_API_KEY || '';

  if (!key) {
    return {};
  }

  const value = /^(Bearer|ApiKey)\s/i.test(key) ? key : `Bearer ${key}`;
  return { Authorization: value };
}
