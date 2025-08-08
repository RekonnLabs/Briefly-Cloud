-- Feature Flags and Staged Rollout System Database Schema
-- This schema supports feature flags, A/B testing, and beta user management

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    user_tiers TEXT[] DEFAULT '{}', -- Array of subscription tiers: 'free', 'pro', 'pro_byok'
    beta_users TEXT[] DEFAULT '{}', -- Array of user IDs with beta access
    ab_test_config JSONB, -- A/B test configuration
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feature flag usage tracking for analytics
CREATE TABLE IF NOT EXISTS feature_flag_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name VARCHAR(100) NOT NULL,
    user_id UUID,
    enabled BOOLEAN NOT NULL,
    variant VARCHAR(50), -- A/B test variant name
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add beta user flag to users table (if not exists)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_beta_user BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX IF NOT EXISTS idx_feature_flag_usage_feature_name ON feature_flag_usage(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_flag_usage_user_id ON feature_flag_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_usage_timestamp ON feature_flag_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_users_is_beta_user ON users(is_beta_user) WHERE is_beta_user = TRUE;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_flag_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_flag_updated_at();

-- Insert default feature flags for the application
INSERT INTO feature_flags (name, description, enabled, rollout_percentage, user_tiers) VALUES
    ('vector_search_v2', 'Enhanced vector search with improved accuracy', FALSE, 0, '{}'),
    ('advanced_chunking', 'Advanced document chunking algorithm', FALSE, 0, '{"pro", "pro_byok"}'),
    ('real_time_chat', 'Real-time chat with streaming responses', FALSE, 0, '{}'),
    ('google_drive_v2', 'Enhanced Google Drive integration', FALSE, 0, '{}'),
    ('onedrive_integration', 'Microsoft OneDrive integration', FALSE, 0, '{}'),
    ('dropbox_integration', 'Dropbox cloud storage integration', FALSE, 0, '{"pro", "pro_byok"}'),
    ('gpt4_turbo', 'GPT-4 Turbo model access', TRUE, 100, '{"pro", "pro_byok"}'),
    ('custom_models', 'Custom AI model support', FALSE, 0, '{"pro_byok"}'),
    ('function_calling', 'AI function calling capabilities', FALSE, 0, '{"pro", "pro_byok"}'),
    ('new_dashboard', 'Redesigned user dashboard', FALSE, 10, '{}'),
    ('dark_mode', 'Dark mode theme support', TRUE, 100, '{}'),
    ('mobile_app', 'Mobile application features', FALSE, 0, '{}'),
    ('edge_caching', 'Edge caching for improved performance', FALSE, 0, '{}'),
    ('streaming_responses', 'Streaming AI responses', TRUE, 50, '{}'),
    ('collaboration', 'Document collaboration features', FALSE, 0, '{"pro", "pro_byok"}'),
    ('api_access', 'REST API access for developers', FALSE, 0, '{"pro_byok"}'),
    ('webhooks', 'Webhook notifications', FALSE, 0, '{"pro", "pro_byok"}')
ON CONFLICT (name) DO NOTHING;

-- Example A/B test configuration for new_dashboard feature
UPDATE feature_flags 
SET ab_test_config = '{
    "test_name": "dashboard_redesign_v1",
    "variants": [
        {
            "name": "control",
            "description": "Current dashboard design",
            "config": {"theme": "current", "layout": "sidebar"}
        },
        {
            "name": "variant_a",
            "description": "New dashboard with top navigation",
            "config": {"theme": "modern", "layout": "topnav"}
        },
        {
            "name": "variant_b", 
            "description": "New dashboard with card layout",
            "config": {"theme": "modern", "layout": "cards"}
        }
    ],
    "traffic_split": {
        "control": 50,
        "variant_a": 25,
        "variant_b": 25
    },
    "metrics": ["user_engagement", "task_completion", "time_on_page"],
    "start_date": "2025-01-01T00:00:00Z",
    "end_date": "2025-02-01T00:00:00Z"
}'::jsonb
WHERE name = 'new_dashboard';

-- Create a view for feature flag analytics
CREATE OR REPLACE VIEW feature_flag_analytics AS
SELECT 
    ff.name,
    ff.description,
    ff.enabled,
    ff.rollout_percentage,
    COUNT(ffu.id) as total_checks,
    COUNT(CASE WHEN ffu.enabled THEN 1 END) as enabled_checks,
    COUNT(DISTINCT ffu.user_id) as unique_users,
    ROUND(
        (COUNT(CASE WHEN ffu.enabled THEN 1 END)::DECIMAL / NULLIF(COUNT(ffu.id), 0)) * 100, 
        2
    ) as success_rate,
    ff.created_at,
    ff.updated_at
FROM feature_flags ff
LEFT JOIN feature_flag_usage ffu ON ff.name = ffu.feature_name
GROUP BY ff.id, ff.name, ff.description, ff.enabled, ff.rollout_percentage, ff.created_at, ff.updated_at
ORDER BY ff.created_at DESC;

-- Create a function to clean up old usage data (optional, for data retention)
CREATE OR REPLACE FUNCTION cleanup_old_feature_flag_usage(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM feature_flag_usage 
    WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags TO your_app_user;
-- GRANT SELECT, INSERT ON feature_flag_usage TO your_app_user;
-- GRANT SELECT ON feature_flag_analytics TO your_app_user;