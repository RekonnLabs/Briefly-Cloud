# 🐛 Bug Tracker – Briefly Cloud

## Known Issues
- [ ] Sometimes OAuth token expires without refresh (needs retry logic)
- [ ] BYOK key may silently fail if model is too limited (add token length test)
- [ ] Vector DB fallback from Chroma → Supabase not yet tested

## Edge Cases
- User changes Drive file after indexing → unclear whether to re-index


## 🐛 Bug #003: BYOK Error Handling Missing
**Status:** FIXED  
**Priority:** HIGH  
**Found:** 2024-01-XX during phase validation  
**Description:** BYOK functionality was showing placeholder message instead of proper error handling for invalid keys, quota exceeded, etc.  
**Fix:** Implemented comprehensive BYOK error handling with specific error messages for authentication, rate limits, and quota issues.  
**Files Changed:** `server/routes/chat.py`

## 🐛 Bug #004: Local ChromaDB Instead of Chroma Cloud
**Status:** FIXED  
**Priority:** HIGH  
**Found:** 2024-01-XX during phase validation  
**Description:** Vector database was using local ChromaDB instead of remote Chroma Cloud as specified in PRD.  
**Fix:** Updated ChromaDB client configuration to use HttpClient with Chroma Cloud API.  
**Files Changed:** `server/routes/embed.py`, `server/routes/chat.py`, `server/.env.example`

## 🐛 Bug #005: Missing File Type Validation
**Status:** FIXED  
**Priority:** MEDIUM  
**Found:** 2024-01-XX during phase validation  
**Description:** Embedding process was not validating file types or logging skipped files to UI.  
**Fix:** Added file type validation and skipped files display in IndexingProgress component.  
**Files Changed:** `server/routes/embed.py`, `client/src/components/IndexingProgress.tsx`



## 🐛 Bug #006: BYOK Implementation Inconsistency
**Priority:** HIGH  
**Status:** ✅ FIXED  
**Date:** 2024-07-09  

**Issue:**
- Two different BYOK implementations in same file (chat.py)
- Lines 253-292: Proper error handling implementation
- Lines 351-354: Placeholder "not yet implemented" message
- Inconsistent user experience for BYOK requests

**Root Cause:**
- Incomplete code migration during development
- Placeholder code not removed after proper implementation

**Fix Applied:**
- Unified BYOK implementation across all chat endpoints
- Removed placeholder "not yet implemented" message
- Applied consistent error handling for all BYOK scenarios
- All BYOK requests now use proper OpenAI client setup

**Files Modified:**
- `server/routes/chat.py` - Lines 351-388

**Testing:**
- ✅ BYOK error handling now consistent
- ✅ All error scenarios properly handled
- ✅ User-friendly error messages maintained

**Validation:**
- All BYOK functionality now uses unified implementation
- Error handling consistent across streaming and non-streaming endpoints
- Ready for production deployment

