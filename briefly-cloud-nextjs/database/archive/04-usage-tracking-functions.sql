-- Usage Tracking and Rate Limiting Database Functions
-- These functions support the comprehensive usage tracking and rate limiting system

-- ============================================================================
-- USAGE TRACKING FUNCTIONS
-- ============================================================================

-- Function to increment usage counters atomically
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_event_type TEXT,
  p_resource_count INTEGER DEFAULT 1,
  p_event_data JSONB DEFAULT '{}'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Get user record with row lock to prevent race conditions
  SELECT * INTO user_record
  FROM app.users
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
  
  -- Update counters based on event type
  CASE p_event_type
    WHEN 'document_upload' THEN
      UPDATE app.users
      SET 
        documents_uploaded = COALESCE(documents_uploaded, 0) + p_resource_count,
        updated_at = NOW()
      WHERE id = p_user_id;
      
    WHEN 'chat_message' THEN
      UPDATE app.users
      SET 
        chat_messages_count = COALESCE(chat_messages_count, 0) + p_resource_count,
        updated_at = NOW()
      WHERE id = p_user_id;
      
    WHEN 'api_call' THEN
      UPDATE app.users
      SET 
        api_calls_count = COALESCE(api_calls_count, 0) + p_resource_count,
        updated_at = NOW()
      WHERE id = p_user_id;
      
    ELSE
      -- For other event types, just log without updating counters
      NULL;
  END CASE;
  
  -- Log the usage event
  INSERT INTO app.usage_logs (
    user_id,
    action,
    resource_type,
    quantity,
    metadata
  ) VALUES (
    p_user_id,
    p_event_type,
    'usage_counter',
    p_resource_count,
    p_event_data
  );
  
  RETURN TRUE;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    INSERT INTO private.audit_logs (
      user_id,
      action,
      resource_type,
      new_values,
      severity
    ) VALUES (
      p_user_id,
      'USAGE_INCREMENT_ERROR',
      'usage_tracker',
      jsonb_build_object(
        'event_type', p_event_type,
        'resource_count', p_resource_count,
        'error_message', SQLERRM
      ),
      'error'
    );
    
    RETURN FALSE;
END;
$$;

-- Function to check usage limits with detailed response
CREATE OR REPLACE FUNCTION check_usage_limit(
  action TEXT,
  user_id UUID DEFAULT NULL,
  period_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
  user_record RECORD;
  usage_count INTEGER;
  limit_value INTEGER;
  period_start TIMESTAMPTZ;
  tier_limits JSONB;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for usage check';
  END IF;
  
  -- Get user subscription info
  SELECT * INTO user_record
  FROM app.users u
  WHERE u.id = target_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Calculate period start
  period_start := NOW() - INTERVAL '1 day' * period_days;
  
  -- Get usage count for the period
  SELECT COALESCE(SUM(quantity), 0) INTO usage_count
  FROM app.usage_logs ul
  WHERE ul.user_id = target_user_id
    AND ul.action = check_usage_limit.action
    AND ul.created_at >= period_start;
  
  -- Determine limit based on action and subscription tier
  CASE check_usage_limit.action
    WHEN 'chat_message' THEN
      limit_value := COALESCE(user_record.chat_messages_limit, 100);
    WHEN 'document_upload' THEN
      limit_value := COALESCE(user_record.documents_limit, 25);
    WHEN 'api_call' THEN
      limit_value := COALESCE(user_record.api_calls_limit, 1000);
    WHEN 'vector_search' THEN
      -- Dynamic limit based on tier
      CASE user_record.subscription_tier
        WHEN 'free' THEN limit_value := 500;
        WHEN 'pro' THEN limit_value := 2000;
        WHEN 'pro_byok' THEN limit_value := 10000;
        ELSE limit_value := 500;
      END CASE;
    WHEN 'embedding_generation' THEN
      -- Dynamic limit based on tier
      CASE user_record.subscription_tier
        WHEN 'free' THEN limit_value := 100;
        WHEN 'pro' THEN limit_value := 400;
        WHEN 'pro_byok' THEN limit_value := 2000;
        ELSE limit_value := 100;
      END CASE;
    ELSE
      limit_value := 1000; -- Default limit
  END CASE;
  
  RETURN jsonb_build_object(
    'action', check_usage_limit.action,
    'current_usage', usage_count,
    'limit', limit_value,
    'remaining', GREATEST(0, limit_value - usage_count),
    'period_start', period_start,
    'period_days', period_days,
    'limit_exceeded', usage_count >= limit_value,
    'subscription_tier', user_record.subscription_tier
  );
END;
$$;

-- Function to reset monthly usage counters
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  -- Reset usage counters for all users
  UPDATE app.users
  SET 
    chat_messages_count = 0,
    documents_uploaded = 0,
    api_calls_count = 0,
    usage_reset_date = NOW() + INTERVAL '1 month',
    updated_at = NOW()
  WHERE usage_reset_date <= NOW();
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  -- Log the reset operation
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    new_values,
    severity
  ) VALUES (
    'MONTHLY_USAGE_RESET',
    'usage_tracker',
    jsonb_build_object(
      'users_reset', reset_count,
      'reset_date', NOW()
    ),
    'info'
  );
  
  RETURN reset_count;
