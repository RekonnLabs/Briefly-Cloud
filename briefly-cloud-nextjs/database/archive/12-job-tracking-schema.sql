-- Job Tracking Database Schema Migration
-- This migration creates tables for import job management and progress tracking
-- Supports batch import operations with detailed progress monitoring

-- ============================================================================
-- PHASE 1: Create Job Tracking Tables
-- ============================================================================

-- Job logs table for import job tracking
CREATE TABLE IF NOT EXISTS app.job_logs (
    id TEXT PRIMARY KEY, -- Format: import_timestamp_randomstring
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('import', 'export', 'sync', 'cleanup')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Input parameters for the job
    input_data JSONB NOT NULL DEFAULT '{}', -- Contains provider, folderId, etc.
    
    -- Output data and results
    output_data JSONB DEFAULT '{}', -- Contains final results, errors, etc.
    
    -- Progress tracking
    progress JSONB DEFAULT '{
        "total": 0,
        "processed": 0,
        "failed": 0,
        "skipped": 0,
        "current_file": null,
        "percentage": 0
    }',
    
    -- Per-file status tracking
    file_statuses JSONB DEFAULT '[]', -- Array of file status objects
    
    -- Error information
    error_message TEXT,
    error_details JSONB,
    
    -- Performance metrics
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connection status table for provider connection state
CREATE TABLE IF NOT EXISTS app.connection_status (
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    connected BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Connection metadata
    last_sync TIMESTAMPTZ,
    last_successful_sync TIMESTAMPTZ,
    sync_count INTEGER DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ,
    
    -- Provider-specific metadata
    provider_metadata JSONB DEFAULT '{}', -- Stores provider-specific info like user email, drive info
    
    -- Connection health
    health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'warning', 'error', 'unknown')),
    health_checked_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (user_id, provider)
);

-- File processing history for deduplication and tracking
CREATE TABLE IF NOT EXISTS app.file_processing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    job_id TEXT REFERENCES app.job_logs(id) ON DELETE SET NULL,
    
    -- File identification
    external_id TEXT NOT NULL, -- Provider's file ID
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    file_name TEXT NOT NULL,
    file_path TEXT,
    
    -- Content identification for deduplication
    content_hash TEXT, -- SHA-256 hash of file content
    provider_version TEXT, -- Provider's version/etag for change detection
    file_size BIGINT,
    mime_type TEXT,
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped', 'duplicate')),
    processing_attempts INTEGER DEFAULT 0,
    
    -- Results
    chunks_created INTEGER DEFAULT 0,
    app_file_id UUID REFERENCES app.files(id) ON DELETE SET NULL,
    
    -- Error information
    error_message TEXT,
    error_code TEXT,
    
    -- Timestamps
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint for deduplication
    UNIQUE(user_id, provider, external_id, provider_version)
);

-- ============================================================================
-- PHASE 2: Create Indexes for Performance
-- ============================================================================

-- Job logs indexes
CREATE INDEX IF NOT EXISTS idx_app_job_logs_user_id ON app.job_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_app_job_logs_status ON app.job_logs(status);
CREATE INDEX IF NOT EXISTS idx_app_job_logs_job_type ON app.job_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_app_job_logs_created_at ON app.job_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_job_logs_user_status ON app.job_logs(user_id, status);

-- Connection status indexes
CREATE INDEX IF NOT EXISTS idx_app_connection_status_user_id ON app.connection_status(user_id);
CREATE INDEX IF NOT EXISTS idx_app_connection_status_provider ON app.connection_status(provider);
CREATE INDEX IF NOT EXISTS idx_app_connection_status_connected ON app.connection_status(connected);
CREATE INDEX IF NOT EXISTS idx_app_connection_status_health ON app.connection_status(health_status);

-- File processing history indexes
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_user_id ON app.file_processing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_job_id ON app.file_processing_history(job_id);
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_provider ON app.file_processing_history(provider);
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_status ON app.file_processing_history(status);
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_content_hash ON app.file_processing_history(content_hash);
CREATE INDEX IF NOT EXISTS idx_app_file_processing_history_external_id ON app.file_processing_history(provider, external_id);

-- ============================================================================
-- PHASE 3: Enable Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE app.job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.connection_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.file_processing_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 4: Create RLS Policies
-- ============================================================================

-- Job logs policies - users can access their own jobs
CREATE POLICY "Users can access own job logs" ON app.job_logs
    FOR ALL USING (auth.uid() = user_id);

-- Service role can access all job logs for processing
CREATE POLICY "Service can access all job logs" ON app.job_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Connection status policies - users can access their own connection status
CREATE POLICY "Users can access own connection status" ON app.connection_status
    FOR ALL USING (auth.uid() = user_id);

