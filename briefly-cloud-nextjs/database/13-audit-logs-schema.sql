-- Comprehensive Audit Logs Schema
-- Provides detailed audit trail with correlation ID tracking and performance metrics

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  resource TEXT,
  provider TEXT CHECK (provider IN ('google_drive', 'microsoft') OR provider IS NULL),
  file_ids TEXT[],
  bytes_processed BIGINT,
  duration INTEGER, -- milliseconds
  error_class TEXT,
  success BOOLEAN NOT NULL,
  details JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_provider ON audit_logs(provider);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);
CREATE INDEX IF NOT EXISTS idx_audit_logs_error_class ON audit_logs(error_class);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_provider_timestamp ON audit_logs(provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success_timestamp ON audit_logs(success, timestamp DESC);

-- GIN index for JSONB fields
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING GIN(details);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performance_gin ON audit_logs USING GIN(performance_metrics);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own audit logs
CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can access all audit logs
CREATE POLICY "Service role can access all audit logs" ON audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can insert audit logs (for client-side auditing if needed)
CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create function to get audit statistics
CREATE OR REPLACE FUNCTION get_audit_stats(
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  total_logs BIGINT,
  error_count BIGINT,
  error_rate NUMERIC,
  avg_response_time NUMERIC,
  actions_summary JSONB,
  severity_summary JSONB,
  category_summary JSONB,
  error_summary JSONB
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_logs AS (
    SELECT *
    FROM audit_logs
    WHERE timestamp BETWEEN p_start_date AND p_end_date
      AND (p_user_id IS NULL OR user_id = p_user_id)
  ),
  stats AS (
    SELECT
      COUNT(*) as total_logs,
      COUNT(*) FILTER (WHERE NOT success) as error_count,
      AVG((performance_metrics->>'responseTime')::NUMERIC) FILTER (WHERE performance_metrics->>'responseTime' IS NOT NULL) as avg_response_time
    FROM filtered_logs
  ),
  action_stats AS (
    SELECT jsonb_object_agg(action, count) as actions_summary
    FROM (
      SELECT action, COUNT(*) as count
      FROM filtered_logs
      GROUP BY action
    ) t
  ),
  severity_stats AS (
    SELECT jsonb_object_agg(severity, count) as severity_summary
    FROM (
      SELECT severity, COUNT(*) as count
      FROM filtered_logs
      GROUP BY severity
    ) t
  ),
  category_stats AS (
    SELECT jsonb_object_agg(category, count) as category_summary
    FROM (
      SELECT category, COUNT(*) as count
      FROM filtered_logs
      GROUP BY category
    ) t
  ),
  error_stats AS (
    SELECT jsonb_object_agg(error_class, count) as error_summary
    FROM (
      SELECT error_class, COUNT(*) as count
      FROM filtered_logs
      WHERE error_class IS NOT NULL
      GROUP BY error_class
    ) t
  )
  SELECT
    s.total_logs,
    s.error_count,
    CASE 
      WHEN s.total_logs > 0 THEN ROUND((s.error_count::NUMERIC / s.total_logs::NUMERIC) * 100, 2)
      ELSE 0
    END as error_rate,
    ROUND(s.avg_response_time, 2) as avg_response_time,
    COALESCE(a.actions_summary, '{}'::jsonb) as actions_summary,
    COALESCE(sv.severity_summary, '{}'::jsonb) as severity_summary,
    COALESCE(c.category_summary, '{}'::jsonb) as category_summary,
    COALESCE(e.error_summary, '{}'::jsonb) as error_summary
  FROM stats s
  CROSS JOIN action_stats a
  CROSS JOIN severity_stats sv
  CROSS JOIN category_stats c
  CROSS JOIN error_stats e;
$$;

-- Grant permissions
GRANT SELECT ON audit_logs TO authenticated;
GRANT INSERT ON audit_logs TO authenticated, service_role;
GRANT ALL ON audit_logs TO service_role;

GRANT EXECUTE ON FUNCTION get_audit_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- Create function to clean up old audit logs (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant permission to service role only (for maintenance tasks)
GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs(INTEGER) TO service_role;

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail with correlation ID tracking and performance metrics';
COMMENT ON COLUMN audit_logs.correlation_id IS 'Unique identifier for tracking requests across services';
COMMENT ON COLUMN audit_logs.action IS 'Specific action being audited (e.g., file.upload, user.login)';
COMMENT ON COLUMN audit_logs.category IS 'Category of the action (e.g., authentication, data_access)';
COMMENT ON COLUMN audit_logs.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN audit_logs.provider IS 'Cloud storage provider for storage-related actions';
COMMENT ON COLUMN audit_logs.file_ids IS 'Array of file IDs involved in the operation';
COMMENT ON COLUMN audit_logs.bytes_processed IS 'Number of bytes processed in the operation';
COMMENT ON COLUMN audit_logs.duration IS 'Operation duration in milliseconds';
COMMENT ON COLUMN audit_logs.error_class IS 'Classification of error for failed operations';
COMMENT ON COLUMN audit_logs.performance_metrics IS 'JSON object containing performance metrics';
COMMENT ON FUNCTION get_audit_stats IS 'Get comprehensive audit statistics for a time period';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Clean up audit logs older than specified retention period';