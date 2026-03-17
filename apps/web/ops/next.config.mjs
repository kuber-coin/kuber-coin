/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@kubercoin/ui"],
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
