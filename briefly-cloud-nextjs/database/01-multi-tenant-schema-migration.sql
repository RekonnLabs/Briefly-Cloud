-- Multi-Tenant Database Schema Migration
-- This migration creates the new app and private schemas with proper role permissions
-- and migrates existing data to the new structure

-- ============================================================================
-- PHASE 1: Create Schemas and Roles
-- ============================================================================

-- Create application schema for tenant-scoped data
CREATE SCHEMA IF NOT EXISTS app;

-- Create private schema for secrets and system data  
CREATE SCHEMA IF NOT EXISTS private;

-- Create custom roles for better security
DO $$ 
BEGIN
    -- Create service role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'briefly_service') THEN
        CREATE ROLE briefly_service;
    END IF;
    
    -- Create authenticated role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'briefly_authenticated') THEN
        CREATE ROLE briefly_authenticated;
    END IF;
    
    -- Create anonymous role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'briefly_anonymous') THEN
        CREATE ROLE briefly_anonymous;
    END IF;
END $$;

-- Grant schema usage permissions
GRANT USAGE ON SCHEMA app TO briefly_service, briefly_authenticated;
GRANT USAGE ON SCHEMA private TO briefly_service;
GRANT USAGE ON SCHEMA public TO briefly_service, briefly_authenticated, briefly_anonymous;

-- ============================================================================
-- PHASE 2: Create App Schema Tables (Tenant-Scoped)
-- ============================================================================

-- Enhanced users table in app schema
CREATE TABLE app.users (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'pro_byok')),
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
    stripe_customer_id TEXT,
    
    -- Usage tracking fields
    chat_messages_count INTEGER DEFAULT 0,
    chat_messages_limit INTEGER DEFAULT 100,
    documents_uploaded INTEGER DEFAULT 0,
    documents_limit INTEGER DEFAULT 25,
    api_calls_count INTEGER DEFAULT 0,
    api_calls_limit INTEGER DEFAULT 1000,
    storage_used_bytes BIGINT DEFAULT 0,
    storage_limit_bytes BIGINT DEFAULT 104857600, -- 100MB for free tier
    
    -- Usage reset tracking
    usage_reset_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
    trial_end_date TIMESTAMPTZ,
    
    -- User preferences and features
    usage_stats JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    features_enabled JSONB DEFAULT '{"cloud_storage": true, "ai_chat": true, "document_upload": true}',
    permissions JSONB DEFAULT '{"can_upload": true, "can_chat": true, "can_export": false}',
    
    -- GDPR and compliance fields
    last_login_at TIMESTAMPTZ DEFAULT NOW(),
    gdpr_consent_version TEXT DEFAULT '1.0',
    marketing_consent BOOLEAN DEFAULT FALSE,
    analytics_consent BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    inactive_since TIMESTAMPTZ,
    
    -- Beta and feature flags
    is_beta_user BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files table in app schema
CREATE TABLE app.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    source TEXT NOT NULL CHECK (source IN ('upload', 'google', 'microsoft')),
    external_id TEXT,
    external_url TEXT,
    processed BOOLEAN DEFAULT FALSE,
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document chunks with pgvector embeddings in app schema
CREATE TABLE app.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES app.files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI embedding dimension
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table in app schema
CREATE TABLE app.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table in app schema
CREATE TABLE app.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs table in app schema
CREATE TABLE app.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    quantity INTEGER DEFAULT 1,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limits table in app schema
CREATE TABLE app.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    limit_type TEXT NOT NULL CHECK (limit_type IN ('minute', 'hour', 'day', 'month')),
    action TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, limit_type, action, window_start)
);

-- User settings table in app schema
CREATE TABLE app.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, key)
);

-- Feature flags table in app schema (moved from public)
CREATE TABLE app.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    user_tiers TEXT[] DEFAULT '{}',
    beta_users TEXT[] DEFAULT '{}',
    ab_test_config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature flag usage tracking in app schema
CREATE TABLE app.feature_flag_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name TEXT NOT NULL,
    user_id UUID REFERENCES app.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    variant TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Consent records table in app schema
CREATE TABLE app.consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('essential', 'analytics', 'marketing', 'functional')),
    granted BOOLEAN NOT NULL,
    version TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Data export requests in app schema
