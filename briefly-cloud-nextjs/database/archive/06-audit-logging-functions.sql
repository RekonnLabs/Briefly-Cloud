-- Audit Logging Functions and Triggers
-- These functions handle automatic audit trail generation and security monitoring

-- ============================================================================
-- AUDIT LOGGING FUNCTIONS
-- ============================================================================

-- Function to get audit statistics
CREATE OR REPLACE FUNCTION get_audit_statistics(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_events INTEGER;
  events_by_action JSONB;
  events_by_severity JSONB;
  events_by_resource_type JSONB;
  top_users JSONB;
  top_ip_addresses JSONB;
BEGIN
  -- Get total events count
  SELECT COUNT(*) INTO total_events
  FROM private.audit_logs
  WHERE created_at >= start_date AND created_at <= end_date;
  
  -- Get events by action
  SELECT COALESCE(jsonb_object_agg(action, event_count), '{}')
  INTO events_by_action
  FROM (
    SELECT action, COUNT(*) as event_count
    FROM private.audit_logs
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY action
    ORDER BY event_count DESC
  ) action_stats;
  
  -- Get events by severity
  SELECT COALESCE(jsonb_object_agg(severity, event_count), '{}')
  INTO events_by_severity
  FROM (
    SELECT severity, COUNT(*) as event_count
    FROM private.audit_logs
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY severity
    ORDER BY event_count DESC
  ) severity_stats;
  
  -- Get events by resource type
  SELECT COALESCE(jsonb_object_agg(resource_type, event_count), '{}')
  INTO events_by_resource_type
  FROM (
    SELECT resource_type, COUNT(*) as event_count
    FROM private.audit_logs
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY resource_type
    ORDER BY event_count DESC
  ) resource_stats;
  
  -- Get top users by event count
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', user_id, 'eventCount', event_count)), '[]')
  INTO top_users
  FROM (
    SELECT user_id, COUNT(*) as event_count
    FROM private.audit_logs
    WHERE created_at >= start_date AND created_at <= end_date
      AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY event_count DESC
    LIMIT 10
  ) user_stats;
  
  -- Get top IP addresses by event count
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ipAddress', ip_address, 'eventCount', event_count)), '[]')
  INTO top_ip_addresses
  FROM (
    SELECT ip_address, COUNT(*) as event_count
    FROM private.audit_logs
    WHERE created_at >= start_date AND created_at <= end_date
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    ORDER BY event_count DESC
    LIMIT 10
  ) ip_stats;
  
  -- Return comprehensive statistics
  RETURN jsonb_build_object(
    'totalEvents', total_events,
    'eventsByAction', events_by_action,
    'eventsBySeverity', events_by_severity,
    'eventsByResourceType', events_by_resource_type,
    'topUsers', top_users,
    'topIpAddresses', top_ip_addresses,
    'periodStart', start_date,
    'periodEnd', end_date
  );
END;
$$;

-- Function to create audit log entry with validation
CREATE OR REPLACE FUNCTION create_audit_log(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_severity TEXT DEFAULT 'info',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  audit_id UUID;
BEGIN
  -- Validate severity
  IF p_severity NOT IN ('info', 'warning', 'error', 'critical') THEN
    RAISE EXCEPTION 'Invalid severity: %. Must be info, warning, error, or critical', p_severity;
  END IF;
  
  -- Insert audit log entry
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    metadata,
    severity,
    ip_address,
    user_agent,
    session_id
  ) VALUES (
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_values,
    p_new_values,
    p_metadata,
    p_severity,
    p_ip_address,
    p_user_agent,
    p_session_id
  ) RETURNING id INTO audit_id;
  
  -- Check for security patterns that need immediate attention
  PERFORM check_security_patterns(audit_id);
  
  RETURN audit_id;
END;
$$;

-- Function to check security patterns and create alerts
CREATE OR REPLACE FUNCTION check_security_patterns(audit_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  audit_record RECORD;
  failed_attempts INTEGER;
  rate_limit_violations INTEGER;
BEGIN
  -- Get the audit record
  SELECT * INTO audit_record
  FROM private.audit_logs
  WHERE id = audit_id;
  
  -- Check for failed login patterns
  IF audit_record.action = 'LOGIN_FAILED' AND audit_record.ip_address IS NOT NULL THEN
    -- Count failed attempts from this IP in the last 15 minutes
    SELECT COUNT(*) INTO failed_attempts
    FROM private.audit_logs
    WHERE action = 'LOGIN_FAILED'
      AND ip_address = audit_record.ip_address
      AND created_at >= NOW() - INTERVAL '15 minutes';
    
    -- Create alert if threshold exceeded
    IF failed_attempts >= 5 THEN
      INSERT INTO private.security_alerts (
        type,
        severity,
        description,
        user_id,
        ip_address,
        metadata,
        resolved
      ) VALUES (
        'FAILED_LOGIN_ATTEMPTS',
        'error',
        format('%s failed login attempts from IP %s in the last 15 minutes', failed_attempts, audit_record.ip_address),
        audit_record.user_id,
        audit_record.ip_address,
        jsonb_build_object(
          'failedAttempts', failed_attempts,
          'timeWindow', '15 minutes',
          'userAgent', audit_record.user_agent
        ),
        false
      );
    END IF;
  END IF;
  
  -- Check for rate limit abuse patterns
  IF audit_record.action = 'RATE_LIMIT_EXCEEDED' THEN
    -- Count rate limit violations from this user/IP in the last hour
    SELECT COUNT(*) INTO rate_limit_violations
    FROM private.audit_logs
    WHERE action = 'RATE_LIMIT_EXCEEDED'
      AND (user_id = audit_record.user_id OR ip_address = audit_record.ip_address)
      AND created_at >= NOW() - INTERVAL '1 hour';
    
    -- Create alert if threshold exceeded
    IF rate_limit_violations >= 10 THEN
      INSERT INTO private.security_alerts (
        type,
        severity,
        description,
        user_id,
        ip_address,
        metadata,
        resolved
      ) VALUES (
        'RATE_LIMIT_ABUSE',
        'warning',
        format('%s rate limit violations in the last hour', rate_limit_violations),
        audit_record.user_id,
        audit_record.ip_address,
        jsonb_build_object(
          'violations', rate_limit_violations,
          'timeWindow', '1 hour'
        ),
        false
      );
    END IF;
  END IF;
  
  -- Check for privilege escalation attempts
  IF audit_record.action = 'ADMIN_ACCESS' AND audit_record.severity = 'warning' THEN
    INSERT INTO private.security_alerts (
      type,
      severity,
      description,
      user_id,
      ip_address,
      metadata,
      resolved
    ) VALUES (
      'PRIVILEGE_ESCALATION',
      'error',
      'Potential privilege escalation attempt detected',
      audit_record.user_id,
      audit_record.ip_address,
      jsonb_build_object(
        'action', audit_record.action,
        'resourceType', audit_record.resource_type,
        'metadata', audit_record.metadata
      ),
      false
    );
  END IF;
END;
$$;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_audit_logs(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
  cutoff_date TIMESTAMPTZ;
BEGIN
  cutoff_date := NOW() - INTERVAL '1 day' * retention_days;
  
  -- Delete old audit logs
  DELETE FROM private.audit_logs
  WHERE created_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    metadata,
    severity
  ) VALUES (
    'AUDIT_CLEANUP',
    'system',
    jsonb_build_object(
      'deletedCount', deleted_count,
      'retentionDays', retention_days,
      'cutoffDate', cutoff_date
    ),
    'info'
  );
  
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- AUDIT TRIGGERS FOR AUTOMATIC LOGGING
-- ============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  audit_action TEXT;
  old_values JSONB;
  new_values JSONB;
  resource_type TEXT;
  resource_id TEXT;
  user_id UUID;
BEGIN
  -- Determine action based on operation
  CASE TG_OP
    WHEN 'INSERT' THEN
      audit_action := TG_TABLE_NAME || '_CREATED';
      old_values := NULL;
      new_values := to_jsonb(NEW);
      resource_id := COALESCE(NEW.id::TEXT, NEW.user_id::TEXT);
      user_id := COALESCE(NEW.user_id, NEW.created_by);
    WHEN 'UPDATE' THEN
      audit_action := TG_TABLE_NAME || '_UPDATED';
      old_values := to_jsonb(OLD);
      new_values := to_jsonb(NEW);
      resource_id := COALESCE(NEW.id::TEXT, NEW.user_id::TEXT);
      user_id := COALESCE(NEW.user_id, NEW.updated_by, OLD.user_id);
    WHEN 'DELETE' THEN
      audit_action := TG_TABLE_NAME || '_DELETED';
      old_values := to_jsonb(OLD);
      new_values := NULL;
      resource_id := COALESCE(OLD.id::TEXT, OLD.user_id::TEXT);
      user_id := COALESCE(OLD.user_id, OLD.created_by);
  END CASE;
  
  -- Determine resource type from table name
  resource_type := CASE TG_TABLE_NAME
    WHEN 'users' THEN 'user'
    WHEN 'files' THEN 'document'
    WHEN 'conversations' THEN 'conversation'
    WHEN 'chat_messages' THEN 'conversation'
    WHEN 'document_chunks' THEN 'document'
    ELSE 'system'
  END;
  
  -- Insert audit log (ignore errors to prevent blocking main operations)
  BEGIN
    INSERT INTO private.audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      old_values,
      new_values,
      severity
    ) VALUES (
      user_id,
      audit_action,
      resource_type,
      resource_id,
      old_values,
      new_values,
      'info'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE WARNING 'Failed to create audit log: %', SQLERRM;
  END;
  
  -- Return appropriate record
  CASE TG_OP
    WHEN 'DELETE' THEN RETURN OLD;
    ELSE RETURN NEW;
  END CASE;
END;
$$;

-- Create audit triggers for sensitive tables
CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON app.users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_files_trigger
  AFTER INSERT OR UPDATE OR DELETE ON app.files
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_conversations_trigger
  AFTER INSERT OR UPDATE OR DELETE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_chat_messages_trigger
  AFTER INSERT OR UPDATE OR DELETE ON app.chat_messages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Special trigger for OAuth tokens (more sensitive)
CREATE OR REPLACE FUNCTION audit_oauth_tokens_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN
      INSERT INTO private.audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        severity
      ) VALUES (
        NEW.user_id,
        'OAUTH_TOKEN_CREATED',
        'authentication',
        NEW.id::TEXT,
        jsonb_build_object(
          'provider', NEW.provider,
          'scope', NEW.scope,
          'created_at', NEW.created_at
        ),
        'warning'
      );
      RETURN NEW;
    WHEN 'UPDATE' THEN
      INSERT INTO private.audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        severity
      ) VALUES (
        NEW.user_id,
        'OAUTH_TOKEN_UPDATED',
        'authentication',
        NEW.id::TEXT,
        jsonb_build_object(
          'provider', OLD.provider,
          'updated_at', OLD.updated_at
        ),
        jsonb_build_object(
          'provider', NEW.provider,
          'updated_at', NEW.updated_at
        ),
        'warning'
      );
      RETURN NEW;
    WHEN 'DELETE' THEN
      INSERT INTO private.audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        severity
      ) VALUES (
        OLD.user_id,
        'OAUTH_TOKEN_DELETED',
        'authentication',
        OLD.id::TEXT,
        jsonb_build_object(
          'provider', OLD.provider,
          'deleted_at', NOW()
        ),
        'warning'
      );
      RETURN OLD;
  END CASE;
