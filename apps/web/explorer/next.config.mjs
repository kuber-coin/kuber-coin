/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@kubercoin/ui"],
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
  env: {
    // Server-side API URLs (internal Docker network)
    KUBERCOIN_RPC_URL: process.env.KUBERCOIN_RPC_URL || "http://localhost:8634",
    KUBERCOIN_WS_URL: process.env.KUBERCOIN_WS_URL || "",
  },
  // Public environment variables available in browser
  publicRuntimeConfig: {
    nodeUrl: process.env.NEXT_PUBLIC_NODE_URL || "http://localhost:8634",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8634",
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || "",
    walletUrl: process.env.NEXT_PUBLIC_WALLET_URL || "http://localhost:3250",
  },
};

export default nextConfig;