END;
$$;

-- ============================================================================
-- RATE LIMITING FUNCTIONS
-- ============================================================================

-- Function to increment rate limit counter atomically
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id UUID,
  p_limit_type TEXT,
  p_action TEXT,
  p_window_start TIMESTAMPTZ,
  p_increment INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to update existing record
  UPDATE app.rate_limits
  SET 
    count = count + p_increment,
    created_at = GREATEST(created_at, NOW())
  WHERE 
    user_id = p_user_id
    AND limit_type = p_limit_type
    AND action = p_action
    AND window_start = p_window_start;
  
  -- If no record was updated, insert new one
  IF NOT FOUND THEN
    INSERT INTO app.rate_limits (
      user_id,
      limit_type,
      action,
      count,
      window_start
    ) VALUES (
      p_user_id,
      p_limit_type,
      p_action,
      p_increment,
      p_window_start
    )
    ON CONFLICT (user_id, limit_type, action, window_start)
    DO UPDATE SET count = app.rate_limits.count + p_increment;
  END IF;
  
  RETURN TRUE;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail
    INSERT INTO private.audit_logs (
      user_id,
      action,
      resource_type,
      new_values,
      severity
    ) VALUES (
      p_user_id,
      'RATE_LIMIT_INCREMENT_ERROR',
      'rate_limiter',
      jsonb_build_object(
        'limit_type', p_limit_type,
        'action', p_action,
        'increment', p_increment,
        'error_message', SQLERRM
      ),
      'error'
    );
    
    RETURN FALSE;
END;
$$;

-- Function to get rate limit status for a user
CREATE OR REPLACE FUNCTION get_rate_limit_status(
  p_user_id UUID,
  p_action TEXT,
  p_limit_type TEXT,
  p_window_start TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
  tier_limit INTEGER;
  user_tier TEXT;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO user_tier
  FROM app.users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    user_tier := 'free';
  END IF;
  
  -- Get current count
  SELECT COALESCE(count, 0) INTO current_count
  FROM app.rate_limits
  WHERE 
    user_id = p_user_id
    AND limit_type = p_limit_type
    AND action = p_action
    AND window_start = p_window_start;
  
  -- Determine tier-based limit
  -- This is a simplified version - in practice, you'd have a more sophisticated lookup
  CASE p_limit_type
    WHEN 'minute' THEN
      CASE user_tier
        WHEN 'free' THEN tier_limit := 10;
        WHEN 'pro' THEN tier_limit := 30;
        WHEN 'pro_byok' THEN tier_limit := 100;
        ELSE tier_limit := 10;
      END CASE;
    WHEN 'hour' THEN
      CASE user_tier
        WHEN 'free' THEN tier_limit := 100;
        WHEN 'pro' THEN tier_limit := 500;
        WHEN 'pro_byok' THEN tier_limit := 2000;
        ELSE tier_limit := 100;
      END CASE;
    WHEN 'day' THEN
      CASE user_tier
        WHEN 'free' THEN tier_limit := 1000;
        WHEN 'pro' THEN tier_limit := 5000;
        WHEN 'pro_byok' THEN tier_limit := 20000;
        ELSE tier_limit := 1000;
      END CASE;
    ELSE
      tier_limit := 10; -- Default
  END CASE;
  
  RETURN jsonb_build_object(
    'action', p_action,
    'limit_type', p_limit_type,
    'current_count', current_count,
    'limit', tier_limit,
    'remaining', GREATEST(0, tier_limit - current_count),
    'window_start', p_window_start,
    'user_tier', user_tier
  );
END;
$$;

-- Function to cleanup old rate limit records
CREATE OR REPLACE FUNCTION cleanup_rate_limits(
  older_than_hours INTEGER DEFAULT 24
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
  cutoff_time TIMESTAMPTZ;
BEGIN
  cutoff_time := NOW() - INTERVAL '1 hour' * older_than_hours;
  
  DELETE FROM app.rate_limits
  WHERE window_start < cutoff_time;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup operation
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    new_values,
    severity
  ) VALUES (
    'RATE_LIMIT_CLEANUP',
    'rate_limiter',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'cutoff_time', cutoff_time,
      'older_than_hours', older_than_hours
    ),
    'info'
  );
  
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- ANALYTICS FUNCTIONS
-- ============================================================================

