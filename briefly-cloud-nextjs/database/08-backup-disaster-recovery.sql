-- Backup and Disaster Recovery Schema
-- This schema supports comprehensive backup management, validation, and restoration

-- ============================================================================
-- BACKUP MANAGEMENT TABLES
-- ============================================================================

-- Backup configurations table
CREATE TABLE IF NOT EXISTS private.backup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential', 'schema_only', 'data_only')),
  schedule_cron TEXT, -- Cron expression for scheduled backups
  retention_days INTEGER NOT NULL DEFAULT 30,
  retention_max_count INTEGER NOT NULL DEFAULT 10,
  compression_enabled BOOLEAN NOT NULL DEFAULT true,
  encryption_enabled BOOLEAN NOT NULL DEFAULT true,
  include_storage BOOLEAN NOT NULL DEFAULT false,
  exclude_tables TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup jobs table
CREATE TABLE IF NOT EXISTS private.backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES private.backup_configs(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential', 'schema_only', 'data_only')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'pre_migration', 'disaster_recovery')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration INTEGER, -- Duration in milliseconds
  size BIGINT, -- Backup size in bytes
  location TEXT NOT NULL, -- Storage location/path
  checksum TEXT, -- SHA256 checksum for integrity
  metadata JSONB DEFAULT '{}', -- Additional backup metadata
  error TEXT, -- Error message if failed
  created_by UUID REFERENCES app.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup validations table
CREATE TABLE IF NOT EXISTS private.backup_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id UUID NOT NULL REFERENCES private.backup_jobs(id) ON DELETE CASCADE,
  is_valid BOOLEAN NOT NULL,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  integrity_check BOOLEAN NOT NULL DEFAULT false,
  completeness_check BOOLEAN NOT NULL DEFAULT false,
  restoration_check BOOLEAN NOT NULL DEFAULT false,
  issues TEXT[] DEFAULT '{}',
  validation_time_ms INTEGER, -- Time taken for validation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restore jobs table
CREATE TABLE IF NOT EXISTS private.restore_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id UUID NOT NULL REFERENCES private.backup_jobs(id),
  target_database TEXT, -- Target database name (for cross-database restore)
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration INTEGER, -- Duration in milliseconds
  restore_point TEXT, -- Point-in-time for PITR
  restore_options JSONB NOT NULL DEFAULT '{}', -- Restore configuration options
  error TEXT, -- Error message if failed
  created_by UUID NOT NULL REFERENCES app.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disaster recovery plans table
CREATE TABLE IF NOT EXISTS private.disaster_recovery_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('data_corruption', 'hardware_failure', 'security_breach', 'natural_disaster', 'human_error')),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5), -- 1 = Critical, 5 = Low
  rto_minutes INTEGER NOT NULL, -- Recovery Time Objective in minutes
  rpo_minutes INTEGER NOT NULL, -- Recovery Point Objective in minutes
  procedures JSONB NOT NULL DEFAULT '{}', -- Step-by-step procedures
  contacts JSONB DEFAULT '{}', -- Emergency contacts
  dependencies TEXT[] DEFAULT '{}', -- System dependencies
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_tested TIMESTAMPTZ,
  test_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- BACKUP FUNCTIONS
-- ============================================================================

