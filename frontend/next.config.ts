import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // Barrel-file optimization: lucide-react is imported per-icon in scan flows;
  // this keeps those icons from bloating unrelated route bundles.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
