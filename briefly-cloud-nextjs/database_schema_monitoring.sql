-- Monitoring and Analytics Database Schema
-- This schema includes all tables needed for comprehensive monitoring and analytics

-- Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event VARCHAR(255) NOT NULL,
    properties JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_analytics_events_user_id (user_id),
    INDEX idx_analytics_events_event (event),
    INDEX idx_analytics_events_timestamp (timestamp),
    INDEX idx_analytics_events_session_id (session_id)
);

-- User Analytics Table
CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    page_views INTEGER DEFAULT 0,
    time_on_site INTEGER DEFAULT 0, -- in seconds
    features_used TEXT[] DEFAULT '{}',
    conversion_funnel TEXT[] DEFAULT '{}',
    device_info JSONB DEFAULT '{}',
    location JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_user_analytics_user_id (user_id),
    INDEX idx_user_analytics_session_id (session_id),
    INDEX idx_user_analytics_timestamp (timestamp)
);

-- Performance Metrics Table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_load_time INTEGER DEFAULT 0, -- in milliseconds
    api_response_time INTEGER DEFAULT 0, -- in milliseconds
    database_query_time INTEGER DEFAULT 0, -- in milliseconds
    cache_hit_rate DECIMAL(5,2) DEFAULT 0, -- percentage
    memory_usage DECIMAL(5,2) DEFAULT 0, -- percentage
    cpu_usage DECIMAL(5,2) DEFAULT 0, -- percentage
    error_rate DECIMAL(5,2) DEFAULT 0, -- percentage
    active_users INTEGER DEFAULT 0,
    requests_per_minute INTEGER DEFAULT 0,
    core_web_vitals JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_performance_metrics_timestamp (timestamp),
    INDEX idx_performance_metrics_error_rate (error_rate),
    INDEX idx_performance_metrics_memory_usage (memory_usage),
    INDEX idx_performance_metrics_cpu_usage (cpu_usage)
);

-- Error Logs Table
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    stack TEXT,
    context JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    error_type VARCHAR(100) DEFAULT 'unknown',
    url TEXT,
    user_agent TEXT,
    ip_address INET,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_error_logs_severity (severity),
    INDEX idx_error_logs_error_type (error_type),
    INDEX idx_error_logs_timestamp (timestamp),
    INDEX idx_error_logs_user_id (user_id),
    INDEX idx_error_logs_session_id (session_id)
);

-- Monitoring Alerts Table
CREATE TABLE IF NOT EXISTS monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    metrics JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_monitoring_alerts_severity (severity),
    INDEX idx_monitoring_alerts_status (status),
    INDEX idx_monitoring_alerts_timestamp (timestamp),
    INDEX idx_monitoring_alerts_type (type)
);

-- Stripe Webhook Logs Table
CREATE TABLE IF NOT EXISTS stripe_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    payload JSONB NOT NULL,
    error_message TEXT,
    processing_time INTEGER, -- in milliseconds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    -- Indexes for performance
    INDEX idx_stripe_webhook_logs_event_type (event_type),
    INDEX idx_stripe_webhook_logs_status (status),
    INDEX idx_stripe_webhook_logs_created_at (created_at)
);

-- API Usage Logs Table
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER NOT NULL, -- in milliseconds
    request_size INTEGER DEFAULT 0, -- in bytes
    response_size INTEGER DEFAULT 0, -- in bytes
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_api_usage_logs_user_id (user_id),
    INDEX idx_api_usage_logs_endpoint (endpoint),
    INDEX idx_api_usage_logs_status_code (status_code),
    INDEX idx_api_usage_logs_created_at (created_at)
);

-- Core Web Vitals Table
CREATE TABLE IF NOT EXISTS core_web_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    page_url TEXT NOT NULL,
    lcp DECIMAL(10,2), -- Largest Contentful Paint
    fid DECIMAL(10,2), -- First Input Delay
    cls DECIMAL(10,4), -- Cumulative Layout Shift
    ttfb DECIMAL(10,2), -- Time to First Byte
    fcp DECIMAL(10,2), -- First Contentful Paint
    device_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_core_web_vitals_user_id (user_id),
    INDEX idx_core_web_vitals_session_id (session_id),
    INDEX idx_core_web_vitals_page_url (page_url),
    INDEX idx_core_web_vitals_created_at (created_at)
);

-- Feature Usage Tracking Table
CREATE TABLE IF NOT EXISTS feature_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    properties JSONB DEFAULT '{}',
    session_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_feature_usage_user_id (user_id),
    INDEX idx_feature_usage_feature_name (feature_name),
    INDEX idx_feature_usage_action (action),
    INDEX idx_feature_usage_created_at (created_at)
);

