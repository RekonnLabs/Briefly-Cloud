-- GDPR Compliance and Legal Database Schema
-- This schema supports consent management, data export/deletion requests, and audit trails

-- Consent records table
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    consent_type VARCHAR(20) NOT NULL CHECK (consent_type IN ('essential', 'analytics', 'marketing', 'functional')),
    granted BOOLEAN NOT NULL,
    version VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Data export requests table
CREATE TABLE IF NOT EXISTS data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    download_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Data deletion requests table
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    deletion_type VARCHAR(20) NOT NULL DEFAULT 'account' CHECK (deletion_type IN ('account', 'data_only')),
    reason TEXT,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit log table for tracking data access and modifications
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Add GDPR-related columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS inactive_since TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS gdpr_consent_version VARCHAR(10) DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_type_timestamp ON consent_records(consent_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_user_id ON data_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status ON data_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_inactive_since ON users(inactive_since) WHERE inactive_since IS NOT NULL;

-- Function to automatically log user actions
CREATE OR REPLACE FUNCTION log_user_action()
RETURNS TRIGGER AS $$
BEGIN
    -- Log INSERT operations
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
        VALUES (
            NEW.user_id,
            TG_OP,
            TG_TABLE_NAME,
            NEW.id,
            row_to_json(NEW)
        );
        RETURN NEW;
    END IF;
    
    -- Log UPDATE operations
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
        VALUES (
            NEW.user_id,
            TG_OP,
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object(
                'old', row_to_json(OLD),
                'new', row_to_json(NEW)
            )
        );
        RETURN NEW;
    END IF;
    
    -- Log DELETE operations
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
        VALUES (
            OLD.user_id,
            TG_OP,
            TG_TABLE_NAME,
            OLD.id,
            row_to_json(OLD)
        );
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for important tables
CREATE TRIGGER audit_file_metadata
    AFTER INSERT OR UPDATE OR DELETE ON file_metadata
    FOR EACH ROW EXECUTE FUNCTION log_user_action();

CREATE TRIGGER audit_conversations
    AFTER INSERT OR UPDATE OR DELETE ON conversations
    FOR EACH ROW EXECUTE FUNCTION log_user_action();

CREATE TRIGGER audit_chat_messages
    AFTER INSERT OR UPDATE OR DELETE ON chat_messages
    FOR EACH ROW EXECUTE FUNCTION log_user_action();

-- Function to clean up expired consent records
CREATE OR REPLACE FUNCTION cleanup_expired_consent()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM consent_records 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs (keep for 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 730)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to anonymize user data (for GDPR compliance)
CREATE OR REPLACE FUNCTION anonymize_user_data(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Anonymize user profile
    UPDATE users 
    SET 
        email = 'anonymized-' || target_user_id || '@example.com',
        name = 'Anonymized User',
        avatar_url = NULL,
        updated_at = NOW()
    WHERE id = target_user_id;
    
    -- Anonymize chat messages (keep content for analytics but remove personal identifiers)
    UPDATE chat_messages 
    SET 
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"anonymized": true}'::jsonb,
        updated_at = NOW()
    WHERE conversation_id IN (
        SELECT id FROM conversations WHERE user_id = target_user_id
    );
    
    -- Log the anonymization
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
        target_user_id,
        'ANONYMIZE',
        'users',
        target_user_id,
        jsonb_build_object('anonymized_at', NOW())
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user data for export
CREATE OR REPLACE FUNCTION get_user_export_data(target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    export_data JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user_profile', (
            SELECT row_to_json(u) 
            FROM (
                SELECT id, email, name, subscription_tier, created_at, updated_at
                FROM users 
                WHERE id = target_user_id
            ) u
        ),
        'files', (
            SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb)
            FROM (
                SELECT id, name, mime_type, size, created_at
                FROM file_metadata 
                WHERE user_id = target_user_id
            ) f
        ),
        'conversations', (
            SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb)
            FROM (
                SELECT id, title, created_at, updated_at
                FROM conversations 
                WHERE user_id = target_user_id
            ) c
        ),
        'chat_messages', (
            SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb)
            FROM (
                SELECT cm.id, cm.role, cm.content, cm.created_at
                FROM chat_messages cm
                JOIN conversations c ON cm.conversation_id = c.id
                WHERE c.user_id = target_user_id
            ) m
        ),
        'consent_records', (
            SELECT COALESCE(jsonb_agg(row_to_json(cr)), '[]'::jsonb)
            FROM (
                SELECT consent_type, granted, version, timestamp
                FROM consent_records 
                WHERE user_id = target_user_id
                ORDER BY timestamp DESC
            ) cr
        ),
        'oauth_connections', (
            SELECT COALESCE(jsonb_agg(row_to_json(ot)), '[]'::jsonb)
            FROM (
                SELECT provider, created_at, updated_at
                FROM oauth_tokens 
                WHERE user_id = target_user_id
            ) ot
        )
    ) INTO export_data;
    
    RETURN export_data;
END;
$$ LANGUAGE plpgsql;

-- Create a view for GDPR compliance dashboard
CREATE OR REPLACE VIEW gdpr_compliance_summary AS
SELECT 
    'consent_records' as data_type,
    COUNT(*) as total_records,
    COUNT(CASE WHEN granted THEN 1 END) as granted_count,
    COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired_count
FROM consent_records
UNION ALL
SELECT 
    'data_export_requests' as data_type,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as granted_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as expired_count
FROM data_export_requests
UNION ALL
SELECT 
    'data_deletion_requests' as data_type,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as granted_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as expired_count
FROM data_deletion_requests;

-- Insert default consent records for existing users (if needed)
-- This should be run carefully in production
/*
INSERT INTO consent_records (user_id, consent_type, granted, version)
SELECT 
    id as user_id,
    'essential' as consent_type,
    true as granted,
    '1.0' as version
FROM users 
WHERE id NOT IN (
    SELECT DISTINCT user_id 
    FROM consent_records 
    WHERE consent_type = 'essential'
);
*/

-- Create a function to schedule data cleanup jobs
CREATE OR REPLACE FUNCTION schedule_gdpr_cleanup()
RETURNS TEXT AS $$
DECLARE
    consent_cleaned INTEGER;
    audit_cleaned INTEGER;
    result_text TEXT;
BEGIN
    -- Clean up expired consent records
    SELECT cleanup_expired_consent() INTO consent_cleaned;
    
    -- Clean up old audit logs (older than 2 years)
    SELECT cleanup_old_audit_logs(730) INTO audit_cleaned;
    
    result_text := format(
        'GDPR cleanup completed: %s expired consent records removed, %s old audit logs removed',
        consent_cleaned,
        audit_cleaned
    );
    
    -- Log the cleanup operation
    INSERT INTO audit_logs (action, resource_type, details)
    VALUES (
        'GDPR_CLEANUP',
        'system',
        jsonb_build_object(
            'consent_records_cleaned', consent_cleaned,
            'audit_logs_cleaned', audit_cleaned,
            'cleanup_date', NOW()
        )
    );
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON consent_records TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON data_export_requests TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON data_deletion_requests TO your_app_user;
-- GRANT SELECT, INSERT ON audit_logs TO your_app_user;
-- GRANT SELECT ON gdpr_compliance_summary TO your_app_user;