// KuberCoin Domain Configuration for Wallet Web
// Centralized configuration for public-facing production domains

export const DOMAINS = {
  main: process.env.NEXT_PUBLIC_MAIN_URL || 'https://kuber-coin.com',
  wallet: process.env.NEXT_PUBLIC_WALLET_URL || 'https://wallet.kuber-coin.com',
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer.kuber-coin.com',
  node: process.env.NEXT_PUBLIC_NODE_URL || 'https://node.kuber-coin.com',
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.kuber-coin.com',
  dapp: process.env.NEXT_PUBLIC_DAPP_URL || 'https://dapp.kuber-coin.com',
} as const;

export const API_ENDPOINTS = {
  // Wallet API (server-side)
  walletApi:
    process.env.NEXT_PUBLIC_WALLET_API_URL ||
    process.env.KUBERCOIN_WALLET_API_URL ||
    'http://localhost:8080',
  
  // WebSocket (client-side)
  ws: process.env.NEXT_PUBLIC_WS_URL || 'wss://node.kuber-coin.com/ws',
  
  // Public node API
  health: `${DOMAINS.node}/api/health`,
  broadcast: `${DOMAINS.node}/api/transactions/broadcast`,
} as const;

export const EXTERNAL_LINKS = [
  { name: 'Home', href: DOMAINS.main },
  { name: 'Explorer', href: DOMAINS.explorer },
  { name: 'Documentation', href: DOMAINS.docs },
  { name: 'dApp', href: DOMAINS.dapp },
] as const;

// Get explorer URL for a transaction
export const getExplorerTxUrl = (txid: string): string => 
  `${DOMAINS.explorer}/tx/${txid}`;

// Get explorer URL for an address  
export const getExplorerAddressUrl = (address: string): string =>
  `${DOMAINS.explorer}/address/${address}`;

// Get explorer URL for a block
export const getExplorerBlockUrl = (blockHash: string): string =>
  `${DOMAINS.explorer}/block/${blockHash}`;

export default DOMAINS;