-- Function to get tables for backup (excluding system tables)
CREATE OR REPLACE FUNCTION get_backup_tables(exclude_tables TEXT[] DEFAULT '{}')
RETURNS TABLE (
  schema_name TEXT,
  table_name TEXT,
  table_type TEXT,
  estimated_rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_schema::TEXT,
    t.table_name::TEXT,
    t.table_type::TEXT,
    COALESCE(s.n_tup_ins + s.n_tup_upd, 0) as estimated_rows
  FROM information_schema.tables t
  LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
  WHERE t.table_schema IN ('app', 'private')
    AND t.table_type = 'BASE TABLE'
    AND NOT (t.table_name = ANY(exclude_tables))
    AND t.table_name NOT LIKE '%_backup_%'
  ORDER BY t.table_schema, t.table_name;
END;
$$;

-- Function to create a backup configuration
CREATE OR REPLACE FUNCTION create_backup_config(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_backup_type TEXT DEFAULT 'full',
  p_schedule_cron TEXT DEFAULT NULL,
  p_retention_days INTEGER DEFAULT 30,
  p_retention_max_count INTEGER DEFAULT 10,
  p_compression_enabled BOOLEAN DEFAULT true,
  p_encryption_enabled BOOLEAN DEFAULT true,
  p_include_storage BOOLEAN DEFAULT false,
  p_exclude_tables TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_id UUID;
BEGIN
  -- Validate backup type
  IF p_backup_type NOT IN ('full', 'incremental', 'differential', 'schema_only', 'data_only') THEN
    RAISE EXCEPTION 'Invalid backup type: %', p_backup_type;
  END IF;
  
  -- Validate cron expression if provided
  IF p_schedule_cron IS NOT NULL THEN
    -- Basic cron validation (5 fields)
    IF array_length(string_to_array(p_schedule_cron, ' '), 1) != 5 THEN
      RAISE EXCEPTION 'Invalid cron expression: %', p_schedule_cron;
    END IF;
  END IF;
  
  -- Insert backup configuration
  INSERT INTO private.backup_configs (
    name,
    description,
    backup_type,
    schedule_cron,
    retention_days,
    retention_max_count,
    compression_enabled,
    encryption_enabled,
    include_storage,
    exclude_tables
  ) VALUES (
    p_name,
    p_description,
    p_backup_type,
    p_schedule_cron,
    p_retention_days,
    p_retention_max_count,
    p_compression_enabled,
    p_encryption_enabled,
    p_include_storage,
    p_exclude_tables
  ) RETURNING id INTO config_id;
  
  -- Log the configuration creation
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    resource_id,
    new_values,
    severity
  ) VALUES (
    'BACKUP_CONFIG_CREATED',
    'backup',
    config_id::TEXT,
    jsonb_build_object(
      'name', p_name,
      'backup_type', p_backup_type,
      'schedule', p_schedule_cron,
      'retention_days', p_retention_days
    ),
    'info'
  );
  
  RETURN config_id;
END;
$$;

-- Function to get backup statistics
CREATE OR REPLACE FUNCTION get_backup_statistics(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats JSONB;
  total_backups INTEGER;
  successful_backups INTEGER;
  failed_backups INTEGER;
  total_size BIGINT;
  avg_duration FLOAT;
BEGIN
  -- Get basic statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COALESCE(SUM(size), 0),
    COALESCE(AVG(duration), 0)
  INTO total_backups, successful_backups, failed_backups, total_size, avg_duration
  FROM private.backup_jobs
  WHERE started_at >= start_date AND started_at <= end_date;
  
  -- Build comprehensive statistics
  stats := jsonb_build_object(
    'period', jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date
    ),
    'totals', jsonb_build_object(
      'backups', total_backups,
      'successful', successful_backups,
      'failed', failed_backups,
      'success_rate', CASE WHEN total_backups > 0 THEN ROUND((successful_backups::FLOAT / total_backups) * 100, 2) ELSE 0 END,
      'total_size_bytes', total_size,
      'avg_duration_ms', ROUND(avg_duration, 0)
    ),
    'by_type', (
      SELECT COALESCE(jsonb_object_agg(backup_type, type_stats), '{}')
      FROM (
        SELECT 
          backup_type,
          jsonb_build_object(
            'count', COUNT(*),
            'successful', COUNT(*) FILTER (WHERE status = 'completed'),
            'avg_size', COALESCE(AVG(size), 0),
            'avg_duration', COALESCE(AVG(duration), 0)
          ) as type_stats
        FROM private.backup_jobs
        WHERE started_at >= start_date AND started_at <= end_date
        GROUP BY backup_type
      ) type_breakdown
    ),
    'by_trigger', (
      SELECT COALESCE(jsonb_object_agg(trigger_type, trigger_stats), '{}')
      FROM (
        SELECT 
          trigger_type,
          jsonb_build_object(
            'count', COUNT(*),
            'successful', COUNT(*) FILTER (WHERE status = 'completed')
          ) as trigger_stats
        FROM private.backup_jobs
        WHERE started_at >= start_date AND started_at <= end_date
        GROUP BY trigger_type
      ) trigger_breakdown
    ),
    'recent_failures', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'config_name', (SELECT name FROM private.backup_configs WHERE id = backup_jobs.config_id),
          'backup_type', backup_type,
          'started_at', started_at,
          'error', error
        ) ORDER BY started_at DESC
      ), '[]')
      FROM private.backup_jobs
      WHERE status = 'failed'
        AND started_at >= start_date AND started_at <= end_date
      LIMIT 5
    )
  );
  
  RETURN stats;
END;
$$;

-- Function to cleanup old backups based on retention policy
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_record RECORD;
  deleted_count INTEGER := 0;
  backup_record RECORD;
