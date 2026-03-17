import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@kubercoin/ui'],
  experimental: {
    // Auto tree-shake named recharts imports — cuts recharts payload by 40–60%
    optimizePackageImports: ['recharts'],
  },
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
