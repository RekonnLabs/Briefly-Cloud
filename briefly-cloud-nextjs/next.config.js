/** @type {import('next').NextConfig} */

// Simple production check without importing environment module
const isProduction = () => process.env.NODE_ENV === 'production'

// Production security headers configuration
// Note: These complement the middleware security headers
const getProductionSecurityHeaders = () => {
  if (!isProduction()) return []
  
  return [
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains; preload'
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff'
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY'
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin'
    },
    {
      key: 'X-XSS-Protection',
      value: '1; mode=block'
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=()'
    }
  ]
}

const nextConfig = {
  // Basic configuration
  reactStrictMode: true,
  
  // Security configuration
  poweredByHeader: false, // Remove X-Powered-By header
  
  // Environment-specific settings
  ...(isProduction() && {
    // Production-only settings
    compress: true,
    
    // Disable source maps in production for security
    productionBrowserSourceMaps: false,
    
    // Optimize images
    images: {
      domains: [],
      formats: ['image/webp', 'image/avif'],
      minimumCacheTTL: 60,
    },
  }),
  
  // Security headers (additional to middleware)
  async headers() {
    const baseHeaders = [
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on'
      }
    ]
    
    // Add production security headers
    const productionHeaders = getProductionSecurityHeaders()
    const securityHeaders = [...baseHeaders, ...productionHeaders]

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/api/(.*)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          }
        ],
      },
      {
        source: '/api/storage/:provider/start',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          }
        ],
      }
    ]
  },

  // Redirects for security
  async redirects() {
    return [
      // Redirect HTTP to HTTPS in production
      ...(isProduction() ? [
        {
          source: '/(.*)',
          has: [
            {
              type: 'header',
              key: 'x-forwarded-proto',
              value: 'http',
            },
          ],
          destination: 'https://briefly.cloud/:path*',
          permanent: true,
        }
      ] : []),
    ]
  },

  // Rewrites for API versioning and security
  async rewrites() {
    return [
      // API versioning
      {
        source: '/api/v1/:path*',
        destination: '/api/:path*',
      },
    ]
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Turbopack handles server-only modules automatically
    // No additional configuration needed for basic setup
  },

  // Webpack configuration for security (fallback for --webpack builds)
  webpack: (config, { dev, isServer }) => {
    // Prevent bundling of server-only modules in client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }

    return config
  },

  // Environment variables to expose to client
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Server external packages
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // Experimental features
  experimental: {
    // Security-focused experimental features
    ...(isProduction() && {
      // optimizeCss: true, // Disabled due to missing critters dependency
      scrollRestoration: true,
    }),
  },

  // TypeScript configuration
  typescript: {
    // Type checking is handled by CI/CD in production
    ignoreBuildErrors: isProduction(),
  },

  // ESLint configuration (moved to eslintrc.json for Next.js 16+)
  // Note: eslint config in next.config.js is deprecated in Next.js 16

  // Output configuration
  output: 'standalone',
}

module.exports = nextConfig