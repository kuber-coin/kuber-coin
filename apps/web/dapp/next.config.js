/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@kubercoin/ui'],
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = nextConfig;
