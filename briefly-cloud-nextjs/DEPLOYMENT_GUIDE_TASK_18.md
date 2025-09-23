# Task 18: Deploy Updated API Code - Deployment Guide

## Overview

This guide covers the deployment of schema-aware API code to production as part of Task 18 of the post-migration API fixes specification. The deployment includes schema-aware clients, updated repositories, enhanced error handling, and comprehensive monitoring.

## Prerequisites

### ✅ Completed Tasks
- **Task 17**: RPC functions deployed to database
- **Tasks 1-16**: All schema infrastructure and testing completed

### 🔧 Environment Setup
```bash
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Optional staging environment
STAGING_SUPABASE_URL=https://staging-project.supabase.co
STAGING_SUPABASE_SERVICE_KEY=staging-service-role-key

# Optional Vercel deployment
VERCEL_TOKEN=your-vercel-token
```

## Deployment Components

### 1. Schema-Aware Clients ✅
- **File**: `src/app/lib/supabase-clients.ts`
- **Features**: 
  - App schema client for application data
  - Private schema client for RPC operations
  - Public schema client for compatibility
  - Backward compatibility with existing code

### 2. Repository Layer ✅
- **Base Repository**: `src/app/lib/repos/base-repo.ts`
- **Files Repository**: `src/app/lib/repos/files-repo.ts`
- **Users Repository**: `src/app/lib/repos/users-repo.ts`
- **OAuth Repository**: `src/app/lib/repos/oauth-tokens-repo.ts`
- **Chunks Repository**: `src/app/lib/repos/chunks-repo.ts`

### 3. Enhanced Error Handling ✅
- **Schema Errors**: `src/app/lib/errors/schema-errors.ts`
- **API Middleware**: `src/app/lib/api-middleware.ts`
- **Error Context**: Correlation IDs and schema information

### 4. Updated API Routes ✅
- **Upload API**: Uses app schema for files and users
- **Chat API**: Uses app schema for conversations and messages
- **OAuth Callbacks**: Use RPC functions for private schema
- **Health Checks**: Schema-aware health monitoring

## Deployment Process

### Phase 1: Pre-Deployment Validation

```bash
# 1. Validate environment
npm run validate:environment

# 2. Run comprehensive tests
npm test

# 3. Validate build
npm run build

# 4. Check RPC functions are deployed
npm run verify:production
```

### Phase 2: Staging Deployment Testing

```bash
# Test staging environment (if available)
npm run test:staging

# Validate staging deployment
STAGING_SUPABASE_URL=your-staging-url npm run test:staging
```

### Phase 3: Production Deployment

#### Option A: Automated Deployment (Recommended)
```bash
# Full deployment with all checks
npm run deploy:api

# Dry run to validate without deploying
npm run deploy:api:dry-run

# Skip staging if not available
npm run deploy:api:skip-staging
```

#### Option B: Manual Deployment Steps

1. **Validate Pre-Deployment**
   ```bash
   npm run validate:environment
   npm test
   npm run build
   ```

2. **Deploy to Vercel**
   - Push to main branch for automatic deployment
   - Or use Vercel CLI: `vercel --prod`
   - Or deploy via Vercel dashboard

3. **Verify Deployment**
   ```bash
   npm run verify:production
   npm run monitor:production
   ```

### Phase 4: Post-Deployment Monitoring

```bash
# One-time monitoring check
npm run monitor:production

# Continuous monitoring (every 5 minutes)
npm run monitor:production:continuous
```

## Deployment Checklist

### Pre-Deployment ✅
- [ ] All environment variables configured
- [ ] RPC functions deployed and verified
- [ ] Schema-aware code implemented
- [ ] Tests passing (integration, schema, API)
- [ ] Build successful
- [ ] Staging tests passed (if available)

### Deployment ✅
- [ ] Code deployed to production
- [ ] Health endpoint responding
- [ ] Database connectivity verified
- [ ] Schema operations working
- [ ] API endpoints responding correctly
- [ ] Error handling functioning