-- Function to get usage analytics
CREATE OR REPLACE FUNCTION get_usage_analytics(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  group_by TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period TEXT,
  total_actions INTEGER,
  unique_users INTEGER,
  action_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH usage_data AS (
    SELECT 
      CASE 
        WHEN group_by = 'hour' THEN 
          to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00')
        WHEN group_by = 'day' THEN 
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD')
        WHEN group_by = 'week' THEN 
          to_char(date_trunc('week', created_at), 'YYYY-"W"WW')
        ELSE 
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD')
      END as period_key,
      action,
      user_id,
      quantity
    FROM app.usage_logs
    WHERE created_at >= start_date 
      AND created_at <= end_date
  ),
  aggregated AS (
    SELECT 
      period_key,
      COUNT(*) as total_actions,
      COUNT(DISTINCT user_id) as unique_users,
      jsonb_object_agg(
        action, 
        action_count
      ) as action_breakdown
    FROM (
      SELECT 
        period_key,
        user_id,
        action,
        SUM(quantity) as action_count
      FROM usage_data
      GROUP BY period_key, user_id, action
    ) action_totals
    GROUP BY period_key
  )
  SELECT 
    a.period_key::TEXT,
    a.total_actions::INTEGER,
    a.unique_users::INTEGER,
    a.action_breakdown
  FROM aggregated a
  ORDER BY a.period_key;
END;
$$;

-- Function to get user tier distribution
CREATE OR REPLACE FUNCTION get_tier_distribution()
RETURNS TABLE (
  subscription_tier TEXT,
  user_count INTEGER,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH tier_counts AS (
    SELECT 
      COALESCE(u.subscription_tier, 'free') as tier,
      COUNT(*) as count
    FROM app.users u
    WHERE u.deleted_at IS NULL
    GROUP BY u.subscription_tier
  ),
  total_users AS (
    SELECT SUM(count) as total FROM tier_counts
  )
  SELECT 
    tc.tier::TEXT,
    tc.count::INTEGER,
    ROUND((tc.count::NUMERIC / tu.total::NUMERIC) * 100, 2) as percentage
  FROM tier_counts tc
  CROSS JOIN total_users tu
  ORDER BY tc.count DESC;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions to appropriate roles
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER, JSONB) TO briefly_service;
GRANT EXECUTE ON FUNCTION check_usage_limit(TEXT, UUID, INTEGER) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION reset_monthly_usage() TO briefly_service;

GRANT EXECUTE ON FUNCTION increment_rate_limit(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO briefly_service;
GRANT EXECUTE ON FUNCTION get_rate_limit_status(UUID, TEXT, TEXT, TIMESTAMPTZ) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits(INTEGER) TO briefly_service;

GRANT EXECUTE ON FUNCTION get_usage_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO briefly_service;
GRANT EXECUTE ON FUNCTION get_tier_distribution() TO briefly_service;

-- ============================================================================
-- SCHEDULED JOBS SETUP
-- ============================================================================

-- Note: These would typically be set up as cron jobs or scheduled tasks
-- Example cron job entries (to be configured in your deployment):

-- Clean up old rate limit records daily at 2 AM
-- 0 2 * * * SELECT cleanup_rate_limits(24);

-- Reset monthly usage on the 1st of each month at 1 AM
-- 0 1 1 * * SELECT reset_monthly_usage();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional indexes for usage tracking performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action_date 
ON app.usage_logs(user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_action_date 
ON app.usage_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_window 
ON app.rate_limits(user_id, limit_type, action, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup 
ON app.rate_limits(window_start) WHERE window_start < NOW() - INTERVAL '1 day';

-- ============================================================================
-- COMPLETION LOG
-- ============================================================================

-- Log the completion of usage tracking setup
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
  'USAGE_TRACKING_FUNCTIONS_CREATED',
  'database',
  jsonb_build_object(
    'functions_created', ARRAY[
      'increment_usage', 'check_usage_limit', 'reset_monthly_usage',
      'increment_rate_limit', 'get_rate_limit_status', 'cleanup_rate_limits',
      'get_usage_analytics', 'get_tier_distribution'
    ],
    'indexes_created', ARRAY[
      'idx_usage_logs_user_action_date', 'idx_usage_logs_action_date',
      'idx_rate_limits_user_window', 'idx_rate_limits_cleanup'
    ],
    'completed_at', NOW()
  ),
  'info'
);

COMMENT ON FUNCTION increment_usage(UUID, TEXT, INTEGER, JSONB) IS 'Atomically increment usage counters and log usage events';
COMMENT ON FUNCTION check_usage_limit(TEXT, UUID, INTEGER) IS 'Check usage limits against subscription tier with detailed response';
COMMENT ON FUNCTION increment_rate_limit(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER) IS 'Atomically increment rate limit counters with conflict resolution';
COMMENT ON FUNCTION get_usage_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS 'Generate usage analytics with flexible grouping options';