CREATE TABLE app.data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    download_url TEXT,
    expires_at TIMESTAMPTZ
);

-- Data deletion requests in app schema
CREATE TABLE app.data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deletion_type TEXT NOT NULL DEFAULT 'account' CHECK (deletion_type IN ('account', 'data_only')),
    reason TEXT
);

-- ============================================================================
-- PHASE 3: Create Private Schema Tables (Secrets & System Data)
-- ============================================================================

-- Encrypted OAuth tokens in private schema
CREATE TABLE private.oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References app.users(id) but no FK for security
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    token_type TEXT DEFAULT 'Bearer',
    encryption_key_id TEXT NOT NULL DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Audit logs in private schema (admin access only)
CREATE TABLE private.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- May be NULL for system events
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encryption keys management in private schema
CREATE TABLE private.encryption_keys (
    id TEXT PRIMARY KEY,
    key_data TEXT NOT NULL, -- Base64 encoded key
    algorithm TEXT NOT NULL DEFAULT 'AES-GCM',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- System configuration in private schema
CREATE TABLE private.system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PHASE 4: Create Indexes for Performance
-- ============================================================================

-- App schema indexes
CREATE INDEX idx_app_users_email ON app.users(email);
CREATE INDEX idx_app_users_subscription_tier ON app.users(subscription_tier);
CREATE INDEX idx_app_users_deleted_at ON app.users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_app_users_is_beta_user ON app.users(is_beta_user) WHERE is_beta_user = TRUE;

CREATE INDEX idx_app_files_user_id ON app.files(user_id);
CREATE INDEX idx_app_files_processed ON app.files(processed);
CREATE INDEX idx_app_files_source ON app.files(source);

CREATE INDEX idx_app_document_chunks_file_id ON app.document_chunks(file_id);
CREATE INDEX idx_app_document_chunks_user_id ON app.document_chunks(user_id);
CREATE INDEX idx_app_document_chunks_embedding ON app.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_app_conversations_user_id ON app.conversations(user_id);
CREATE INDEX idx_app_chat_messages_conversation_id ON app.chat_messages(conversation_id);
CREATE INDEX idx_app_chat_messages_user_id ON app.chat_messages(user_id);

CREATE INDEX idx_app_usage_logs_user_id_action ON app.usage_logs(user_id, action);
CREATE INDEX idx_app_usage_logs_created_at ON app.usage_logs(created_at);

CREATE INDEX idx_app_rate_limits_user_action_window ON app.rate_limits(user_id, action, window_start);

CREATE INDEX idx_app_user_settings_user_id ON app.user_settings(user_id);

CREATE INDEX idx_app_feature_flags_name ON app.feature_flags(name);
CREATE INDEX idx_app_feature_flags_enabled ON app.feature_flags(enabled);

CREATE INDEX idx_app_feature_flag_usage_feature_name ON app.feature_flag_usage(feature_name);
CREATE INDEX idx_app_feature_flag_usage_user_id ON app.feature_flag_usage(user_id);

CREATE INDEX idx_app_consent_records_user_id ON app.consent_records(user_id);
CREATE INDEX idx_app_consent_records_type_timestamp ON app.consent_records(consent_type, timestamp DESC);

-- Private schema indexes
CREATE INDEX idx_private_oauth_tokens_user_provider ON private.oauth_tokens(user_id, provider);
CREATE INDEX idx_private_audit_logs_user_id ON private.audit_logs(user_id);
CREATE INDEX idx_private_audit_logs_timestamp ON private.audit_logs(created_at DESC);
CREATE INDEX idx_private_audit_logs_action ON private.audit_logs(action);
CREATE INDEX idx_private_audit_logs_severity ON private.audit_logs(severity);

-- ============================================================================
-- PHASE 5: Enable Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all app schema tables
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feature_flag_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Enable RLS on private schema tables
ALTER TABLE private.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 6: Create RLS Policies
-- ============================================================================

-- User data isolation policies
CREATE POLICY "Users can access own profile" ON app.users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can access own files" ON app.files
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own document chunks" ON app.document_chunks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own conversations" ON app.conversations
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own chat messages" ON app.chat_messages
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own usage logs" ON app.usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert usage logs" ON app.usage_logs
    FOR INSERT WITH CHECK (true); -- Service role can insert for any user

CREATE POLICY "Users can access own rate limits" ON app.rate_limits
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own settings" ON app.user_settings
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own feature flag usage" ON app.feature_flag_usage
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own consent records" ON app.consent_records
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own export requests" ON app.data_export_requests
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own deletion requests" ON app.data_deletion_requests
    FOR ALL USING (auth.uid() = user_id);

-- Feature flags are readable by all authenticated users
CREATE POLICY "Authenticated users can read feature flags" ON app.feature_flags
    FOR SELECT USING (auth.role() = 'authenticated');

-- Admin access to audit logs (RekonnLabs employees only)
CREATE POLICY "Admin access to audit logs" ON private.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM app.users 
            WHERE id = auth.uid() 
            AND email LIKE '%@rekonnlabs.com'
        )
    );

