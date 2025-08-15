/** @type {import('next').NextConfig} */

// Simple production check without importing environment module
const isProduction = () => process.env.NODE_ENV === 'production'

// Basic security configuration for build time
const getBasicSecurityConfig = () => ({
  headers: {
    hsts: {
      maxAge: isProduction() ? 31536000 : 0,
      includeSubDomains: isProduction(),
      preload: isProduction()
    }
  }
})

const securityConfig = getBasicSecurityConfig()

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
    const securityHeaders = [
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      }
    ]

    // Add HSTS in production
    if (isProduction() && securityConfig.headers.hsts.maxAge > 0) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: `max-age=${securityConfig.headers.hsts.maxAge}; includeSubDomains; preload`
      })
    }

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

  // Webpack configuration for security
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
      optimizeCss: true,
      scrollRestoration: true,
    }),
  },

  // TypeScript configuration
  typescript: {
    // Type checking is handled by CI/CD in production
    ignoreBuildErrors: isProduction(),
  },

  // ESLint configuration
  eslint: {
    // Linting is handled by CI/CD in production
    ignoreDuringBuilds: isProduction(),
  },

  // Output configuration
  output: 'standalone',
}

module.exports = nextConfig