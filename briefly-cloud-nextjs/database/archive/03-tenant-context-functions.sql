-- Tenant Context Functions for Multi-Tenant Security
-- These functions manage tenant context for RLS policies and secure operations

-- ============================================================================
-- TENANT CONTEXT MANAGEMENT FUNCTIONS
-- ============================================================================

-- Function to set tenant context for the current session
CREATE OR REPLACE FUNCTION set_tenant(tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Set the tenant ID in the current session
  PERFORM set_config('app.tenant_id', tenant_id::TEXT, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear tenant context
CREATE OR REPLACE FUNCTION clear_tenant()
RETURNS VOID AS $$
BEGIN
  -- Clear the tenant ID from the current session
  PERFORM set_config('app.tenant_id', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current tenant ID
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS UUID AS $$
BEGIN
  -- Get the tenant ID from the current session
  RETURN COALESCE(current_setting('app.tenant_id', true)::UUID, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VECTOR SEARCH FUNCTIONS WITH TENANT ISOLATION
-- ============================================================================

-- Enhanced vector similarity search with tenant isolation
CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding VECTOR(1536),
  user_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for vector search';
  END IF;
  
  RETURN QUERY
  SELECT 
    dc.id,
    dc.file_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM app.document_chunks dc
  WHERE 
    dc.user_id = target_user_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search chunks by file ID with tenant isolation
CREATE OR REPLACE FUNCTION search_chunks_by_file(
  target_file_id UUID,
  user_id UUID DEFAULT NULL,
  limit_count INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for chunk search';
  END IF;
  
  -- Verify user owns the file
  IF NOT EXISTS (
    SELECT 1 FROM app.files f 
    WHERE f.id = target_file_id AND f.user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    dc.chunk_index,
    dc.metadata
  FROM app.document_chunks dc
  WHERE 
    dc.file_id = target_file_id
    AND dc.user_id = target_user_id
  ORDER BY dc.chunk_index
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- SECURE FILE OPERATIONS
-- ============================================================================

-- Function to insert file metadata with tenant context
CREATE OR REPLACE FUNCTION insert_file_metadata(
  file_name TEXT,
  file_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  source TEXT DEFAULT 'upload',
  external_id TEXT DEFAULT NULL,
  external_url TEXT DEFAULT NULL,
  user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
  new_file_id UUID;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for file creation';
  END IF;
  
  -- Insert file metadata
  INSERT INTO app.files (
    user_id,
    name,
    path,
    size,
    mime_type,
    source,
    external_id,
    external_url
  ) VALUES (
    target_user_id,
    file_name,
    file_path,
    file_size,
    mime_type,
    source,
    external_id,
    external_url
  ) RETURNING id INTO new_file_id;
  
  -- Log file creation
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values
  ) VALUES (
    target_user_id,
    'FILE_CREATED',
    'file',
    new_file_id,
    jsonb_build_object(
      'name', file_name,
      'size', file_size,
      'mime_type', mime_type,
      'source', source
    )
  );
  
  RETURN new_file_id;
END;
$$;

-- Function to delete file and all associated data
CREATE OR REPLACE FUNCTION delete_file_cascade(
  file_id UUID,
  user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
  file_record RECORD;
  chunks_deleted INTEGER;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for file deletion';
  END IF;
  
  -- Get file record and verify ownership
  SELECT * INTO file_record
  FROM app.files f
  WHERE f.id = file_id AND f.user_id = target_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  
  -- Delete document chunks first
  DELETE FROM app.document_chunks 
  WHERE file_id = file_id AND user_id = target_user_id;
  
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;
  
  -- Delete file metadata
  DELETE FROM app.files 
  WHERE id = file_id AND user_id = target_user_id;
  
  -- Log file deletion
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values
  ) VALUES (
    target_user_id,
    'FILE_DELETED',
    'file',
    file_id,
    jsonb_build_object(
      'name', file_record.name,
      'size', file_record.size,
      'chunks_deleted', chunks_deleted
    )
  );
  
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- USAGE TRACKING FUNCTIONS
-- ============================================================================

-- Function to log usage with tenant context
CREATE OR REPLACE FUNCTION log_usage(
  action TEXT,
  resource_type TEXT DEFAULT NULL,
  resource_id UUID DEFAULT NULL,
  quantity INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Ensure we have a valid user ID
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No valid user context for usage logging';
  END IF;
  
  -- Insert usage log
  INSERT INTO app.usage_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    quantity,
    metadata
  ) VALUES (
    target_user_id,
    action,
    resource_type,
    resource_id,
    quantity,
    metadata
  );
END;
$$;

-- Function to check usage limits for a user
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
    AND ul.action = action
    AND ul.created_at >= period_start;
  
  -- Determine limit based on action and subscription tier
  CASE action
    WHEN 'chat' THEN
      limit_value := user_record.chat_messages_limit;
    WHEN 'upload' THEN
      limit_value := user_record.documents_limit;
    WHEN 'api_call' THEN
      limit_value := user_record.api_calls_limit;
    ELSE
      limit_value := 1000; -- Default limit
  END CASE;
  
  RETURN jsonb_build_object(
    'action', action,
    'current_usage', usage_count,
    'limit', limit_value,
    'remaining', GREATEST(0, limit_value - usage_count),
    'period_start', period_start,
    'limit_exceeded', usage_count >= limit_value
  );
END;
$$;

-- ============================================================================
-- AUDIT LOGGING FUNCTIONS
-- ============================================================================

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  event_type TEXT,
  resource_type TEXT DEFAULT NULL,
  resource_id UUID DEFAULT NULL,
  event_data JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info',
  user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to current tenant/auth user (can be NULL for system events)
  target_user_id := COALESCE(user_id, get_current_tenant(), auth.uid());
  
  -- Insert audit log
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values,
    severity
  ) VALUES (
    target_user_id,
    'SECURITY_' || event_type,
    resource_type,
    resource_id,
    event_data,
    severity
  );
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions to appropriate roles
GRANT EXECUTE ON FUNCTION set_tenant(UUID) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION clear_tenant() TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION get_current_tenant() TO briefly_service, briefly_authenticated;

GRANT EXECUTE ON FUNCTION search_similar_chunks(VECTOR(1536), UUID, FLOAT, INT) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION search_chunks_by_file(UUID, UUID, INT) TO briefly_service, briefly_authenticated;

GRANT EXECUTE ON FUNCTION insert_file_metadata(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) TO briefly_service;
GRANT EXECUTE ON FUNCTION delete_file_cascade(UUID, UUID) TO briefly_service, briefly_authenticated;

GRANT EXECUTE ON FUNCTION log_usage(TEXT, TEXT, UUID, INTEGER, JSONB, UUID) TO briefly_service;
GRANT EXECUTE ON FUNCTION check_usage_limit(TEXT, UUID, INTEGER) TO briefly_service, briefly_authenticated;

GRANT EXECUTE ON FUNCTION log_security_event(TEXT, TEXT, UUID, JSONB, TEXT, UUID) TO briefly_service;

-- ============================================================================
-- VERIFICATION AND TESTING
-- ============================================================================

-- Function to test tenant isolation
CREATE OR REPLACE FUNCTION test_tenant_isolation()
RETURNS TABLE (
  test_name TEXT,
  result BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Test 1: Tenant context setting
  PERFORM set_tenant('00000000-0000-0000-0000-000000000001'::UUID);
  
  RETURN QUERY SELECT 
    'tenant_context_set'::TEXT,
    get_current_tenant() = '00000000-0000-0000-0000-000000000001'::UUID,
    'Tenant context should be set correctly'::TEXT;
  
  -- Test 2: Tenant context clearing
  PERFORM clear_tenant();
  
  RETURN QUERY SELECT 
    'tenant_context_clear'::TEXT,
    get_current_tenant() = auth.uid(),
    'Tenant context should fall back to auth.uid() after clearing'::TEXT;
  
  -- Test 3: Vector search function exists
  RETURN QUERY SELECT 
    'vector_search_function'::TEXT,
    EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'search_similar_chunks'
    ),
    'Vector search function should exist'::TEXT;
END;
$$;

-- Grant execute permission for testing
GRANT EXECUTE ON FUNCTION test_tenant_isolation() TO briefly_service;

-- Log the completion of tenant context setup
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
  'TENANT_CONTEXT_FUNCTIONS_CREATED',
  'database',
  jsonb_build_object(
    'functions_created', ARRAY[
      'set_tenant', 'clear_tenant', 'get_current_tenant',
      'search_similar_chunks', 'search_chunks_by_file',
      'insert_file_metadata', 'delete_file_cascade',
      'log_usage', 'check_usage_limit', 'log_security_event'
    ],
    'completed_at', NOW()
  ),
  'info'
);

COMMENT ON FUNCTION set_tenant(UUID) IS 'Set tenant context for the current database session';
COMMENT ON FUNCTION clear_tenant() IS 'Clear tenant context from the current database session';
COMMENT ON FUNCTION get_current_tenant() IS 'Get the current tenant ID from session or auth context';
COMMENT ON FUNCTION search_similar_chunks(VECTOR(1536), UUID, FLOAT, INT) IS 'Search for similar document chunks with tenant isolation';
COMMENT ON FUNCTION insert_file_metadata(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) IS 'Securely insert file metadata with audit logging';
COMMENT ON FUNCTION log_usage(TEXT, TEXT, UUID, INTEGER, JSONB, UUID) IS 'Log user actions for usage tracking and analytics';