-- Rate Limiting Functions
-- These functions handle rate limiting with sliding windows

-- ============================================================================
-- RATE LIMITING FUNCTIONS
-- ============================================================================

-- Function to increment rate limit counter atomically
CREATE OR REPLACE FUNCTION increment_rate_limit_counter(
  user_id UUID,
  limit_type TEXT,
  action TEXT,
  window_start TIMESTAMPTZ,
  increment_by INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  -- Validate inputs
  IF limit_type NOT IN ('minute', 'hour', 'day', 'month') THEN
    RAISE EXCEPTION 'Invalid limit type: %', limit_type;
  END IF;
  
  IF action NOT IN ('api', 'chat', 'upload', 'search', 'export', 'import') THEN
    RAISE EXCEPTION 'Invalid action: %', action;
  END IF;
  
  -- Upsert the rate limit record
  INSERT INTO app.rate_limits (
    user_id,
    limit_type,
    action,
    window_start,
    count
  ) VALUES (
    user_id,
    limit_type,
    action,
    window_start,
    increment_by
  )
  ON CONFLICT (user_id, limit_type, action, window_start)
  DO UPDATE SET
    count = app.rate_limits.count + increment_by,
    updated_at = NOW()
  RETURNING count INTO new_count;
  
  RETURN new_count;
END;
$$;

-- Function to check rate limit without incrementing
CREATE OR REPLACE FUNCTION check_rate_limit(
  user_id UUID,
  action TEXT,
  limit_type TEXT,
  window_start TIMESTAMPTZ,
  quantity INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  current_count INTEGER;
  rate_limit INTEGER;
  tier_limits JSONB;
BEGIN
  -- Get user subscription info
  SELECT 
    subscription_tier,
    subscription_status,
    email
  INTO user_record
  FROM app.users
  WHERE id = user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', user_id;
  END IF;
  
  -- Check if account is active
  IF user_record.subscription_status != 'active' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'account_inactive',
      'current_count', 0,
      'limit', 0,
      'remaining', 0
    );
  END IF;
  
  -- Check if user is exempt (RekonnLabs employees)\n  IF user_record.email LIKE '%@rekonnlabs.com' THEN\n    RETURN jsonb_build_object(\n      'allowed', true,\n      'reason', 'exempt',\n      'current_count', 0,\n      'limit', -1,\n      'remaining', -1\n    );\n  END IF;\n  \n  -- Get current count for this window\n  SELECT COALESCE(count, 0)\n  INTO current_count\n  FROM app.rate_limits\n  WHERE user_id = check_rate_limit.user_id\n    AND limit_type = check_rate_limit.limit_type\n    AND action = check_rate_limit.action\n    AND window_start = check_rate_limit.window_start;\n  \n  -- Get rate limit based on subscription tier and action\n  rate_limit := get_rate_limit_for_tier_action(\n    user_record.subscription_tier,\n    action,\n    limit_type\n  );\n  \n  -- Check if the action would exceed the limit (-1 means unlimited)\n  IF rate_limit = -1 OR (current_count + quantity) <= rate_limit THEN\n    RETURN jsonb_build_object(\n      'allowed', true,\n      'current_count', current_count,\n      'limit', CASE WHEN rate_limit = -1 THEN null ELSE rate_limit END,\n      'remaining', CASE WHEN rate_limit = -1 THEN null ELSE (rate_limit - current_count) END,\n      'percent_used', CASE WHEN rate_limit = -1 THEN 0 ELSE ROUND((current_count::FLOAT / rate_limit) * 100, 2) END\n    );\n  ELSE\n    RETURN jsonb_build_object(\n      'allowed', false,\n      'reason', 'rate_limit_exceeded',\n      'current_count', current_count,\n      'limit', rate_limit,\n      'remaining', 0,\n      'percent_used', 100\n    );\n  END IF;\nEND;\n$$;\n\n-- Function to get rate limit for a tier and action\nCREATE OR REPLACE FUNCTION get_rate_limit_for_tier_action(\n  tier TEXT,\n  action TEXT,\n  limit_type TEXT\n)\nRETURNS INTEGER\nLANGUAGE plpgsql\nIMMUTABLE\nAS $$\nBEGIN\n  -- Rate limits by tier, action, and window\n  CASE tier\n    WHEN 'free' THEN\n      CASE action\n        WHEN 'api' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 10;\n            WHEN 'hour' THEN RETURN 100;\n            WHEN 'day' THEN RETURN 500;\n            WHEN 'month' THEN RETURN 1000;\n          END CASE;\n        WHEN 'chat' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 5;\n            WHEN 'hour' THEN RETURN 50;\n            WHEN 'day' THEN RETURN 100;\n            WHEN 'month' THEN RETURN 100;\n          END CASE;\n        WHEN 'upload' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 2;\n            WHEN 'hour' THEN RETURN 10;\n            WHEN 'day' THEN RETURN 25;\n            WHEN 'month' THEN RETURN 25;\n          END CASE;\n        WHEN 'search' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 10;\n            WHEN 'hour' THEN RETURN 100;\n            WHEN 'day' THEN RETURN 200;\n            WHEN 'month' THEN RETURN 500;\n          END CASE;\n        WHEN 'export' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 1;\n            WHEN 'hour' THEN RETURN 5;\n            WHEN 'day' THEN RETURN 10;\n            WHEN 'month' THEN RETURN 20;\n          END CASE;\n        WHEN 'import' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 1;\n            WHEN 'hour' THEN RETURN 5;\n            WHEN 'day' THEN RETURN 10;\n            WHEN 'month' THEN RETURN 25;\n          END CASE;\n      END CASE;\n    \n    WHEN 'pro' THEN\n      CASE action\n        WHEN 'api' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 50;\n            WHEN 'hour' THEN RETURN 500;\n            WHEN 'day' THEN RETURN 5000;\n            WHEN 'month' THEN RETURN 10000;\n          END CASE;\n        WHEN 'chat' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 20;\n            WHEN 'hour' THEN RETURN 200;\n            WHEN 'day' THEN RETURN 2000;\n            WHEN 'month' THEN RETURN 2000;\n          END CASE;\n        WHEN 'upload' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 10;\n            WHEN 'hour' THEN RETURN 50;\n            WHEN 'day' THEN RETURN 500;\n            WHEN 'month' THEN RETURN 500;\n          END CASE;\n        WHEN 'search' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 30;\n            WHEN 'hour' THEN RETURN 300;\n            WHEN 'day' THEN RETURN 1000;\n            WHEN 'month' THEN RETURN 5000;\n          END CASE;\n        WHEN 'export' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 5;\n            WHEN 'hour' THEN RETURN 25;\n            WHEN 'day' THEN RETURN 100;\n            WHEN 'month' THEN RETURN 200;\n          END CASE;\n        WHEN 'import' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 5;\n            WHEN 'hour' THEN RETURN 25;\n            WHEN 'day' THEN RETURN 100;\n            WHEN 'month' THEN RETURN 500;\n          END CASE;\n      END CASE;\n    \n    WHEN 'pro_byok' THEN\n      CASE action\n        WHEN 'api' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 100;\n            WHEN 'hour' THEN RETURN 1000;\n            WHEN 'day' THEN RETURN 10000;\n            WHEN 'month' THEN RETURN 50000;\n          END CASE;\n        WHEN 'chat' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 50;\n            WHEN 'hour' THEN RETURN 500;\n            WHEN 'day' THEN RETURN 5000;\n            WHEN 'month' THEN RETURN -1; -- Unlimited\n          END CASE;\n        WHEN 'upload' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 20;\n            WHEN 'hour' THEN RETURN 100;\n            WHEN 'day' THEN RETURN 1000;\n            WHEN 'month' THEN RETURN 1000;\n          END CASE;\n        WHEN 'search' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 60;\n            WHEN 'hour' THEN RETURN 600;\n            WHEN 'day' THEN RETURN 2000;\n            WHEN 'month' THEN RETURN 10000;\n          END CASE;\n        WHEN 'export' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 10;\n            WHEN 'hour' THEN RETURN 50;\n            WHEN 'day' THEN RETURN 200;\n            WHEN 'month' THEN RETURN 500;\n          END CASE;\n        WHEN 'import' THEN\n          CASE limit_type\n            WHEN 'minute' THEN RETURN 10;\n            WHEN 'hour' THEN RETURN 50;\n            WHEN 'day' THEN RETURN 200;\n            WHEN 'month' THEN RETURN 1000;\n          END CASE;\n      END CASE;\n  END CASE;\n  \n  -- Default fallback\n  RETURN 10;\nEND;\n$$;\n\n-- Function to get comprehensive rate limit status\nCREATE OR REPLACE FUNCTION get_rate_limit_status(\n  user_id UUID,\n  actions TEXT[] DEFAULT ARRAY['api', 'chat', 'upload', 'search', 'export', 'import'],\n  windows TEXT[] DEFAULT ARRAY['minute', 'hour', 'day', 'month']\n)\nRETURNS JSONB\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  user_record RECORD;\n  action TEXT;\n  window_type TEXT;\n  window_start TIMESTAMPTZ;\n  status_result JSONB := '{}';\n  action_status JSONB;\n  window_status JSONB;\nBEGIN\n  -- Get user info\n  SELECT subscription_tier, subscription_status, email\n  INTO user_record\n  FROM app.users\n  WHERE id = user_id;\n  \n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'User not found: %', user_id;\n  END IF;\n  \n  -- Build status for each action\n  FOREACH action IN ARRAY actions\n  LOOP\n    action_status := '{}';\n    \n    -- Build status for each window\n    FOREACH window_type IN ARRAY windows\n    LOOP\n      -- Calculate window start\n      window_start := get_window_start(window_type);\n      \n      -- Get status for this action/window combination\n      window_status := check_rate_limit(\n        user_id,\n        action,\n        window_type,\n        window_start,\n        0 -- Don't increment, just check\n      );\n      \n      -- Add window info\n      window_status := window_status || jsonb_build_object(\n        'window_start', window_start,\n        'window_end', get_window_end(window_type, window_start)\n      );\n      \n      action_status := action_status || jsonb_build_object(window_type, window_status);\n    END LOOP;\n    \n    status_result := status_result || jsonb_build_object(action, action_status);\n  END LOOP;\n  \n  RETURN jsonb_build_object(\n    'user_id', user_id,\n    'subscription_tier', user_record.subscription_tier,\n    'subscription_status', user_record.subscription_status,\n    'rate_limits', status_result,\n    'checked_at', NOW()\n  );\nEND;\n$$;\n\n-- Function to get window start time\nCREATE OR REPLACE FUNCTION get_window_start(window_type TEXT)\nRETURNS TIMESTAMPTZ\nLANGUAGE plpgsql\nIMMUTABLE\nAS $$\nDECLARE\n  now_ts TIMESTAMPTZ := NOW();\nBEGIN\n  CASE window_type\n    WHEN 'minute' THEN\n      RETURN date_trunc('minute', now_ts);\n    WHEN 'hour' THEN\n      RETURN date_trunc('hour', now_ts);\n    WHEN 'day' THEN\n      RETURN date_trunc('day', now_ts);\n    WHEN 'month' THEN\n      RETURN date_trunc('month', now_ts);\n    ELSE\n      RETURN now_ts;\n  END CASE;\nEND;\n$$;\n\n-- Function to get window end time\nCREATE OR REPLACE FUNCTION get_window_end(window_type TEXT, window_start TIMESTAMPTZ)\nRETURNS TIMESTAMPTZ\nLANGUAGE plpgsql\nIMMUTABLE\nAS $$\nBEGIN\n  CASE window_type\n    WHEN 'minute' THEN\n      RETURN window_start + INTERVAL '1 minute';\n    WHEN 'hour' THEN\n      RETURN window_start + INTERVAL '1 hour';\n    WHEN 'day' THEN\n      RETURN window_start + INTERVAL '1 day';\n    WHEN 'month' THEN\n      RETURN window_start + INTERVAL '1 month';\n    ELSE\n      RETURN window_start + INTERVAL '1 minute';\n  END CASE;\nEND;\n$$;\n\n-- Function to cleanup old rate limit records\nCREATE OR REPLACE FUNCTION cleanup_old_rate_limits()\nRETURNS INTEGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  deleted_count INTEGER;\nBEGIN\n  -- Delete records older than 31 days (keep monthly data)\n  DELETE FROM app.rate_limits\n  WHERE window_start < NOW() - INTERVAL '31 days';\n  \n  GET DIAGNOSTICS deleted_count = ROW_COUNT;\n  \n  -- Log the cleanup\n  INSERT INTO private.audit_logs (\n    action,\n    resource_type,\n    new_values,\n    severity\n  ) VALUES (\n    'RATE_LIMIT_CLEANUP',\n    'rate_limiting',\n    jsonb_build_object(\n      'deleted_count', deleted_count,\n      'cleanup_date', NOW()\n    ),\n    'info'\n  );\n  \n  RETURN deleted_count;\nEND;\n$$;\n\n-- ============================================================================\n-- GRANT PERMISSIONS\n-- ============================================================================\n\n-- Grant execute permissions to appropriate roles\nGRANT EXECUTE ON FUNCTION increment_rate_limit_counter(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO briefly_service;\nGRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO briefly_service, briefly_authenticated;\nGRANT EXECUTE ON FUNCTION get_rate_limit_for_tier_action(TEXT, TEXT, TEXT) TO briefly_service, briefly_authenticated;\nGRANT EXECUTE ON FUNCTION get_rate_limit_status(UUID, TEXT[], TEXT[]) TO briefly_service, briefly_authenticated;\nGRANT EXECUTE ON FUNCTION get_window_start(TEXT) TO briefly_service, briefly_authenticated;\nGRANT EXECUTE ON FUNCTION get_window_end(TEXT, TIMESTAMPTZ) TO briefly_service, briefly_authenticated;\nGRANT EXECUTE ON FUNCTION cleanup_old_rate_limits() TO briefly_service;\n\n-- ============================================================================\n-- INDEXES FOR PERFORMANCE\n-- ============================================================================\n\n-- Indexes for rate limits queries\nCREATE INDEX IF NOT EXISTS idx_rate_limits_user_window \n  ON app.rate_limits(user_id, limit_type, action, window_start DESC);\n\nCREATE INDEX IF NOT EXISTS idx_rate_limits_window_start \n  ON app.rate_limits(window_start DESC);\n\nCREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup \n  ON app.rate_limits(window_start) \n  WHERE window_start < NOW() - INTERVAL '31 days';\n\n-- ============================================================================\n-- LOG COMPLETION\n-- ============================================================================\n\nINSERT INTO private.audit_logs (action, resource_type, new_values, severity)\nVALUES (\n  'RATE_LIMITING_FUNCTIONS_CREATED',\n  'database',\n  jsonb_build_object(\n    'functions_created', ARRAY[\n      'increment_rate_limit_counter',\n      'check_rate_limit',\n      'get_rate_limit_for_tier_action',\n      'get_rate_limit_status',\n      'get_window_start',\n      'get_window_end',\n      'cleanup_old_rate_limits'\n    ],\n    'indexes_created', ARRAY[\n      'idx_rate_limits_user_window',\n      'idx_rate_limits_window_start',\n      'idx_rate_limits_cleanup'\n    ],\n    'completed_at', NOW()\n  ),\n  'info'\n);\n\nCOMMENT ON FUNCTION increment_rate_limit_counter(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) IS 'Atomically increment rate limit counter';\nCOMMENT ON FUNCTION check_rate_limit(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) IS 'Check if action would exceed rate limits';\nCOMMENT ON FUNCTION get_rate_limit_for_tier_action(TEXT, TEXT, TEXT) IS 'Get rate limit for subscription tier and action';\nCOMMENT ON FUNCTION get_rate_limit_status(UUID, TEXT[], TEXT[]) IS 'Get comprehensive rate limit status';\nCOMMENT ON FUNCTION cleanup_old_rate_limits() IS 'Clean up old rate limit records';