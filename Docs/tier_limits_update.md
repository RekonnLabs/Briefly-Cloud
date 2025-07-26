# Subscription Tier Limits Update

## Overview
This document outlines the updated subscription tier limits for Briefly Cloud, designed to balance user experience with cost-conscious operations.

## Updated Tier Limits

| Tier | Documents | Chat Messages/Month | API Calls/Month | Storage |
|------|-----------|-------------------|-----------------|---------|
| **Free** | 10 | 100 | 1,000 | 100 MB |
| **Pro** | 1,000 | 1,000 | 10,000 | 10 GB |
| **Pro BYOK** | 10,000 | 5,000 | 50,000 | 100 GB |

## Key Changes

### Chat Message Limits
- **Pro tier**: Reduced from 10,000 to 1,000 messages/month
- **Pro BYOK tier**: Reduced from 50,000 to 5,000 messages/month

**Rationale**: Chat messages are the highest cost component due to LLM API usage. These limits align with sustainable cost models while still providing substantial value.

### API Call Limits
- **Pro tier**: Reduced from 100,000 to 10,000 calls/month
- **Pro BYOK tier**: Reduced from 500,000 to 50,000 calls/month

**Rationale**: API calls include both internal processing and external service calls. The new limits reflect realistic usage patterns.

### Document and Storage Limits
- **No changes**: These limits remain cost-effective and provide good user experience

## Implementation Details

### Database Schema Updates
- Updated `documents_limit`, `chat_messages_limit`, `api_calls_limit` columns
- Added usage tracking with `usage_events` table
- Implemented automatic limit enforcement functions

### Backend API Changes
- Added usage limit middleware for automatic enforcement
- HTTP 429 responses when limits exceeded
- Usage headers in API responses
- Comprehensive usage tracking and analytics

### Frontend Updates
- New `UsageLimits` component showing real-time usage
- Warning messages when approaching limits
- Upgrade prompts for users near limits
- Usage dashboard with progress bars

## Business Impact

### Cost Management
- **Reduced LLM costs**: Lower chat limits significantly reduce OpenAI API expenses
- **Predictable scaling**: Usage caps prevent unexpected cost spikes
- **Sustainable margins**: Limits aligned with pricing to maintain profitability

### User Experience
- **Clear expectations**: Users know their limits upfront
- **Upgrade incentives**: Free tier encourages upgrades without being restrictive
- **BYOK value**: Pro BYOK tier provides excellent value for power users

### Competitive Positioning
- **Free tier**: Generous enough to attract users, limited enough to encourage upgrades
- **Pro tier**: Competitive with similar services while maintaining margins
- **BYOK tier**: Unique offering for cost-conscious power users

## Monitoring and Alerts

### Usage Tracking
- Real-time usage counters
- Monthly reset cycles
- Detailed event logging
- Usage analytics dashboard

### Alert Thresholds
- **80% usage**: Warning notifications
- **90% usage**: Critical alerts
- **100% usage**: Service limitations with upgrade prompts

### Admin Monitoring
- Usage trends by tier
- Cost per user analysis
- Upgrade conversion tracking
- Limit breach notifications

## Migration Strategy

### Existing Users
- Grandfathered users maintain current limits for 30 days
- Email notifications about upcoming changes
- Automatic tier adjustments based on usage patterns
- Upgrade incentives for affected users

### New Users
- Immediate application of new limits
- Clear communication during onboarding
- Usage guidance and best practices
- Proactive upgrade recommendations

## Technical Implementation

### Database Functions
```sql
-- Check usage limits
SELECT check_usage_limits(user_id, 'chat_messages');

-- Increment usage counters
SELECT increment_usage(user_id, 'chat_message', 1, '{"endpoint": "/api/chat"}');

-- Reset monthly usage
SELECT reset_monthly_usage();
```

### API Endpoints
- `GET /api/usage/{user_id}` - Current usage statistics
- `GET /api/usage/{user_id}/warnings` - Usage warnings and recommendations
- `POST /api/usage/reset-monthly` - Admin function to reset monthly counters

### Error Handling
```json
{
  "error": "usage_limit_exceeded",
  "message": "You have exceeded your chat_messages limit for the pro tier",
  "current_usage": 1000,
  "limit": 1000,
  "tier": "pro",
  "upgrade_required": false
}
```

## Testing and Validation

### Test Scenarios
1. **Limit enforcement**: Verify API returns 429 when limits exceeded
2. **Usage tracking**: Confirm accurate counter increments
3. **Monthly reset**: Test automatic usage reset functionality
4. **Upgrade flow**: Validate limit increases after tier changes

### Performance Impact
- Minimal latency added by usage checks (<5ms)
- Database indexes optimize usage queries
- Caching reduces repeated limit lookups
- Graceful degradation if usage service unavailable

## Future Enhancements

### Planned Features
- **Usage forecasting**: Predict when users will hit limits
- **Smart notifications**: Personalized usage recommendations
- **Flexible limits**: Temporary limit increases for special cases
- **Usage analytics**: Detailed insights for users and admins

### Potential Adjustments
- **Seasonal limits**: Higher limits during peak usage periods
- **Rollover usage**: Unused limits carry to next month
- **Burst capacity**: Temporary overages with automatic billing
- **Custom enterprise limits**: Tailored limits for large customers

## Support and Communication

### User Communication
- In-app notifications about usage status
- Email alerts for limit approaches
- Clear upgrade paths and benefits
- Usage optimization tips and best practices

### Support Team Training
- Understanding of new limits and rationale
- Upgrade conversation scripts
- Technical troubleshooting for usage issues
- Escalation paths for limit increase requests

## Success Metrics

### Key Performance Indicators
- **Cost per user**: Target 30% reduction in LLM costs
- **Upgrade conversion**: 15% increase in free-to-paid conversions
- **User satisfaction**: Maintain >4.0 rating despite limits
- **Churn rate**: Keep churn increase <5% during transition

### Monitoring Dashboard
- Real-time usage across all tiers
- Cost tracking and projections
- Upgrade funnel analytics
- Support ticket volume related to limits

This update positions Briefly Cloud for sustainable growth while maintaining a competitive user experience across all subscription tiers.