END;
$$;

CREATE TRIGGER audit_oauth_tokens_trigger
  AFTER INSERT OR UPDATE OR DELETE ON private.oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION audit_oauth_tokens_trigger();

-- ============================================================================
-- SECURITY MONITORING FUNCTIONS
-- ============================================================================

-- Function to get recent security events
CREATE OR REPLACE FUNCTION get_recent_security_events(
  hours_back INTEGER DEFAULT 24,
  severity_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  action TEXT,
  severity TEXT,
  user_id UUID,
  ip_address TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.id,
    al.action,
    al.severity,
    al.user_id,
    al.ip_address,
    al.created_at,
    al.metadata
  FROM private.audit_logs al
  WHERE al.created_at >= NOW() - INTERVAL '1 hour' * hours_back
    AND (severity_filter IS NULL OR al.severity = severity_filter)
    AND al.severity IN ('warning', 'error', 'critical')
  ORDER BY al.created_at DESC;
END;
$$;

-- Function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
  p_user_id UUID,
  days_back INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  activity_summary JSONB;
  total_actions INTEGER;
  actions_by_type JSONB;
  recent_actions JSONB;
BEGIN
  -- Get total actions count
  SELECT COUNT(*) INTO total_actions
  FROM private.audit_logs
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '1 day' * days_back;
  
  -- Get actions by type
  SELECT COALESCE(jsonb_object_agg(action, action_count), '{}')
  INTO actions_by_type
  FROM (
    SELECT action, COUNT(*) as action_count
    FROM private.audit_logs
    WHERE user_id = p_user_id
      AND created_at >= NOW() - INTERVAL '1 day' * days_back
    GROUP BY action
    ORDER BY action_count DESC
  ) action_stats;
  
  -- Get recent actions
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'action', action,
      'resourceType', resource_type,
      'severity', severity,
      'createdAt', created_at,
      'ipAddress', ip_address
    ) ORDER BY created_at DESC
  ), '[]')
  INTO recent_actions
  FROM (
    SELECT action, resource_type, severity, created_at, ip_address
    FROM private.audit_logs
    WHERE user_id = p_user_id
      AND created_at >= NOW() - INTERVAL '1 day' * days_back
    ORDER BY created_at DESC
    LIMIT 20
  ) recent;
  
  -- Build summary
  activity_summary := jsonb_build_object(
    'userId', p_user_id,
    'periodDays', days_back,
    'totalActions', total_actions,
    'actionsByType', actions_by_type,
    'recentActions', recent_actions,
    'generatedAt', NOW()
  );
  
  RETURN activity_summary;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions to appropriate roles