-- ============================================================================
-- PHASE 7: Grant Table Permissions
-- ============================================================================

-- Grant permissions on app schema tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO briefly_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users, app.files, app.document_chunks, 
      app.conversations, app.chat_messages, app.user_settings, app.consent_records,
      app.data_export_requests, app.data_deletion_requests TO briefly_authenticated;
GRANT SELECT ON app.usage_logs, app.rate_limits TO briefly_authenticated;
GRANT SELECT ON app.feature_flags TO briefly_authenticated;
GRANT INSERT ON app.feature_flag_usage TO briefly_authenticated;

-- Grant permissions on private schema tables (service role only)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA private TO briefly_service;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO briefly_service, briefly_authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA private TO briefly_service;

-- ============================================================================
-- PHASE 8: Create Utility Functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_app_users_updated_at 
    BEFORE UPDATE ON app.users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_files_updated_at 
    BEFORE UPDATE ON app.files 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_conversations_updated_at 
    BEFORE UPDATE ON app.conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_user_settings_updated_at 
    BEFORE UPDATE ON app.user_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_feature_flags_updated_at 
    BEFORE UPDATE ON app.feature_flags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_private_oauth_tokens_updated_at 
    BEFORE UPDATE ON private.oauth_tokens 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_private_system_config_updated_at 
    BEFORE UPDATE ON private.system_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default encryption key
INSERT INTO private.encryption_keys (id, key_data, algorithm) 
VALUES ('default', encode(gen_random_bytes(32), 'base64'), 'AES-GCM')
ON CONFLICT (id) DO NOTHING;

-- Insert default system configuration
INSERT INTO private.system_config (key, value, description) VALUES
    ('tenant_isolation_enabled', 'true', 'Enable tenant isolation features'),
    ('audit_logging_enabled', 'true', 'Enable comprehensive audit logging'),
    ('rate_limiting_enabled', 'true', 'Enable per-user rate limiting'),
    ('encryption_enabled', 'true', 'Enable OAuth token encryption')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PHASE 9: Create Views for Compatibility
-- ============================================================================

-- Create views in public schema for backward compatibility during migration
CREATE OR REPLACE VIEW public.users AS SELECT * FROM app.users;
CREATE OR REPLACE VIEW public.file_metadata AS SELECT * FROM app.files;
CREATE OR REPLACE VIEW public.document_chunks AS SELECT * FROM app.document_chunks;
CREATE OR REPLACE VIEW public.conversations AS SELECT * FROM app.conversations;
CREATE OR REPLACE VIEW public.chat_messages AS SELECT * FROM app.chat_messages;
CREATE OR REPLACE VIEW public.usage_logs AS SELECT * FROM app.usage_logs;
CREATE OR REPLACE VIEW public.user_settings AS SELECT * FROM app.user_settings;

-- Grant permissions on views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_metadata TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_chunks TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO briefly_authenticated;
GRANT SELECT ON public.usage_logs TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO briefly_authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log the migration completion
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
    'SCHEMA_MIGRATION',
    'database',
    jsonb_build_object(
        'migration', '01-multi-tenant-schema-migration',
        'schemas_created', ARRAY['app', 'private'],
        'rls_enabled', true,
        'completed_at', NOW()
    ),
    'info'
);

COMMENT ON SCHEMA app IS 'Application schema containing tenant-scoped data with RLS policies';
COMMENT ON SCHEMA private IS 'Private schema containing secrets and system data with restricted access';