# Briefly Cloud MVP - QA Testing Guide

## Overview
This guide provides step-by-step testing procedures to verify all MVP functionality works correctly before launch.

## Prerequisites
- Supabase project configured with proper tables and RLS policies
- Google OAuth app configured for Drive API access
- Microsoft OAuth app configured for OneDrive API access (Pro tier)
- OpenAI API key configured for GPT models
- Test Google Drive account with sample documents
- Test Microsoft account with OneDrive documents (for Pro testing)

## Test Environment Setup

### 1. Backend Setup
```bash
cd server
pip install -r requirements.txt
cp .env.example .env
# Configure environment variables in .env
python main.py
```

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```

### 3. Database Setup
- Ensure Supabase tables are created (users, oauth_tokens, file_metadata, etc.)
- Verify RLS policies are in place
- Test database connectivity

## Test Cases

### Phase 1: Authentication Testing

#### Test 1.1: User Registration
**Steps:**
1. Navigate to application URL
2. Click "Don't have an account? Sign up"
3. Enter valid email and password
4. Submit registration form

**Expected Results:**
- Registration successful message appears
- User redirected to login form
- Email verification sent (check Supabase auth logs)

#### Test 1.2: User Login
**Steps:**
1. Enter registered email and password
2. Click "Sign In"

**Expected Results:**
- User successfully authenticated
- Redirected to main application
- User profile displayed in header
- Subscription tier badge shows "Free"

#### Test 1.3: Authentication Persistence
**Steps:**
1. Login successfully
2. Refresh browser page
3. Close and reopen browser

**Expected Results:**
- User remains logged in after refresh
- Authentication persists across browser sessions

### Phase 2: Cloud Storage Integration Testing

#### Test 2.1: Google Drive Connection (Free Tier)
**Steps:**
1. Login as Free tier user
2. Click "Settings" in header
3. Click "Connect" next to Google Drive
4. Complete OAuth flow in popup window

**Expected Results:**
- OAuth popup opens with Google consent screen
- After authorization, popup closes
- Google Drive shows as "Connected" with user email
- Connection status persists after page refresh

#### Test 2.2: OneDrive Connection Restriction (Free Tier)
**Steps:**
1. As Free tier user, check OneDrive section in Settings

**Expected Results:**
- OneDrive shows "Requires Pro plan"
- Connect button is disabled
- "Pro Only" badge displayed

#### Test 2.3: OneDrive Connection (Pro Tier)
**Steps:**
1. Upgrade user to Pro tier in Supabase
2. Refresh application
3. Go to Settings
4. Click "Connect" next to OneDrive

**Expected Results:**
- OneDrive connect button is enabled
- OAuth flow works for Microsoft Graph API
- OneDrive shows as connected after authorization

### Phase 3: Document Indexing Testing

#### Test 3.1: Document Indexing Trigger
**Steps:**
1. Ensure Google Drive is connected
2. Upload test documents to Google Drive (PDF, DOCX, TXT)
3. In main chat, click "Index Documents"

**Expected Results:**
- Indexing progress component appears
- Progress bar shows incremental progress
- File count updates as documents are processed
- Success message appears when complete

#### Test 3.2: Indexing Progress Visualization
**Steps:**
1. Start document indexing with multiple files
2. Observe progress indicators

**Expected Results:**
- Progress bar shows percentage completion
- File count shows "X of Y files processed"
- Status messages update during processing
- Visual indicators for different states (processing, completed, failed)

#### Test 3.3: Indexing Error Handling
**Steps:**
1. Disconnect internet during indexing
2. Try indexing with corrupted files

**Expected Results:**
- Error messages displayed clearly
- System gracefully handles failures
- Partial indexing results preserved
- User can retry failed operations

### Phase 4: AI Chat Testing

#### Test 4.1: Basic Chat Functionality
**Steps:**
1. Complete document indexing
2. Ask question: "What are the key features mentioned in my documents?"
3. Send message

**Expected Results:**
- AI responds with relevant information from indexed documents
- Response includes source citations
- Conversation history maintained
- Streaming response works smoothly

#### Test 4.2: Context Retrieval Accuracy
**Steps:**
1. Ask specific questions about document content
2. Test with different query types:
   - Factual questions
   - Summarization requests
   - Comparison queries

**Expected Results:**
- AI provides accurate answers based on document content
- Relevant document chunks retrieved
- Source files properly cited
- Answers stay within document context

#### Test 4.3: Tier-Based Model Selection
**Steps:**
1. Test chat as Free tier user
2. Upgrade to Pro tier and test
3. Configure BYOK and test

**Expected Results:**
- Free tier uses GPT-3.5 Turbo
- Pro tier uses GPT-4o
- BYOK tier uses user's API key
- Model selection enforced correctly

### Phase 5: Subscription Tier Testing

#### Test 5.1: Usage Limit Enforcement (Free Tier)
**Steps:**
1. As Free tier user, send 100+ chat messages
2. Attempt to exceed monthly limit

**Expected Results:**
- Usage counter tracks messages correctly
- Error message when limit exceeded
- Upgrade prompt displayed
- Access restricted appropriately

#### Test 5.2: Pro Tier Benefits
**Steps:**
1. Upgrade user to Pro tier
2. Test OneDrive access
3. Verify GPT-4o model usage
4. Test higher usage limits

**Expected Results:**
- OneDrive connection available
- GPT-4o responses (higher quality)
- 10,000 message limit enforced
- All Pro features accessible

#### Test 5.3: BYOK Configuration
**Steps:**
1. Set user to Pro BYOK tier
2. Configure OpenAI API key in settings
3. Test chat functionality

**Expected Results:**
- API key configuration interface available
- User's API key used for requests
- Unlimited usage allowed
- API key stored securely

### Phase 6: UI/UX Testing

#### Test 6.1: Onboarding Flow
**Steps:**
1. Create new user account
2. Complete onboarding flow
3. Test each onboarding step

**Expected Results:**
- Onboarding appears for new users
- All steps navigate correctly
- Information is clear and helpful
- Can skip or complete onboarding

#### Test 6.2: Responsive Design
**Steps:**
1. Test on desktop browser
2. Test on mobile device
3. Test on tablet

**Expected Results:**
- Layout adapts to different screen sizes
- All functionality accessible on mobile
- Touch interactions work properly
- Text remains readable

#### Test 6.3: Error Handling
**Steps:**
1. Test with network disconnection
2. Test with invalid API responses
3. Test with malformed data

**Expected Results:**
- Graceful error messages displayed
- Application doesn't crash
- User can recover from errors
- Helpful error descriptions provided

## Performance Testing

### Load Testing
- Test with large document sets (100+ files)
- Verify indexing performance
- Test concurrent user scenarios
- Monitor memory and CPU usage

### Response Time Testing
- Chat response times < 5 seconds
- Document indexing reasonable for file count
- UI interactions feel responsive
- API endpoints respond quickly

## Security Testing

### Authentication Security
- JWT tokens properly validated
- Session management secure
- Password requirements enforced
- OAuth flows secure

### Data Protection
- User data isolated properly
- API keys stored securely
- File access permissions correct
- No data leakage between users

## Browser Compatibility

Test on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Final Checklist

Before launch, verify:
- [ ] All test cases pass
- [ ] No console errors in browser
- [ ] All API endpoints working
- [ ] Database properly configured
- [ ] OAuth apps approved for production
- [ ] Environment variables set correctly
- [ ] Error monitoring configured
- [ ] Backup procedures in place
- [ ] Documentation complete
- [ ] Support processes ready

## Known Issues Log

Document any issues found during testing:

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Example issue | Low | Fixed | Description of fix |

## Test Results Summary

After completing all tests, provide summary:
- Total test cases: X
- Passed: X
- Failed: X
- Critical issues: X
- Ready for launch: Yes/No

## Post-Launch Monitoring

Set up monitoring for:
- User registration rates
- Authentication success rates
- Document indexing success rates
- Chat response quality
- Error rates and types
- Performance metrics
- User feedback and support requests