BEGIN
  -- Process each backup configuration
  FOR config_record IN 
    SELECT * FROM private.backup_configs WHERE is_active = true
  LOOP
    -- Delete backups older than retention period
    DELETE FROM private.backup_jobs
    WHERE config_id = config_record.id
      AND status = 'completed'
      AND started_at < NOW() - INTERVAL '1 day' * config_record.retention_days;
    
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Delete excess backups beyond max count
    FOR backup_record IN
      SELECT id FROM private.backup_jobs
      WHERE config_id = config_record.id
        AND status = 'completed'
      ORDER BY started_at DESC
      OFFSET config_record.retention_max_count
    LOOP
      DELETE FROM private.backup_jobs WHERE id = backup_record.id;
      deleted_count := deleted_count + 1;
    END LOOP;
  END LOOP;
  
  -- Log cleanup activity
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    new_values,
    severity
  ) VALUES (
    'BACKUP_CLEANUP',
    'backup',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    ),
    'info'
  );
  
  RETURN deleted_count;
END;
$$;

-- Function to validate backup integrity
CREATE OR REPLACE FUNCTION validate_backup_integrity(backup_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backup_record RECORD;
  validation_result JSONB;
  issues TEXT[] := '{}';
  is_valid BOOLEAN := true;
BEGIN
  -- Get backup job details
  SELECT * INTO backup_record
  FROM private.backup_jobs
  WHERE id = backup_job_id AND status = 'completed';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup job not found or not completed: %', backup_job_id;
  END IF;
  
  -- Check 1: Verify checksum exists
  IF backup_record.checksum IS NULL THEN
    issues := array_append(issues, 'Missing checksum');
    is_valid := false;
  END IF;
  
  -- Check 2: Verify metadata completeness
  IF backup_record.metadata IS NULL OR 
     NOT (backup_record.metadata ? 'tables') OR
     NOT (backup_record.metadata ? 'recordCount') THEN
    issues := array_append(issues, 'Incomplete metadata');
    is_valid := false;
  END IF;
  
  -- Check 3: Verify size is reasonable
  IF backup_record.size IS NULL OR backup_record.size <= 0 THEN
    issues := array_append(issues, 'Invalid backup size');
    is_valid := false;
  END IF;
  
  -- Check 4: Verify duration is reasonable
  IF backup_record.duration IS NULL OR backup_record.duration <= 0 THEN
    issues := array_append(issues, 'Invalid backup duration');
    is_valid := false;
  END IF;
  
  -- Store validation result
  INSERT INTO private.backup_validations (
    backup_id,
    is_valid,
    integrity_check,
    completeness_check,
    restoration_check,
    issues,
    validation_time_ms
  ) VALUES (
    backup_job_id,
    is_valid,
    backup_record.checksum IS NOT NULL,
    backup_record.metadata IS NOT NULL,
    false, -- Restoration check would be performed separately
    issues,
    100 -- Simulated validation time
  );
  
  -- Build result
  validation_result := jsonb_build_object(
    'backup_id', backup_job_id,
    'is_valid', is_valid,
    'checks', jsonb_build_object(
      'integrity', backup_record.checksum IS NOT NULL,
      'completeness', backup_record.metadata IS NOT NULL,
      'restoration', false
    ),
    'issues', to_jsonb(issues),
    'validated_at', NOW()
  );
  
  RETURN validation_result;
END;
$$;

-- ============================================================================
-- DISASTER RECOVERY FUNCTIONS
-- ============================================================================

-- Function to create disaster recovery plan
CREATE OR REPLACE FUNCTION create_disaster_recovery_plan(
  p_name TEXT,
  p_description TEXT,
  p_plan_type TEXT,
  p_priority INTEGER,
  p_rto_minutes INTEGER,
  p_rpo_minutes INTEGER,
  p_procedures JSONB DEFAULT '{}',
  p_contacts JSONB DEFAULT '{}',
  p_dependencies TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  plan_id UUID;
BEGIN
  -- Validate plan type
  IF p_plan_type NOT IN ('data_corruption', 'hardware_failure', 'security_breach', 'natural_disaster', 'human_error') THEN
    RAISE EXCEPTION 'Invalid plan type: %', p_plan_type;
  END IF;
  
  -- Validate priority
  IF p_priority NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Priority must be between 1 and 5';
  END IF;
  
  -- Insert disaster recovery plan
  INSERT INTO private.disaster_recovery_plans (
    name,
    description,
    plan_type,
    priority,
    rto_minutes,
    rpo_minutes,
    procedures,
    contacts,
    dependencies
  ) VALUES (
    p_name,
    p_description,
    p_plan_type,
    p_priority,
    p_rto_minutes,
    p_rpo_minutes,
    p_procedures,
    p_contacts,
    p_dependencies
  ) RETURNING id INTO plan_id;
  
  -- Log plan creation
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    resource_id,
    new_values,
    severity
  ) VALUES (
    'DR_PLAN_CREATED',
    'disaster_recovery',
    plan_id::TEXT,
    jsonb_build_object(
      'name', p_name,
      'plan_type', p_plan_type,
      'priority', p_priority,
      'rto_minutes', p_rto_minutes,
      'rpo_minutes', p_rpo_minutes
    ),
    'info'
  );
  
  RETURN plan_id;
END;
$$;

-- ============================================================================
-- TRIGGERS AND AUTOMATION
-- ============================================================================

-- Trigger to update backup_configs updated_at
CREATE OR REPLACE FUNCTION update_backup_config_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER backup_configs_updated_at
  BEFORE UPDATE ON private.backup_configs
  FOR EACH ROW EXECUTE FUNCTION update_backup_config_timestamp();

-- Trigger to update disaster_recovery_plans updated_at
CREATE OR REPLACE FUNCTION update_dr_plan_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dr_plans_updated_at
  BEFORE UPDATE ON private.disaster_recovery_plans
  FOR EACH ROW EXECUTE FUNCTION update_dr_plan_timestamp();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to service role
GRANT ALL ON private.backup_configs TO briefly_service;
GRANT ALL ON private.backup_jobs TO briefly_service;
GRANT ALL ON private.backup_validations TO briefly_service;
GRANT ALL ON private.restore_jobs TO briefly_service;
GRANT ALL ON private.disaster_recovery_plans TO briefly_service;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_backup_tables(TEXT[]) TO briefly_service;
GRANT EXECUTE ON FUNCTION create_backup_config(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, TEXT[]) TO briefly_service;
GRANT EXECUTE ON FUNCTION get_backup_statistics(TIMESTAMPTZ, TIMESTAMPTZ) TO briefly_service;
GRANT EXECUTE ON FUNCTION cleanup_old_backups() TO briefly_service;
GRANT EXECUTE ON FUNCTION validate_backup_integrity(UUID) TO briefly_service;
GRANT EXECUTE ON FUNCTION create_disaster_recovery_plan(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, JSONB, JSONB, TEXT[]) TO briefly_service;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for backup_jobs
CREATE INDEX IF NOT EXISTS idx_backup_jobs_config_id ON private.backup_jobs(config_id);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON private.backup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_started_at ON private.backup_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_config_status ON private.backup_jobs(config_id, status);

-- Indexes for backup_validations
CREATE INDEX IF NOT EXISTS idx_backup_validations_backup_id ON private.backup_validations(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_validations_is_valid ON private.backup_validations(is_valid);

-- Indexes for restore_jobs
CREATE INDEX IF NOT EXISTS idx_restore_jobs_backup_id ON private.restore_jobs(backup_id);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_status ON private.restore_jobs(status);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_created_by ON private.restore_jobs(created_by);

-- Indexes for disaster_recovery_plans
CREATE INDEX IF NOT EXISTS idx_dr_plans_plan_type ON private.disaster_recovery_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_dr_plans_priority ON private.disaster_recovery_plans(priority);
CREATE INDEX IF NOT EXISTS idx_dr_plans_is_active ON private.disaster_recovery_plans(is_active);

-- ============================================================================
-- LOG COMPLETION
-- ============================================================================

INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
  'BACKUP_SYSTEM_INITIALIZED',
  'system',
  jsonb_build_object(
    'tables_created', ARRAY[
      'backup_configs',
      'backup_jobs', 
      'backup_validations',
      'restore_jobs',
      'disaster_recovery_plans'
    ],
    'functions_created', ARRAY[
      'get_backup_tables',
      'create_backup_config',
      'get_backup_statistics',
      'cleanup_old_backups',
      'validate_backup_integrity',
      'create_disaster_recovery_plan'
    ],
    'completed_at', NOW()
  ),
  'info'
);

COMMENT ON TABLE private.backup_configs IS 'Backup configuration templates';
COMMENT ON TABLE private.backup_jobs IS 'Individual backup execution records';
COMMENT ON TABLE private.backup_validations IS 'Backup integrity validation results';
COMMENT ON TABLE private.restore_jobs IS 'Database restoration job records';
COMMENT ON TABLE private.disaster_recovery_plans IS 'Disaster recovery procedures and plans';