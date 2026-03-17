/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@kubercoin/ui'],
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = nextConfig;
