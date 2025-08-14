-- Supabase Storage Security Policies
-- These policies ensure secure file access with proper tenant isolation

-- ============================================================================
-- STORAGE BUCKET CONFIGURATION
-- ============================================================================

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'user-documents', 
    'user-documents', 
    false, 
    104857600, -- 100MB limit
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
  ),
  (
    'user-exports', 
    'user-exports', 
    false, 
    52428800, -- 50MB limit for exports
    ARRAY['application/json', 'text/csv', 'application/zip']
  ),
  (
    'system-backups', 
    'system-backups', 
    false, 
    1073741824, -- 1GB limit for backups
    ARRAY['application/zip', 'application/gzip', 'application/x-tar']
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE SECURITY POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can access all documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload exports" ON storage.objects;
DROP POLICY IF EXISTS "Users can download their exports" ON storage.objects;
DROP POLICY IF EXISTS "System can manage backups" ON storage.objects;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USER DOCUMENTS BUCKET POLICIES
-- ============================================================================

-- Policy: Users can upload their own documents
CREATE POLICY "Users can upload their own documents" ON storage.objects
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can view their own documents
CREATE POLICY "Users can view their own documents" ON storage.objects
  FOR SELECT 
  TO authenticated
  USING (
    bucket_id = 'user-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can update their own documents metadata
CREATE POLICY "Users can update their own documents" ON storage.objects
  FOR UPDATE 
  TO authenticated
  USING (
    bucket_id = 'user-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'user-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own documents" ON storage.objects
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'user-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- ============================================================================
-- USER EXPORTS BUCKET POLICIES
-- ============================================================================

-- Policy: Users can upload to exports bucket
CREATE POLICY "Users can upload exports" ON storage.objects
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-exports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can download their exports
CREATE POLICY "Users can download their exports" ON storage.objects
  FOR SELECT 
  TO authenticated
  USING (
    bucket_id = 'user-exports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can delete their exports
CREATE POLICY "Users can delete their exports" ON storage.objects
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'user-exports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'
  );

-- ============================================================================
-- ADMIN ACCESS POLICIES
-- ============================================================================

-- Policy: Admins can access all documents (for support/compliance)
CREATE POLICY "Admins can access all documents" ON storage.objects
  FOR ALL 
  TO authenticated
  USING (
    -- Check if user is admin (RekonnLabs employee)
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    -- Check if user is admin (RekonnLabs employee)
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
      AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- SYSTEM BACKUP POLICIES
-- ============================================================================

-- Policy: System service can manage backups
CREATE POLICY "System can manage backups" ON storage.objects
  FOR ALL 
  TO service_role
  USING (bucket_id = 'system-backups')
  WITH CHECK (bucket_id = 'system-backups');

-- ============================================================================
-- STORAGE HELPER FUNCTIONS
-- ============================================================================

-- Function to generate secure file paths
CREATE OR REPLACE FUNCTION generate_secure_file_path(
  user_id UUID,
  file_name TEXT,
  file_type TEXT DEFAULT 'document'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sanitized_name TEXT;
  timestamp_str TEXT;
  random_suffix TEXT;
  file_path TEXT;
BEGIN
  -- Sanitize filename (remove special characters, limit length)
  sanitized_name := regexp_replace(
    substring(file_name from 1 for 100), 
    '[^a-zA-Z0-9._-]', 
    '_', 
    'g'
  );
  
  -- Generate timestamp
  timestamp_str := to_char(NOW(), 'YYYY/MM/DD');
  
  -- Generate random suffix for uniqueness
  random_suffix := substring(gen_random_uuid()::text from 1 for 8);
  
  -- Construct secure path: user_id/type/date/filename_suffix
  file_path := format(
    '%s/%s/%s/%s_%s',
    user_id,
    file_type,
    timestamp_str,
    sanitized_name,
    random_suffix
  );
  
  RETURN file_path;
END;
$$;

-- Function to validate file access permissions
CREATE OR REPLACE FUNCTION validate_file_access(
  file_path TEXT,
  user_id UUID,
  access_type TEXT DEFAULT 'read'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  path_user_id TEXT;
  is_admin BOOLEAN;
BEGIN
  -- Extract user ID from file path
  path_user_id := split_part(file_path, '/', 1);
  
  -- Check if requesting user owns the file
  IF path_user_id = user_id::text THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM app.users 
    WHERE id = user_id 
    AND email LIKE '%@rekonnlabs.com'
    AND deleted_at IS NULL
  ) INTO is_admin;
  
  -- Admins can access all files
  IF is_admin THEN
    RETURN TRUE;
  END IF;
  
  -- Default deny
  RETURN FALSE;
END;
$$;

-- Function to log file access events
CREATE OR REPLACE FUNCTION log_file_access(
  user_id UUID,
  file_path TEXT,
  access_type TEXT,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log to audit table
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    severity,
    ip_address,
    user_agent
  ) VALUES (
    user_id,
    CASE access_type
      WHEN 'upload' THEN 'DOCUMENT_UPLOADED'
      WHEN 'download' THEN 'DOCUMENT_ACCESSED'
      WHEN 'delete' THEN 'DOCUMENT_DELETED'
      ELSE 'DOCUMENT_ACCESSED'
    END,
    'document',
    file_path,
    jsonb_build_object(
      'file_path', file_path,
      'access_type', access_type,
      'timestamp', NOW()
    ),
    'info',
    ip_address,
    user_agent
  );
END;
$$;

-- Function to clean up expired temporary files
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
  file_record RECORD;
BEGIN
  -- Clean up exports older than 7 days
  FOR file_record IN
    SELECT name FROM storage.objects
    WHERE bucket_id = 'user-exports'
    AND created_at < NOW() - INTERVAL '7 days'
  LOOP
    -- Delete from storage
    DELETE FROM storage.objects 
    WHERE bucket_id = 'user-exports' AND name = file_record.name;
    
    deleted_count := deleted_count + 1;
  END LOOP;
  
  -- Log cleanup activity
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    metadata,
    severity
  ) VALUES (
    'SYSTEM_ERROR', -- Using existing action type
    'system',
    jsonb_build_object(
      'cleanup_type', 'expired_files',
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    ),
    'info'
  );
  
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- STORAGE MONITORING FUNCTIONS
-- ============================================================================

-- Function to get user storage usage
CREATE OR REPLACE FUNCTION get_user_storage_usage(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  usage_stats JSONB;
  total_size BIGINT;
  file_count INTEGER;
  bucket_breakdown JSONB;
BEGIN
  -- Get total size and count
  SELECT 
    COALESCE(SUM(metadata->>'size')::BIGINT, 0),
    COUNT(*)
  INTO total_size, file_count
  FROM storage.objects
  WHERE (storage.foldername(name))[1] = p_user_id::text;
  
  -- Get breakdown by bucket
  SELECT COALESCE(jsonb_object_agg(bucket_id, bucket_stats), '{}')
  INTO bucket_breakdown
  FROM (
    SELECT 
      bucket_id,
      jsonb_build_object(
        'file_count', COUNT(*),
        'total_size', COALESCE(SUM(metadata->>'size')::BIGINT, 0),
        'avg_size', COALESCE(AVG(metadata->>'size')::BIGINT, 0)
      ) as bucket_stats
    FROM storage.objects
    WHERE (storage.foldername(name))[1] = p_user_id::text
    GROUP BY bucket_id
  ) bucket_data;
  
  -- Build usage stats
  usage_stats := jsonb_build_object(
    'user_id', p_user_id,
    'total_size_bytes', total_size,
    'total_files', file_count,
    'bucket_breakdown', bucket_breakdown,
    'calculated_at', NOW()
  );
  
  RETURN usage_stats;
END;
$$;

-- Function to get storage analytics (admin only)
CREATE OR REPLACE FUNCTION get_storage_analytics(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  analytics JSONB;
  total_files INTEGER;
  total_size BIGINT;
  active_users INTEGER;
BEGIN
  -- Get overall statistics
  SELECT 
    COUNT(*),
    COALESCE(SUM(metadata->>'size')::BIGINT, 0)
  INTO total_files, total_size
  FROM storage.objects
  WHERE created_at >= start_date AND created_at <= end_date;
  
  -- Get active users count
  SELECT COUNT(DISTINCT (storage.foldername(name))[1])
  INTO active_users
  FROM storage.objects
  WHERE created_at >= start_date AND created_at <= end_date;
  
  -- Build analytics
  analytics := jsonb_build_object(
    'period', jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date
    ),
    'totals', jsonb_build_object(
      'files', total_files,
      'size_bytes', total_size,
      'active_users', active_users
    ),
    'bucket_breakdown', (
      SELECT COALESCE(jsonb_object_agg(bucket_id, bucket_stats), '{}')
      FROM (
        SELECT 
          bucket_id,
          jsonb_build_object(
            'file_count', COUNT(*),
            'total_size', COALESCE(SUM(metadata->>'size')::BIGINT, 0)
          ) as bucket_stats
        FROM storage.objects
        WHERE created_at >= start_date AND created_at <= end_date
        GROUP BY bucket_id
      ) bucket_data
    ),
    'generated_at', NOW()
  );
  
  RETURN analytics;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions to appropriate roles
GRANT EXECUTE ON FUNCTION generate_secure_file_path(UUID, TEXT, TEXT) TO authenticated, briefly_service;
GRANT EXECUTE ON FUNCTION validate_file_access(TEXT, UUID, TEXT) TO authenticated, briefly_service;
GRANT EXECUTE ON FUNCTION log_file_access(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, briefly_service;
GRANT EXECUTE ON FUNCTION cleanup_expired_files() TO briefly_service;
GRANT EXECUTE ON FUNCTION get_user_storage_usage(UUID) TO authenticated, briefly_service;
GRANT EXECUTE ON FUNCTION get_storage_analytics(TIMESTAMPTZ, TIMESTAMPTZ) TO briefly_service;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for storage objects queries (if not already exist)
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_owner 
  ON storage.objects(bucket_id, (storage.foldername(name))[1]);

CREATE INDEX IF NOT EXISTS idx_storage_objects_created_at 
  ON storage.objects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storage_objects_size 
  ON storage.objects((metadata->>'size')::BIGINT) 
  WHERE metadata->>'size' IS NOT NULL;

-- ============================================================================
-- LOG COMPLETION
-- ============================================================================

INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
  'STORAGE_SECURITY_CONFIGURED',
  'system',
  jsonb_build_object(
    'buckets_configured', ARRAY['user-documents', 'user-exports', 'system-backups'],
    'policies_created', ARRAY[
      'Users can upload their own documents',
      'Users can view their own documents', 
      'Users can update their own documents',
      'Users can delete their own documents',
      'Admins can access all documents',
      'Users can upload exports',
      'Users can download their exports',
      'Users can delete their exports',
      'System can manage backups'
    ],
    'functions_created', ARRAY[
      'generate_secure_file_path',
      'validate_file_access',
      'log_file_access',
      'cleanup_expired_files',
      'get_user_storage_usage',
      'get_storage_analytics'
    ],
    'completed_at', NOW()
  ),
  'info'
);

COMMENT ON FUNCTION generate_secure_file_path(UUID, TEXT, TEXT) IS 'Generate secure file paths with user isolation';
COMMENT ON FUNCTION validate_file_access(TEXT, UUID, TEXT) IS 'Validate user access permissions for files';
COMMENT ON FUNCTION log_file_access(UUID, TEXT, TEXT, TEXT, TEXT) IS 'Log file access events for audit trail';
COMMENT ON FUNCTION cleanup_expired_files() IS 'Clean up expired temporary files';
COMMENT ON FUNCTION get_user_storage_usage(UUID) IS 'Get comprehensive storage usage for a user';
COMMENT ON FUNCTION get_storage_analytics(TIMESTAMPTZ, TIMESTAMPTZ) IS 'Get system-wide storage analytics (admin only)';