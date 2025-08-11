import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Path-based deployment support for rekonnlabs.com/briefly/app
  basePath: '/briefly/app',
  
  serverExternalPackages: ['pdf-parse', 'mammoth', 'xlsx'],
  webpack: (config, { isServer }) => {
    // Handle node modules that need to be externalized
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    })
    
    // Fix ChromaDB import issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@chroma-core/default-embed': false,
      'fs': false,
      'path': false,
      'os': false,
    }
    
    // Ignore ChromaDB native modules
    config.externals.push({
      '@chroma-core/default-embed': 'commonjs @chroma-core/default-embed',
    })
    
    return config
  },
  // Image optimization configuration
  images: {
    domains: ['lh3.googleusercontent.com'], // For Google profile images
  },
  // COMPLETELY DISABLE ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // COMPLETELY DISABLE TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
