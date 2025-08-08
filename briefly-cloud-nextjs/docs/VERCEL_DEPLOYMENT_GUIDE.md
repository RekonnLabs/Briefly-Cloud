# Vercel Deployment Guide

This guide covers the complete deployment process for Briefly Cloud on Vercel, including environment configuration, custom domain setup, monitoring, and production best practices.

## Overview

Briefly Cloud is deployed as a unified Next.js application on Vercel, providing:
- **Automatic deployments** from GitHub
- **Edge runtime** for optimal performance
- **Built-in monitoring** and analytics
- **Custom domain** support with SSL
- **Environment variable** management
- **Serverless functions** for API routes

## Prerequisites

Before deploying, ensure you have:
- [x] Vercel account with team/pro plan (recommended for production)
- [x] GitHub repository with the latest code
- [x] All required API keys and credentials
- [x] Custom domain (optional but recommended)
- [x] Supabase project configured
- [x] OpenAI API access
- [x] Stripe account for payments

## Step 1: Initial Vercel Setup

### 1.1 Connect Repository

1. **Login to Vercel**: Go to [vercel.com](https://vercel.com) and sign in
2. **Import Project**: Click "New Project" and select your GitHub repository
3. **Configure Project**: 
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `briefly-cloud-nextjs`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install`

### 1.2 Basic Configuration

```json
{
  "name": "briefly-cloud",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "outputDirectory": ".next"
}
```

## Step 2: Environment Variables Configuration

### 2.1 Required Environment Variables

Configure these in your Vercel dashboard under **Settings > Environment Variables**:

#### Authentication & Security
```env
NEXTAUTH_SECRET=your-nextauth-secret-key-min-32-chars
NEXTAUTH_URL=https://your-domain.com
```

#### Database & Storage
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

#### AI & Embeddings
```env
OPENAI_API_KEY=sk-your-openai-api-key
```

#### OAuth Providers
```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-oauth-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-oauth-client-secret
```

#### Payments
```env
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your-stripe-publishable-key
```

#### Vector Storage
```env
CHROMADB_URL=https://your-chromadb-instance.com
CHROMADB_API_KEY=your-chromadb-api-key
```

#### Monitoring & Analytics
```env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
VERCEL_ANALYTICS_ID=your-vercel-analytics-id
```

#### Cron Jobs & Background Tasks
```env
CRON_SECRET=your-secure-cron-secret-key
```

### 2.2 Environment Variable Security

- **Use different keys** for production vs development
- **Rotate secrets regularly** (every 90 days recommended)
- **Use Vercel's encrypted storage** for sensitive values
- **Never commit secrets** to version control
- **Use environment-specific values** (staging vs production)

### 2.3 Environment Variable Template

Create a `.env.production.template` file for reference:

```env
# Authentication
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Database
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# AI Services
OPENAI_API_KEY=

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Vector Storage
CHROMADB_URL=
CHROMADB_API_KEY=

# Monitoring
SENTRY_DSN=
VERCEL_ANALYTICS_ID=

# Background Jobs
CRON_SECRET=
```

## Step 3: Custom Domain Configuration

### 3.1 Add Custom Domain

1. **Go to Domains**: In your Vercel project, navigate to **Settings > Domains**
2. **Add Domain**: Enter your custom domain (e.g., `app.brieflycloud.com`)
3. **Configure DNS**: Update your DNS provider with Vercel's nameservers or CNAME records

### 3.2 DNS Configuration

#### Option A: Nameservers (Recommended)
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

#### Option B: CNAME Record
```
CNAME: app.brieflycloud.com -> cname.vercel-dns.com
```

### 3.3 SSL Certificate

Vercel automatically provisions SSL certificates via Let's Encrypt:
- **Automatic renewal** every 90 days
- **Wildcard support** for subdomains
- **HTTP to HTTPS redirect** enabled by default

### 3.4 Update Environment Variables

After domain setup, update:
```env
NEXTAUTH_URL=https://app.brieflycloud.com
```

And update OAuth redirect URIs in:
- **Google Console**: `https://app.brieflycloud.com/api/auth/callback/google`
- **Microsoft Azure**: `https://app.brieflycloud.com/api/auth/callback/azure-ad`

## Step 4: Production Optimizations

### 4.1 Vercel Configuration

Update `vercel.json` for production:

```json
{
  "framework": "nextjs",
  "functions": {
    "src/app/api/**": {
      "maxDuration": 30
    },
    "src/app/api/chat/**": {
      "maxDuration": 60
    },
    "src/app/api/embed/**": {
      "maxDuration": 120
    }
  },
  "crons": [
    {
      "path": "/api/cron/gdpr-cleanup",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/usage-reset",
      "schedule": "0 0 1 * *"
    },
    {
      "path": "/api/cron/health-check",
      "schedule": "*/5 * * * *"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/app",
      "destination": "/briefly/app",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/health",
      "destination": "/api/health"
    }
  ]
}
```

### 4.2 Next.js Configuration

Update `next.config.ts` for production:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  
  // Image optimization
  images: {
    domains: ['lh3.googleusercontent.com', 'graph.microsoft.com'],
    formats: ['image/webp', 'image/avif'],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          }
        ],
      },
    ];
  },
  
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth'],
  },
  
  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
};