GRANT EXECUTE ON FUNCTION get_audit_statistics(TIMESTAMPTZ, TIMESTAMPTZ) TO briefly_service;
GRANT EXECUTE ON FUNCTION create_audit_log(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT) TO briefly_service;
GRANT EXECUTE ON FUNCTION check_security_patterns(UUID) TO briefly_service;
GRANT EXECUTE ON FUNCTION cleanup_audit_logs(INTEGER) TO briefly_service;
GRANT EXECUTE ON FUNCTION get_recent_security_events(INTEGER, TEXT) TO briefly_service;
GRANT EXECUTE ON FUNCTION get_user_activity_summary(UUID, INTEGER) TO briefly_service;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for audit logs queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created_at 
  ON private.audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at 
  ON private.audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_created_at 
  ON private.audit_logs(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address_created_at 
  ON private.audit_logs(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_created_at 
  ON private.audit_logs(resource_type, created_at DESC);

-- Indexes for security alerts
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved_created_at 
  ON private.security_alerts(resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_alerts_severity_created_at 
  ON private.security_alerts(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_alerts_type_created_at 
  ON private.security_alerts(type, created_at DESC);

-- ============================================================================
-- LOG COMPLETION
-- ============================================================================

INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
  'AUDIT_SYSTEM_INITIALIZED',
  'system',
  jsonb_build_object(
    'functions_created', ARRAY[
      'get_audit_statistics',
      'create_audit_log',
      'check_security_patterns',
      'cleanup_audit_logs',
      'get_recent_security_events',
      'get_user_activity_summary'
    ],
    'triggers_created', ARRAY[
      'audit_users_trigger',
      'audit_files_trigger',
      'audit_conversations_trigger',
      'audit_chat_messages_trigger',
      'audit_oauth_tokens_trigger'
    ],
    'indexes_created', ARRAY[
      'idx_audit_logs_user_id_created_at',
      'idx_audit_logs_action_created_at',
      'idx_audit_logs_severity_created_at',
      'idx_audit_logs_ip_address_created_at',
      'idx_audit_logs_resource_type_created_at',
      'idx_security_alerts_resolved_created_at',
      'idx_security_alerts_severity_created_at',
      'idx_security_alerts_type_created_at'
    ],
    'completed_at', NOW()
  ),
  'info'
);

COMMENT ON FUNCTION get_audit_statistics(TIMESTAMPTZ, TIMESTAMPTZ) IS 'Get comprehensive audit statistics for a time period';
COMMENT ON FUNCTION create_audit_log(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT) IS 'Create audit log entry with validation and security pattern checking';
COMMENT ON FUNCTION check_security_patterns(UUID) IS 'Check audit entry for security patterns and create alerts';
COMMENT ON FUNCTION cleanup_audit_logs(INTEGER) IS 'Clean up old audit logs based on retention policy';
COMMENT ON FUNCTION get_recent_security_events(INTEGER, TEXT) IS 'Get recent security events for monitoring';
COMMENT ON FUNCTION get_user_activity_summary(UUID, INTEGER) IS 'Get comprehensive user activity summary';