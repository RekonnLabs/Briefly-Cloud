# Updated Tier Limits Summary

## Overview
Updated subscription tier limits to provide more balanced resource allocation across Free, Pro, and Pro BYOK tiers.

## New Tier Structure

| Tier | Documents | Chat Messages/mo | API Calls/mo | Storage | Model | Price |
|------|-----------|------------------|--------------|---------|-------|-------|
| **Free** | 25 | 100 | 250 | 100 MB | GPT-3.5 Turbo | $0 |
| **Pro** | 500 | 400 | 1,000 | 1 GB | GPT-4 Turbo | $30/mo |
| **Pro BYOK** | 5,000 | 2,000 | 5,000 | 10 GB | User's API Key | $15/mo |

## Key Changes Made

### Free Tier Improvements:
- ✅ **Documents**: Increased from 10 → 25 (150% increase)
- ✅ **Chat Messages**: Maintained at 100/month
- ✅ **API Calls**: Added explicit limit of 250/month
- ✅ **Storage**: Maintained at 100 MB
- ✅ **Model**: GPT-3.5 Turbo (cost-effective)

### Pro Tier Adjustments:
- 📉 **Documents**: Reduced from 1,000 → 500 (more realistic)
- 📉 **Chat Messages**: Reduced from 10,000 → 400 (sustainable)
- ✅ **API Calls**: Added explicit limit of 1,000/month
- 📉 **Storage**: Reduced from 10 GB → 1 GB (appropriate for tier)
- ✅ **Model**: GPT-4 Turbo (premium experience)

### Pro BYOK Tier Adjustments:
- 📉 **Documents**: Reduced from 10,000 → 5,000 (still generous)
- ✅ **Chat Messages**: Set to 2,000/month (high but not unlimited)
- ✅ **API Calls**: Added explicit limit of 5,000/month
- ✅ **Storage**: Maintained at 10 GB
- ✅ **Model**: User's own API key (maximum flexibility)

## Business Rationale

### Cost Management:
- **Free Tier**: Generous document limit attracts users while controlling AI costs
- **Pro Tier**: Balanced limits provide premium experience without excessive costs
- **BYOK Tier**: Users pay their own AI costs, allowing higher limits

### Clear Upgrade Path:
1. **Free → Pro**: 20x more documents, 4x more messages, premium AI model
2. **Pro → BYOK**: 10x more documents, 5x more messages, own API key control

### Resource Allocation:
- **Documents**: Primary differentiator between tiers
- **Chat Messages**: Aligned with expected usage patterns
- **API Calls**: Buffer for system operations beyond chat
- **Storage**: Scales with document limits appropriately

## Technical Implementation

All limits are enforced at the backend level in:
- `server/routes/chat.py` - Chat message limits and model selection
- `server/routes/auth.py` - User profile and tier information
- Frontend components updated to reflect new limits

## Validation

✅ All tests pass with new tier structure
✅ Model selection logic works correctly
✅ Frontend displays accurate tier information
✅ Backend enforces all limits properly

This structure provides a sustainable, scalable tier system that balances user value with operational costs.