-- Service role can access all connection status for management
CREATE POLICY "Service can access all connection status" ON app.connection_status
    FOR ALL USING (auth.role() = 'service_role');

-- File processing history policies - users can access their own processing history
CREATE POLICY "Users can access own file processing history" ON app.file_processing_history
    FOR ALL USING (auth.uid() = user_id);

-- Service role can access all file processing history
CREATE POLICY "Service can access all file processing history" ON app.file_processing_history
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PHASE 5: Grant Table Permissions
-- ============================================================================

-- Grant permissions to service role (full access)
GRANT SELECT, INSERT, UPDATE, DELETE ON app.job_logs TO briefly_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.connection_status TO briefly_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.file_processing_history TO briefly_service;

-- Grant permissions to authenticated users (limited access through RLS)
GRANT SELECT, INSERT, UPDATE ON app.job_logs TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE ON app.connection_status TO briefly_authenticated;
GRANT SELECT ON app.file_processing_history TO briefly_authenticated;

-- ============================================================================
-- PHASE 6: Create Utility Functions
-- ============================================================================

-- Apply updated_at triggers to new tables
CREATE TRIGGER update_app_job_logs_updated_at 
    BEFORE UPDATE ON app.job_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_connection_status_updated_at 
    BEFORE UPDATE ON app.connection_status 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_file_processing_history_updated_at 
    BEFORE UPDATE ON app.file_processing_history 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate job IDs
CREATE OR REPLACE FUNCTION generate_job_id(job_type TEXT DEFAULT 'import')
RETURNS TEXT AS $
BEGIN
    RETURN job_type || '_' || EXTRACT(epoch FROM NOW())::BIGINT || '_' || 
           SUBSTRING(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 8);
END;
$ LANGUAGE plpgsql;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
    p_job_id TEXT,
    p_total INTEGER DEFAULT NULL,
    p_processed INTEGER DEFAULT NULL,
    p_failed INTEGER DEFAULT NULL,
    p_skipped INTEGER DEFAULT NULL,
    p_current_file TEXT DEFAULT NULL
)
RETURNS VOID AS $
BEGIN
    UPDATE app.job_logs 
    SET 
        progress = jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            progress,
                            '{total}', 
                            COALESCE(p_total, (progress->>'total')::INTEGER)::TEXT::JSONB
                        ),
                        '{processed}', 
                        COALESCE(p_processed, (progress->>'processed')::INTEGER)::TEXT::JSONB
                    ),
                    '{failed}', 
                    COALESCE(p_failed, (progress->>'failed')::INTEGER)::TEXT::JSONB
                ),
                '{skipped}', 
                COALESCE(p_skipped, (progress->>'skipped')::INTEGER)::TEXT::JSONB
            ),
            '{current_file}', 
            COALESCE(to_jsonb(p_current_file), progress->'current_file')
        ),
        progress = jsonb_set(
            progress,
            '{percentage}',
            CASE 
                WHEN (progress->>'total')::INTEGER > 0 THEN
                    (((progress->>'processed')::INTEGER + (progress->>'failed')::INTEGER + (progress->>'skipped')::INTEGER) * 100.0 / (progress->>'total')::INTEGER)::INTEGER::TEXT::JSONB
                ELSE
                    '0'::JSONB
            END
        ),
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$ LANGUAGE plpgsql;

