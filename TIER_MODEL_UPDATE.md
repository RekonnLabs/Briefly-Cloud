# Tier-Based Model Update: GPT-3.5 for Free, GPT-4 Turbo for Pro

## Overview
This update implements tier-based AI model restrictions to differentiate between Free and Pro subscription tiers.

## Changes Made

### Updated Tier Limits and Model Assignment:

#### Free Tier:
- **Documents**: 25 (increased from 10)
- **Chat Messages**: 100 per month
- **API Calls**: 250 per month
- **Storage**: 100 MB
- **Model**: GPT-3.5 Turbo (`gpt-3.5-turbo`)

#### Pro Tier:
- **Documents**: 500 (decreased from 1,000)
- **Chat Messages**: 400 per month (decreased from 10,000)
- **API Calls**: 1,000 per month
- **Storage**: 1 GB
- **Model**: GPT-4 Turbo (`gpt-4-turbo`)

#### Pro BYOK Tier:
- **Documents**: 5,000 (decreased from 10,000)
- **Chat Messages**: 2,000 per month
- **API Calls**: 5,000 per month
- **Storage**: 10 GB
- **Model**: User's own API key with GPT-4 Turbo as default

### Files Updated:

#### Backend Changes:
1. **`server/routes/chat.py`**:
   - Updated `TIER_LIMITS` to use `gpt-4-turbo` for Pro tier
   - Updated `determine_model()` function logic
   - Updated BYOK default model to `gpt-4-turbo`
   - Updated `ChatRequest` default model

2. **`server/routes/auth.py`**:
   - Updated `TIER_LIMITS` with new model features
   - Added `gpt_3_5_turbo` and `gpt_4_turbo` to feature lists

#### Frontend Changes:
3. **`client/src/components/OnboardingFlow.tsx`**:
   - Updated tier descriptions to show correct models
   - Free: "GPT-3.5 Turbo model"
   - Pro: "GPT-4 Turbo model (latest & most capable)"

4. **`client/src/components/CloudSettings.tsx`**:
   - Updated Pro tier description text

#### Configuration Files:
5. **Environment Files**:
   - Updated `DEFAULT_LLM_MODEL` in `.env`, `.env.example`, `env.railway.template`

#### Documentation:
6. **`README.md`**: Updated all references from GPT-4o to GPT-4 Turbo
7. **`package.json`**: Updated description and keywords
8. **Steering Files**: Updated product descriptions

#### Tests:
9. **Test Files**: Updated expected models in test cases
   - `tests/test_tier_limits.py`
   - `tests/test_tier_gating.py`

### Validation:
- Created `test_model_selection.py` to validate the logic
- All tests pass ✅

## Updated Tier Limits Structure:

```python
TIER_LIMITS = {
    "free": {
        "documents": 25,
        "chat_messages": 100,
        "api_calls": 250,
        "storage_bytes": 104857600,  # 100 MB
        "model": "gpt-3.5-turbo"
    },
    "pro": {
        "documents": 500,
        "chat_messages": 400,
        "api_calls": 1000,
        "storage_bytes": 1073741824,  # 1 GB
        "model": "gpt-4-turbo"
    },
    "pro_byok": {
        "documents": 5000,
        "chat_messages": 2000,
        "api_calls": 5000,
        "storage_bytes": 10737418240,  # 10 GB
        "model": "byok"
    }
}
```

## Model Selection Logic:

```python
def determine_model(tier: str, api_key_hash: Optional[str], requested_model: str) -> str:
    if tier == 'pro_byok' and api_key_hash:
        return 'byok'  # User's own API key
    elif tier == 'pro':
        return 'gpt-4-turbo'  # Pro gets GPT-4 Turbo
    else:
        return 'gpt-3.5-turbo'  # Free gets GPT-3.5 Turbo
```

## Impact:
- **Free users**: 25 documents, 100 messages/month, GPT-3.5 Turbo, 100MB storage
- **Pro users**: 500 documents, 400 messages/month, GPT-4 Turbo, 1GB storage
- **BYOK users**: 5,000 documents, 2,000 messages/month, own API key, 10GB storage

This creates balanced tiers with clear upgrade incentives while maintaining cost-effectiveness across all levels.