### Post-Deployment ✅
- [ ] Monitoring setup and running
- [ ] Error rates within acceptable limits
- [ ] Performance metrics collected
- [ ] Alerts configured
- [ ] Documentation updated

## Monitoring and Validation

### Health Checks
- **Endpoint**: `/api/health`
- **Features**: Schema connectivity, service status, performance metrics
- **Monitoring**: Automated checks every 5 minutes

### Performance Metrics
- Database query response times
- API endpoint response times
- RPC function execution times
- Error rates by endpoint and schema

### Error Tracking
- Schema-specific error logging
- Correlation IDs for request tracking
- Audit logs for security events
- Performance degradation alerts

## Rollback Procedures

### Immediate Rollback
```bash
# Via Vercel dashboard
# 1. Go to Vercel project dashboard
# 2. Find previous successful deployment
# 3. Click "Promote to Production"

# Via Vercel CLI
vercel rollback [deployment-url]
```

### Validation After Rollback
```bash
# Verify rollback successful
npm run verify:production
npm run monitor:production
```

## Troubleshooting

### Common Issues

1. **Schema Connection Errors**
   ```bash
   # Check schema health
   npm run verify:production
   
   # Validate RPC functions
   npm run test:oauth-rpc
   ```

2. **API Endpoint Failures**
   ```bash
   # Monitor API health
   npm run monitor:production
   
   # Check specific endpoints
   curl https://your-domain.com/api/health
   ```

3. **Performance Issues**
   ```bash
   # Run performance monitoring
   npm run monitor:production
   
   # Check database performance
   npm run test:performance
   ```

### Debug Commands

```bash
# Check deployment status
npm run verify:production

# Monitor real-time health
npm run monitor:production:continuous

# Test specific components
npm run test:oauth-rpc
npm run test:staging

# Validate environment
npm run validate:environment
```

## Success Criteria

### ✅ Requirements Compliance

- **Requirement 7.1**: Schema-aware clients deployed and functional
- **Requirement 7.2**: Repository pattern implemented across all APIs
- **Requirement 7.3**: Enhanced error handling with schema context
- **Requirement 8.1**: Performance monitoring active and reporting

### ✅ Functional Validation

- All API endpoints respond correctly
- Schema operations work without errors
- OAuth flows use RPC functions properly
- Error handling provides proper context
- Health checks report schema status
- Performance metrics within acceptable ranges

### ✅ Monitoring Setup

- Real-time health monitoring active
- Error rate tracking configured
- Performance metrics collection enabled
- Alert thresholds configured
- Deployment reports generated

## Post-Deployment Tasks

### Immediate (0-24 hours)
1. Monitor error rates and performance
2. Validate all critical user flows
3. Check audit logs for anomalies
4. Verify monitoring alerts work

### Short-term (1-7 days)
1. Review performance trends
2. Optimize slow operations if needed
3. Update documentation based on learnings
4. Plan next optimization cycle

### Long-term (1-4 weeks)
1. Analyze usage patterns
2. Plan schema optimizations
3. Review and update monitoring thresholds
4. Document lessons learned

## Support and Escalation

### Monitoring Dashboards
- Health endpoint: `https://your-domain.com/api/health`
- Vercel deployment dashboard
- Supabase project dashboard

### Log Locations
- Vercel function logs
- Supabase database logs
- Application audit logs
- Deployment reports (JSON files)

### Escalation Procedures
1. **Critical Issues**: Immediate rollback
2. **Performance Issues**: Monitor and optimize
3. **Schema Issues**: Check RPC functions and connectivity
4. **API Issues**: Validate endpoint configuration

## Conclusion

Task 18 deployment provides:

- ✅ **Schema-aware API infrastructure** ready for production
- ✅ **Comprehensive monitoring** for health and performance
- ✅ **Robust error handling** with proper context
- ✅ **Scalable repository pattern** for future development
- ✅ **Production-ready deployment** with rollback capabilities

The deployment ensures all requirements are met while providing a solid foundation for ongoing development and maintenance of the multi-tenant schema architecture.