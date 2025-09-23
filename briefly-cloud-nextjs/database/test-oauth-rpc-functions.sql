-- Test script for OAuth RPC functions
-- This script tests the RPC functions for private schema operations

-- ============================================================================
-- Test Setup
-- ============================================================================

-- Create a test user in app.users if it doesn't exist
DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
BEGIN
    -- Insert test user if not exists
    INSERT INTO app.users (id, email, full_name)
    VALUES (test_user_id, 'test@example.com', 'Test User')
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Test user created/verified: %', test_user_id;
END $test$;

-- ============================================================================
-- Test 1: Save OAuth Token
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
    test_access_token TEXT := 'test-access-token-12345';
    test_refresh_token TEXT := 'test-refresh-token-67890';
    test_expires_at TIMESTAMPTZ := NOW() + INTERVAL '1 hour';
    test_scope TEXT := 'https://www.googleapis.com/auth/drive.file';
BEGIN
    -- Test saving Google OAuth token
    PERFORM public.save_oauth_token(
        test_user_id,
        'google',
        test_access_token,
        test_refresh_token,
        test_expires_at,
        test_scope
    );
    
    RAISE NOTICE 'Test 1 PASSED: OAuth token saved successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 1 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test 2: Retrieve OAuth Token
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
    retrieved_token RECORD;
    expected_access_token TEXT := 'test-access-token-12345';
    expected_refresh_token TEXT := 'test-refresh-token-67890';
BEGIN
    -- Test retrieving Google OAuth token
    SELECT * INTO retrieved_token
    FROM public.get_oauth_token(test_user_id, 'google')
    LIMIT 1;
    
    IF retrieved_token IS NULL THEN
        RAISE NOTICE 'Test 2 FAILED: No token retrieved';
    ELSIF retrieved_token.access_token = expected_access_token 
          AND retrieved_token.refresh_token = expected_refresh_token THEN
        RAISE NOTICE 'Test 2 PASSED: OAuth token retrieved successfully';
        RAISE NOTICE '  Access Token: %', retrieved_token.access_token;
        RAISE NOTICE '  Refresh Token: %', retrieved_token.refresh_token;
        RAISE NOTICE '  Expires At: %', retrieved_token.expires_at;
        RAISE NOTICE '  Scope: %', retrieved_token.scope;
    ELSE
        RAISE NOTICE 'Test 2 FAILED: Token data mismatch';
        RAISE NOTICE '  Expected Access: %, Got: %', expected_access_token, retrieved_token.access_token;
        RAISE NOTICE '  Expected Refresh: %, Got: %', expected_refresh_token, retrieved_token.refresh_token;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 2 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test 3: Test Token Exists Function
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
    token_exists BOOLEAN;
BEGIN
    -- Test token exists function
    SELECT public.oauth_token_exists(test_user_id, 'google') INTO token_exists;
    
    IF token_exists THEN
        RAISE NOTICE 'Test 3 PASSED: Token exists function works correctly';
    ELSE
        RAISE NOTICE 'Test 3 FAILED: Token should exist but function returned false';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 3 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test 4: Test Token Status Function
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
    token_status RECORD;
BEGIN
    -- Test token status function
    SELECT * INTO token_status
    FROM public.get_oauth_token_status(test_user_id, 'google')
    LIMIT 1;
    
    IF token_status.exists THEN
        RAISE NOTICE 'Test 4 PASSED: Token status function works correctly';
        RAISE NOTICE '  Exists: %', token_status.exists;
        RAISE NOTICE '  Expires At: %', token_status.expires_at;
        RAISE NOTICE '  Is Expired: %', token_status.is_expired;
        RAISE NOTICE '  Expires Soon: %', token_status.expires_soon;
    ELSE
        RAISE NOTICE 'Test 4 FAILED: Token status should show exists=true';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 4 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test 5: Delete OAuth Token
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
    token_exists_after BOOLEAN;
BEGIN
    -- Test deleting Google OAuth token
    PERFORM public.delete_oauth_token(test_user_id, 'google');
    
    -- Verify token was deleted
    SELECT public.oauth_token_exists(test_user_id, 'google') INTO token_exists_after;
    
    IF NOT token_exists_after THEN
        RAISE NOTICE 'Test 5 PASSED: OAuth token deleted successfully';
    ELSE
        RAISE NOTICE 'Test 5 FAILED: Token should be deleted but still exists';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 5 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test 6: Test Invalid Provider Validation
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
BEGIN
    -- Test invalid provider should raise exception
    PERFORM public.save_oauth_token(
        test_user_id,
        'invalid_provider',
        'test-token',
        NULL,
        NULL,
        NULL
    );
    
    RAISE NOTICE 'Test 6 FAILED: Should have raised exception for invalid provider';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%Invalid provider%' THEN
            RAISE NOTICE 'Test 6 PASSED: Invalid provider validation works correctly';
        ELSE
            RAISE NOTICE 'Test 6 FAILED: Unexpected error: %', SQLERRM;
        END IF;
END $test$;

-- ============================================================================
-- Test 7: Test Connection Status Function
-- ============================================================================

DO $test$
DECLARE
    test_user_id UUID := '12345678-1234-1234-1234-123456789012';
BEGIN
    -- Test updating connection status
    PERFORM public.update_connection_status(
        test_user_id,
        'google',
        true,
        NULL
    );
    
    RAISE NOTICE 'Test 7 PASSED: Connection status updated successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test 7 FAILED: %', SQLERRM;
END $test$;

-- ============================================================================
-- Test Summary
-- ============================================================================

RAISE NOTICE '============================================================================';
RAISE NOTICE 'OAuth RPC Functions Test Complete';
RAISE NOTICE 'Check the notices above for individual test results';
RAISE NOTICE '============================================================================';

-- Clean up test data
DELETE FROM app.connection_status WHERE user_id = '12345678-1234-1234-1234-123456789012';
DELETE FROM private.oauth_tokens WHERE user_id = '12345678-1234-1234-1234-123456789012';
DELETE FROM app.users WHERE id = '12345678-1234-1234-1234-123456789012';

RAISE NOTICE 'Test cleanup completed';