export default nextConfig;
```

## Step 5: Monitoring and Alerting

### 5.1 Vercel Analytics

Enable Vercel Analytics:
1. **Go to Analytics**: In your project dashboard
2. **Enable Analytics**: Turn on Web Analytics
3. **Configure Goals**: Set up conversion tracking
4. **Monitor Performance**: Track Core Web Vitals

### 5.2 Health Checks

Create health check endpoints:

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check database connection
    const dbCheck = await checkDatabase();
    
    // Check external services
    const openaiCheck = await checkOpenAI();
    const supabaseCheck = await checkSupabase();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbCheck,
        openai: openaiCheck,
        supabase: supabaseCheck,
      },
      version: process.env.npm_package_version || '1.0.0',
    };
    
    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
```

### 5.3 Uptime Monitoring

Set up external monitoring:

#### Option A: Vercel Monitoring
- **Built-in monitoring** for function errors
- **Performance insights** and Core Web Vitals
- **Real-time alerts** via email/Slack

#### Option B: External Services
- **UptimeRobot**: Free uptime monitoring
- **Pingdom**: Advanced monitoring with global checks
- **DataDog**: Comprehensive APM solution

### 5.4 Error Tracking

Configure Sentry for error tracking:

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  debug: false,
  integrations: [
    new Sentry.BrowserTracing({
      tracePropagationTargets: ['localhost', /^https:\/\/app\.brieflycloud\.com/],
    }),
  ],
});
```

## Step 6: Performance Optimization

### 6.1 Edge Runtime

Configure API routes for Edge Runtime:

```typescript
// src/app/api/chat/route.ts
export const runtime = 'edge';
export const preferredRegion = ['iad1', 'sfo1']; // US East & West
```

### 6.2 Caching Strategy

```typescript
// src/app/api/documents/route.ts
export async function GET() {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
```

### 6.3 Database Optimization

- **Connection pooling** with Supabase
- **Query optimization** with proper indexes
- **Read replicas** for heavy read operations
- **Caching layer** with Redis (optional)

## Step 7: Security Configuration

### 7.1 Content Security Policy

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.openai.com https://*.supabase.co;"
  );
  
  return response;
}
```

### 7.2 Rate Limiting

Implement rate limiting for API routes:

```typescript
// src/app/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});
```

## Step 8: Deployment Process

### 8.1 Automated Deployment

Vercel automatically deploys when you:
1. **Push to main branch** → Production deployment
2. **Push to other branches** → Preview deployment
3. **Create pull request** → Preview deployment with unique URL

### 8.2 Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod

# Deploy with specific environment
vercel --prod --env ENVIRONMENT=production
```

### 8.3 Rollback Strategy

```bash
# List deployments
vercel ls

# Promote previous deployment
vercel promote <deployment-url>

# Rollback via dashboard
# Go to Deployments → Select previous → Promote to Production
```

## Step 9: Post-Deployment Checklist

### 9.1 Functionality Testing

- [ ] **Authentication**: Test Google/Microsoft OAuth
- [ ] **File Upload**: Test document processing
- [ ] **AI Chat**: Verify GPT-4 integration
- [ ] **Cloud Storage**: Test Google Drive/OneDrive
- [ ] **Payments**: Verify Stripe integration
- [ ] **GDPR Tools**: Test data export/deletion
- [ ] **Feature Flags**: Verify A/B testing

### 9.2 Performance Testing

- [ ] **Core Web Vitals**: Check Lighthouse scores
- [ ] **API Response Times**: Monitor endpoint performance
- [ ] **Database Queries**: Optimize slow queries
- [ ] **CDN Performance**: Verify asset delivery
- [ ] **Mobile Performance**: Test on various devices

### 9.3 Security Testing

- [ ] **SSL Certificate**: Verify HTTPS enforcement
- [ ] **Security Headers**: Check security score
- [ ] **API Authentication**: Test unauthorized access
- [ ] **Data Validation**: Verify input sanitization
- [ ] **Rate Limiting**: Test API limits

### 9.4 Monitoring Setup

- [ ] **Error Tracking**: Configure Sentry alerts
- [ ] **Uptime Monitoring**: Set up external checks
- [ ] **Performance Monitoring**: Enable Vercel Analytics
- [ ] **Log Aggregation**: Configure log forwarding
- [ ] **Alert Channels**: Set up Slack/email notifications

## Step 10: Maintenance and Updates

### 10.1 Regular Tasks

- **Weekly**: Review error logs and performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and rotate API keys
- **Annually**: Renew SSL certificates (automatic with Vercel)

### 10.2 Scaling Considerations

- **Function Limits**: Monitor execution time and memory usage
- **Database Connections**: Scale Supabase plan as needed
- **API Rate Limits**: Upgrade OpenAI/Stripe plans
- **Storage Limits**: Monitor Supabase storage usage

### 10.3 Backup Strategy

- **Database**: Automated Supabase backups
- **Code**: Git repository with multiple remotes
- **Environment Variables**: Secure backup of production configs
- **User Data**: GDPR-compliant data export capabilities

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Review build logs for specific errors

2. **Environment Variable Issues**
   - Ensure all required variables are set
   - Check for typos in variable names
   - Verify variable values are correct

3. **Domain Configuration**
   - Verify DNS propagation (can take 24-48 hours)
   - Check CNAME/A record configuration
   - Ensure SSL certificate is provisioned

4. **API Route Errors**
   - Check function timeout limits
   - Verify external service connectivity
   - Review error logs in Vercel dashboard

### Support Resources

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Vercel Support**: Available via dashboard for Pro/Team plans
- **Community**: Vercel Discord and GitHub discussions

---

This deployment guide ensures a robust, secure, and scalable production deployment of Briefly Cloud on Vercel with comprehensive monitoring and maintenance procedures.