-- Function to add file status to job
CREATE OR REPLACE FUNCTION add_file_status_to_job(
    p_job_id TEXT,
    p_file_id TEXT,
    p_file_name TEXT,
    p_status TEXT,
    p_error TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $
DECLARE
    file_status JSONB;
BEGIN
    -- Create file status object
    file_status := jsonb_build_object(
        'fileId', p_file_id,
        'fileName', p_file_name,
        'status', p_status,
        'error', p_error,
        'reason', p_reason,
        'timestamp', NOW()
    );
    
    -- Add to file_statuses array
    UPDATE app.job_logs 
    SET 
        file_statuses = COALESCE(file_statuses, '[]'::JSONB) || file_status,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$ LANGUAGE plpgsql;

-- Function to update connection status
CREATE OR REPLACE FUNCTION update_connection_status(
    p_user_id UUID,
    p_provider TEXT,
    p_connected BOOLEAN,
    p_error_message TEXT DEFAULT NULL,
    p_provider_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $
BEGIN
    INSERT INTO app.connection_status (
        user_id, 
        provider, 
        connected, 
        error_message,
        provider_metadata,
        health_status,
        health_checked_at,
        last_sync
    )
    VALUES (
        p_user_id,
        p_provider,
        p_connected,
        p_error_message,
        COALESCE(p_provider_metadata, '{}'::JSONB),
        CASE WHEN p_connected THEN 'healthy' ELSE 'error' END,
        NOW(),
        CASE WHEN p_connected THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, provider) 
    DO UPDATE SET
        connected = p_connected,
        error_message = p_error_message,
        error_count = CASE 
            WHEN p_connected THEN 0 
            ELSE connection_status.error_count + 1 
        END,
        last_error_at = CASE 
            WHEN NOT p_connected THEN NOW() 
            ELSE connection_status.last_error_at 
        END,
        provider_metadata = COALESCE(p_provider_metadata, connection_status.provider_metadata),
        health_status = CASE WHEN p_connected THEN 'healthy' ELSE 'error' END,
        health_checked_at = NOW(),
        last_sync = CASE 
            WHEN p_connected THEN NOW() 
            ELSE connection_status.last_sync 
        END,
        last_successful_sync = CASE 
            WHEN p_connected THEN NOW() 
            ELSE connection_status.last_successful_sync 
        END,
        sync_count = CASE 
            WHEN p_connected THEN connection_status.sync_count + 1 
            ELSE connection_status.sync_count 
        END,
        updated_at = NOW();
END;
$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 7: Create Views for Easy Access
-- ============================================================================

-- View for active jobs with progress
CREATE OR REPLACE VIEW app.active_jobs AS
SELECT 
    id,
    user_id,
    job_type,
    status,
    (progress->>'total')::INTEGER as total_files,
    (progress->>'processed')::INTEGER as processed_files,
    (progress->>'failed')::INTEGER as failed_files,
    (progress->>'skipped')::INTEGER as skipped_files,
    (progress->>'percentage')::INTEGER as percentage_complete,
    progress->>'current_file' as current_file,
    input_data->>'provider' as provider,
    input_data->>'folderId' as folder_id,
    created_at,
    started_at,
    estimated_completion
FROM app.job_logs
WHERE status IN ('pending', 'processing');

-- View for connection health summary
CREATE OR REPLACE VIEW app.connection_health AS
SELECT 
    user_id,
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE connected = true) as connected_count,
    COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_count,
    COUNT(*) FILTER (WHERE health_status = 'error') as error_count,
    MAX(last_successful_sync) as last_successful_sync,
    jsonb_agg(
        jsonb_build_object(
            'provider', provider,
            'connected', connected,
            'health_status', health_status,
            'last_sync', last_sync,
            'error_message', error_message
        )
    ) as provider_details
FROM app.connection_status
GROUP BY user_id;

-- ============================================================================
-- PHASE 8: Grant Permissions on Functions and Views
-- ============================================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION generate_job_id(TEXT) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION update_job_progress(TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO briefly_service;
GRANT EXECUTE ON FUNCTION add_file_status_to_job(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO briefly_service;
GRANT EXECUTE ON FUNCTION update_connection_status(UUID, TEXT, BOOLEAN, TEXT, JSONB) TO briefly_service;

-- Grant permissions on views
GRANT SELECT ON app.active_jobs TO briefly_service, briefly_authenticated;
GRANT SELECT ON app.connection_health TO briefly_service, briefly_authenticated;

-- ============================================================================
-- PHASE 9: Insert Initial Data
-- ============================================================================

-- Log the migration completion
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
    'SCHEMA_MIGRATION',
    'database',
    jsonb_build_object(
        'migration', '12-job-tracking-schema',
        'tables_created', ARRAY['job_logs', 'connection_status', 'file_processing_history'],
        'functions_created', ARRAY['generate_job_id', 'update_job_progress', 'add_file_status_to_job', 'update_connection_status'],
        'views_created', ARRAY['active_jobs', 'connection_health'],
        'completed_at', NOW()
    ),
    'info'
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE app.job_logs IS 'Tracks import jobs and their progress with detailed status information';
COMMENT ON TABLE app.connection_status IS 'Tracks cloud storage provider connection status and health';
COMMENT ON TABLE app.file_processing_history IS 'Tracks individual file processing for deduplication and audit';
COMMENT ON FUNCTION generate_job_id(TEXT) IS 'Generates unique job IDs with timestamp and random component';
COMMENT ON FUNCTION update_job_progress(TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) IS 'Updates job progress counters and percentage';
COMMENT ON FUNCTION add_file_status_to_job(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS 'Adds individual file status to job tracking';
COMMENT ON FUNCTION update_connection_status(UUID, TEXT, BOOLEAN, TEXT, JSONB) IS 'Updates provider connection status with health tracking';