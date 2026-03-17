// KuberCoin Domain Configuration for Explorer Web
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
  // RPC API (server-side)
  rpc: process.env.KUBERCOIN_RPC_URL || 'http://localhost:8332',
  
  // WebSocket
  ws: process.env.KUBERCOIN_WS_URL || process.env.NEXT_PUBLIC_WS_URL || '',
  
  // Public node API
  node: DOMAINS.node,
  health: `${DOMAINS.node}/api/health`,
  blocks: `${DOMAINS.node}/api/blocks`,
  transactions: `${DOMAINS.node}/api/transactions`,
  mempool: `${DOMAINS.node}/api/mempool`,
  address: (addr: string) => `${DOMAINS.node}/api/address/${addr}`,
} as const;

export const EXTERNAL_LINKS = [
  { name: 'Home', href: DOMAINS.main },
  { name: 'Wallet', href: DOMAINS.wallet },
  { name: 'Documentation', href: DOMAINS.docs },
  { name: 'dApp', href: DOMAINS.dapp },
] as const;

// Internal explorer routes
export const EXPLORER_ROUTES = {
  home: '/',
  blocks: '/blocks',
  block: (hash: string) => `/block/${hash}`,
  tx: (txid: string) => `/tx/${txid}`,
  address: (addr: string) => `/address/${addr}`,
  statistics: '/statistics',
  charts: '/charts',
  faucet: '/faucet',
} as const;

export default DOMAINS;