-- Conversion Funnel Table
CREATE TABLE IF NOT EXISTS conversion_funnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    funnel_name VARCHAR(100) NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    step_order INTEGER NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    time_to_complete INTEGER, -- in seconds
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_conversion_funnel_user_id (user_id),
    INDEX idx_conversion_funnel_funnel_name (funnel_name),
    INDEX idx_conversion_funnel_step_name (step_name),
    INDEX idx_conversion_funnel_completed (completed)
);

-- Row Level Security (RLS) Policies

-- Analytics Events RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics events" ON analytics_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all analytics events" ON analytics_events
    FOR ALL USING (auth.role() = 'service_role');

-- User Analytics RLS
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics" ON user_analytics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all user analytics" ON user_analytics
    FOR ALL USING (auth.role() = 'service_role');

-- Performance Metrics RLS (admin only)
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage performance metrics" ON performance_metrics
    FOR ALL USING (auth.role() = 'service_role');

-- Error Logs RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own error logs" ON error_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all error logs" ON error_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Monitoring Alerts RLS (admin only)
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage monitoring alerts" ON monitoring_alerts
    FOR ALL USING (auth.role() = 'service_role');

-- Stripe Webhook Logs RLS (admin only)
ALTER TABLE stripe_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage webhook logs" ON stripe_webhook_logs
    FOR ALL USING (auth.role() = 'service_role');

-- API Usage Logs RLS
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API usage" ON api_usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all API usage logs" ON api_usage_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Core Web Vitals RLS
ALTER TABLE core_web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own web vitals" ON core_web_vitals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all web vitals" ON core_web_vitals
    FOR ALL USING (auth.role() = 'service_role');

-- Feature Usage RLS
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own feature usage" ON feature_usage
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all feature usage" ON feature_usage
    FOR ALL USING (auth.role() = 'service_role');

-- Conversion Funnel RLS
ALTER TABLE conversion_funnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversion data" ON conversion_funnel
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all conversion data" ON conversion_funnel
    FOR ALL USING (auth.role() = 'service_role');

-- Cleanup Functions

-- Function to cleanup old analytics data
CREATE OR REPLACE FUNCTION cleanup_old_analytics_data()
RETURNS void AS $$
BEGIN
    -- Cleanup analytics events older than 90 days
    DELETE FROM analytics_events 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Cleanup user analytics older than 90 days
    DELETE FROM user_analytics 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Cleanup performance metrics older than 30 days
    DELETE FROM performance_metrics 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Cleanup error logs older than 30 days (keep critical for 90 days)
    DELETE FROM error_logs 
    WHERE created_at < NOW() - INTERVAL '30 days' 
    AND severity != 'critical';
    
    DELETE FROM error_logs 
    WHERE created_at < NOW() - INTERVAL '90 days' 
    AND severity = 'critical';
    
    -- Cleanup resolved alerts older than 7 days
    DELETE FROM monitoring_alerts 
    WHERE status IN ('resolved', 'dismissed') 
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Cleanup webhook logs older than 30 days
    DELETE FROM stripe_webhook_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Cleanup API usage logs older than 30 days
    DELETE FROM api_usage_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Cleanup core web vitals older than 90 days
    DELETE FROM core_web_vitals 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Cleanup feature usage older than 90 days
    DELETE FROM feature_usage 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Cleanup conversion funnel data older than 90 days
    DELETE FROM conversion_funnel 
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (runs daily)
SELECT cron.schedule(
    'cleanup-analytics-data',
    '0 2 * * *', -- Daily at 2 AM
    'SELECT cleanup_old_analytics_data();'
);

-- Views for Analytics

-- Daily Analytics Summary View
CREATE OR REPLACE VIEW daily_analytics_summary AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_events,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT session_id) as unique_sessions,
    AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY session_id ORDER BY created_at)))) as avg_session_duration
FROM analytics_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Performance Metrics Summary View
CREATE OR REPLACE VIEW performance_summary AS
SELECT 
    DATE(created_at) as date,
    AVG(page_load_time) as avg_page_load_time,
    AVG(api_response_time) as avg_api_response_time,
    AVG(database_query_time) as avg_database_query_time,
    AVG(cache_hit_rate) as avg_cache_hit_rate,
    AVG(memory_usage) as avg_memory_usage,
    AVG(cpu_usage) as avg_cpu_usage,
    AVG(error_rate) as avg_error_rate,
    MAX(active_users) as peak_active_users,
    SUM(requests_per_minute) as total_requests
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Error Summary View
CREATE OR REPLACE VIEW error_summary AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_errors,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_errors,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_errors,
    COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_errors,
    COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_errors,
    COUNT(DISTINCT error_type) as unique_error_types,
    COUNT(DISTINCT user_id) as affected_users
FROM error_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Feature Usage Summary View
CREATE OR REPLACE VIEW feature_usage_summary AS
SELECT 
    feature_name,
    action,
    COUNT(*) as usage_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT session_id) as unique_sessions,
    DATE(created_at) as date
FROM feature_usage
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY feature_name, action, DATE(created_at)
ORDER BY date DESC, usage_count DESC;
