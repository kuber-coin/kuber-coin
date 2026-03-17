/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@kubercoin/ui'],
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
  env: {
    // Server-side API URLs (internal Docker network)
    KUBERCOIN_API_URL: process.env.KUBERCOIN_WALLET_API_URL || process.env.KUBERCOIN_API_URL || 'http://localhost:8081',
    KUBERCOIN_RPC_URL: process.env.KUBERCOIN_RPC_URL || 'http://localhost:8634',
    KUBERCOIN_WS_URL: process.env.KUBERCOIN_WS_URL || 'ws://localhost:9090/ws',
    FAUCET_URL: process.env.FAUCET_URL || 'http://localhost:3001',
  },
  // Public environment variables available in browser
  publicRuntimeConfig: {
    nodeUrl: process.env.NEXT_PUBLIC_NODE_URL || 'http://localhost:8081',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8634',
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:9090/ws',
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || 'http://localhost:3200',
    walletUrl: process.env.NEXT_PUBLIC_WALLET_URL || 'http://localhost:3250',
    docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || '/docs',
  },
}

module.exports = nextConfig
