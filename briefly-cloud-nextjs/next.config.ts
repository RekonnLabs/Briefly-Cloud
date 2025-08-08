import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', 'xlsx'],
  webpack: (config) => {
    // Handle node modules that need to be externalized
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    })
    return config
  },
  // Image optimization configuration
  images: {
    domains: ['lh3.googleusercontent.com'], // For Google profile images
  },
};

export default nextConfig;
