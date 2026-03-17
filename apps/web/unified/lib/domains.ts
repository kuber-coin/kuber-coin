// KuberCoin Domain Configuration
// Centralized configuration for public-facing production domains

export const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'https://kuber-coin.com',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'https://wallet.kuber-coin.com',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer.kuber-coin.com',
  node: process.env.NEXT_PUBLIC_NODE_URL || 'https://node.kuber-coin.com',
  rpc: process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.kuber-coin.com',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.kuber-coin.com',
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || 'https://dapp.kuber-coin.com',
} as const;

export const API_ENDPOINTS = {
  // REST API
  health: `${DOMAINS.node}/api/health`,
  blocks: `${DOMAINS.node}/api/blocks`,
  transactions: `${DOMAINS.node}/api/transactions`,
  address: (addr: string) => `${DOMAINS.node}/api/address/${addr}`,
  utxos: (addr: string) => `${DOMAINS.node}/api/address/${addr}/utxos`,
  mempool: `${DOMAINS.node}/api/mempool`,
  
  // WebSocket
  ws: process.env.NEXT_PUBLIC_WS_URL || 'wss://node.kuber-coin.com/ws',
  
  // RPC (requires authentication)
  rpc: DOMAINS.rpc,
} as const;

export const NAV_LINKS = {
  internal: [
    { name: 'Dashboard', href: '/' },
    { name: 'Wallet', href: '/wallet' },
    { name: 'Explorer', href: '/explorer' },
    { name: 'Transactions', href: '/transactions' },
    { name: 'Network', href: '/network' },
  ],
  external: [
    { name: 'Wallet App', href: DOMAINS.wallet, external: true },
    { name: 'Explorer', href: DOMAINS.explorer, external: true },
    { name: 'Documentation', href: DOMAINS.docs, external: true },
    { name: 'dApp', href: DOMAINS.dapp, external: true },
  ],
} as const;

// Development overrides
export const isDevelopment = process.env.NODE_ENV === 'development';

export const getApiUrl = (endpoint: string): string => {
  if (isDevelopment) {
    // Use local endpoints in development
    return endpoint.replace('https://node.kuber-coin.com', 'http://localhost:8081')
         .replace('wss://node.kuber-coin.com', 'ws://localhost:9090');
  }
  return endpoint;
};

export default DOMAINS;
