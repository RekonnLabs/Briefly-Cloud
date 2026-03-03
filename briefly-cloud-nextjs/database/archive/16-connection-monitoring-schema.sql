-- Connection Monitoring Schema
-- Adds tables and functions for monitoring Apideck connection health

-- Create monitoring_alerts table for tracking connection issues
CREATE TABLE IF NOT EXISTS app.monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('connection_expired', 'connection_invalid', 'connection_error', 'health_check_failed')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    provider TEXT CHECK (provider IN ('google', 'microsoft')),
    connection_id TEXT,
    message TEXT NOT NULL,
    details JSONB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_user_id ON app.monitoring_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_created_at ON app.monitoring_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_severity ON app.monitoring_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_resolved ON app.monitoring_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_provider ON app.monitoring_alerts(provider);

-- Enable RLS on monitoring_alerts table
ALTER TABLE app.monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for monitoring_alerts
CREATE POLICY "Users can manage their own monitoring alerts" 
ON app.monitoring_alerts 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Grant permissions to authenticated role
GRANT ALL ON app.monitoring_alerts TO authenticated;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION app.update_monitoring_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_monitoring_alerts_updated_at ON app.monitoring_alerts;
CREATE TRIGGER trigger_monitoring_alerts_updated_at
    BEFORE UPDATE ON app.monitoring_alerts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_monitoring_alerts_updated_at();

-- Create connection_health_checks table for tracking health check history
CREATE TABLE IF NOT EXISTS app.connection_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    connection_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'expired', 'invalid', 'error')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for health checks
CREATE INDEX IF NOT EXISTS idx_connection_health_checks_user_id ON app.connection_health_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_health_checks_checked_at ON app.connection_health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_health_checks_provider ON app.connection_health_checks(provider);
CREATE INDEX IF NOT EXISTS idx_connection_health_checks_status ON app.connection_health_checks(status);

-- Enable RLS on connection_health_checks table
ALTER TABLE app.connection_health_checks ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for connection_health_checks
CREATE POLICY "Users can manage their own health checks" 
ON app.connection_health_checks 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Grant permissions to authenticated role
GRANT ALL ON app.connection_health_checks TO authenticated;

-- Create function to clean up old health check records (keep last 100 per user/provider)
CREATE OR REPLACE FUNCTION app.cleanup_old_health_checks()
RETURNS void AS $$
BEGIN
    -- Delete old health check records, keeping only the latest 100 per user/provider combination
    DELETE FROM app.connection_health_checks
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, provider, connection_id 
                       ORDER BY checked_at DESC
                   ) as rn
            FROM app.connection_health_checks
        ) ranked
        WHERE rn > 100
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to get connection health summary for a user
CREATE OR REPLACE FUNCTION app.get_connection_health_summary(target_user_id UUID)
RETURNS TABLE (
    provider TEXT,
    connection_id TEXT,
    current_status TEXT,
    last_healthy TIMESTAMPTZ,
    last_checked TIMESTAMPTZ,
    error_count_24h BIGINT,
    avg_response_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hc.provider,
        hc.connection_id,
        (
            SELECT status 
            FROM app.connection_health_checks 
            WHERE user_id = target_user_id 
              AND provider = hc.provider 
              AND connection_id = hc.connection_id
            ORDER BY checked_at DESC 
            LIMIT 1
        ) as current_status,
        (
            SELECT MAX(checked_at) 
            FROM app.connection_health_checks 
            WHERE user_id = target_user_id 
              AND provider = hc.provider 
              AND connection_id = hc.connection_id
              AND status = 'healthy'
        ) as last_healthy,
        MAX(hc.checked_at) as last_checked,
        (
            SELECT COUNT(*) 
            FROM app.connection_health_checks 
            WHERE user_id = target_user_id 
              AND provider = hc.provider 
              AND connection_id = hc.connection_id
              AND status IN ('error', 'invalid')
              AND checked_at > NOW() - INTERVAL '24 hours'
        ) as error_count_24h,
        AVG(hc.response_time_ms) as avg_response_time_ms
    FROM app.connection_health_checks hc
    WHERE hc.user_id = target_user_id
    GROUP BY hc.provider, hc.connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION app.get_connection_health_summary(UUID) TO authenticated;

-- Create function to record a health check
CREATE OR REPLACE FUNCTION app.record_health_check(
    target_user_id UUID,
    check_provider TEXT,
    check_connection_id TEXT,
    check_status TEXT,
    check_response_time_ms INTEGER DEFAULT NULL,
    check_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    check_id UUID;
BEGIN
    INSERT INTO app.connection_health_checks (
        user_id,
        provider,
        connection_id,
        status,
        response_time_ms,
        error_message
    ) VALUES (
        target_user_id,
        check_provider,
        check_connection_id,
        check_status,
        check_response_time_ms,
        check_error_message
    ) RETURNING id INTO check_id;
    
    RETURN check_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION app.record_health_check(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE app.monitoring_alerts IS 'Stores alerts generated by connection monitoring system';
COMMENT ON TABLE app.connection_health_checks IS 'Stores historical health check results for connections';
COMMENT ON FUNCTION app.get_connection_health_summary(UUID) IS 'Returns health summary for all connections of a user';
COMMENT ON FUNCTION app.record_health_check(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) IS 'Records a new health check result';
COMMENT ON FUNCTION app.cleanup_old_health_checks() IS 'Cleans up old health check records to prevent table bloat';