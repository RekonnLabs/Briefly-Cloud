-- Security Monitoring Database Schema
-- Tables for real-time security event monitoring and alerting

-- Security events table for real-time monitoring
CREATE TABLE IF NOT EXISTS private.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source TEXT NOT NULL,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security alerts table for triggered alerts
CREATE TABLE IF NOT EXISTS private.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security metrics aggregation table
CREATE TABLE IF NOT EXISTS private.security_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Threat intelligence table
CREATE TABLE IF NOT EXISTS private.threat_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  threat_type TEXT NOT NULL,
  threat_level TEXT NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  source TEXT NOT NULL,
  description TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  event_count INTEGER DEFAULT 1,
  blocked BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'
);

-- Security configuration drift detection
CREATE TABLE IF NOT EXISTS private.security_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  config_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON private.security_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON private.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_created ON private.security_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON private.security_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_alerts_severity_created ON private.security_alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_acknowledged ON private.security_alerts(acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON private.security_alerts(resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_metrics_type_recorded ON private.security_metrics(metric_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_threat_intelligence_ip ON private.threat_intelligence(ip_address);
CREATE INDEX IF NOT EXISTS idx_threat_intelligence_level_seen ON private.threat_intelligence(threat_level, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_security_config_type_created ON private.security_config_snapshots(config_type, created_at DESC);

-- Row Level Security policies
ALTER TABLE private.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.security_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.threat_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.security_config_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin-only access policies
CREATE POLICY "Admin access to security events" ON private.security_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
    )
  );

CREATE POLICY "Admin access to security alerts" ON private.security_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
    )
  );

CREATE POLICY "Admin access to security metrics" ON private.security_metrics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
    )
  );

CREATE POLICY "Admin access to threat intelligence" ON private.threat_intelligence
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
    )
  );

CREATE POLICY "Admin access to security config snapshots" ON private.security_config_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app.users 
      WHERE id = auth.uid() 
      AND email LIKE '%@rekonnlabs.com'
    )
  );

-- Functions for security monitoring

-- Function to get security metrics summary
CREATE OR REPLACE FUNCTION get_security_metrics_summary(
  time_window INTERVAL DEFAULT '1 hour'::INTERVAL
)
RETURNS TABLE (
  metric_type TEXT,
  total_count BIGINT,
  avg_value NUMERIC,
  max_value NUMERIC,
  min_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT 
    sm.metric_type,
    COUNT(*) as total_count,
    AVG(sm.metric_value) as avg_value,
    MAX(sm.metric_value) as max_value,
    MIN(sm.metric_value) as min_value
  FROM private.security_metrics sm
  WHERE sm.recorded_at >= NOW() - time_window
  GROUP BY sm.metric_type
  ORDER BY total_count DESC;
END;
$;

-- Function to get security events by type
CREATE OR REPLACE FUNCTION get_security_events_by_type(
  time_window INTERVAL DEFAULT '1 hour'::INTERVAL
)
RETURNS TABLE (
  event_type TEXT,
  event_count BIGINT,
  unique_users BIGINT,
  unique_ips BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT 
    se.type as event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT se.user_id) as unique_users,
    COUNT(DISTINCT se.ip_address) as unique_ips
  FROM private.security_events se
  WHERE se.created_at >= NOW() - time_window
  GROUP BY se.type
  ORDER BY event_count DESC;
END;
$;

-- Function to detect anomalous activity
CREATE OR REPLACE FUNCTION detect_security_anomalies(
  threshold_multiplier NUMERIC DEFAULT 3.0
)
RETURNS TABLE (
  anomaly_type TEXT,
  current_value NUMERIC,
  baseline_avg NUMERIC,
  threshold_value NUMERIC,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  -- This is a simplified anomaly detection
  -- In production, this would use more sophisticated algorithms
  
  RETURN QUERY
  WITH baseline AS (
    SELECT 
      type,
      AVG(hourly_count) as avg_hourly_count,
      STDDEV(hourly_count) as stddev_hourly_count
    FROM (
      SELECT 
        type,
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as hourly_count
      FROM private.security_events
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND created_at < NOW() - INTERVAL '1 hour'
      GROUP BY type, DATE_TRUNC('hour', created_at)
    ) hourly_data
    GROUP BY type
  ),
  current_hour AS (
    SELECT 
      type,
      COUNT(*) as current_count
    FROM private.security_events
    WHERE created_at >= DATE_TRUNC('hour', NOW())
    GROUP BY type
  )
  SELECT 
    ch.type as anomaly_type,
    ch.current_count as current_value,
    b.avg_hourly_count as baseline_avg,
    b.avg_hourly_count + (threshold_multiplier * COALESCE(b.stddev_hourly_count, 0)) as threshold_value,
    CASE 
      WHEN ch.current_count > b.avg_hourly_count + (threshold_multiplier * COALESCE(b.stddev_hourly_count, 0)) THEN 'high'
      WHEN ch.current_count > b.avg_hourly_count + (2 * COALESCE(b.stddev_hourly_count, 0)) THEN 'medium'
      ELSE 'low'
    END as severity
  FROM current_hour ch
  JOIN baseline b ON ch.type = b.type
  WHERE ch.current_count > b.avg_hourly_count + (threshold_multiplier * COALESCE(b.stddev_hourly_count, 0));
END;
$;

-- Function to update threat intelligence
CREATE OR REPLACE FUNCTION update_threat_intelligence(
  p_ip_address INET,
  p_threat_type TEXT,
  p_threat_level TEXT,
  p_source TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  threat_id UUID;
BEGIN
  -- Insert or update threat intelligence
  INSERT INTO private.threat_intelligence (
    ip_address,
    threat_type,
    threat_level,
    source,
    description,
    last_seen,
    event_count
  ) VALUES (
    p_ip_address,
    p_threat_type,
    p_threat_level,
    p_source,
    p_description,
    NOW(),
    1
  )
  ON CONFLICT (ip_address, threat_type) 
  DO UPDATE SET
    threat_level = CASE 
      WHEN EXCLUDED.threat_level = 'critical' THEN 'critical'
      WHEN EXCLUDED.threat_level = 'high' AND threat_intelligence.threat_level != 'critical' THEN 'high'
      WHEN EXCLUDED.threat_level = 'medium' AND threat_intelligence.threat_level NOT IN ('critical', 'high') THEN 'medium'
      ELSE threat_intelligence.threat_level
    END,
    last_seen = NOW(),
    event_count = threat_intelligence.event_count + 1,
    description = COALESCE(EXCLUDED.description, threat_intelligence.description)
  RETURNING id INTO threat_id;

  RETURN threat_id;
END;
$;

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip_address INET)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM private.threat_intelligence 
    WHERE ip_address = p_ip_address 
      AND blocked = TRUE
      AND threat_level IN ('high', 'critical')
  );
END;
$;

-- Trigger to automatically create security metrics
CREATE OR REPLACE FUNCTION security_event_metrics_trigger()
RETURNS TRIGGER AS $
BEGIN
  -- Insert metric for event count
  INSERT INTO private.security_metrics (
    metric_type,
    metric_value,
    metadata
  ) VALUES (
    'security_event_' || NEW.type,
    1,
    jsonb_build_object(
      'event_id', NEW.id,
      'severity', NEW.severity,
      'source', NEW.source
    )
  );

  -- Update threat intelligence if applicable
  IF NEW.ip_address IS NOT NULL AND NEW.severity IN ('high', 'critical') THEN
    PERFORM update_threat_intelligence(
      NEW.ip_address,
      NEW.type,
      NEW.severity,
      NEW.source,
      'Automatic threat detection from security event'
    );
  END IF;

  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS security_event_metrics_trigger ON private.security_events;
CREATE TRIGGER security_event_metrics_trigger
  AFTER INSERT ON private.security_events
  FOR EACH ROW EXECUTE FUNCTION security_event_metrics_trigger();

-- Function to cleanup old security data
CREATE OR REPLACE FUNCTION cleanup_security_data(
  events_retention_days INTEGER DEFAULT 30,
  metrics_retention_days INTEGER DEFAULT 90,
  alerts_retention_days INTEGER DEFAULT 365
)
RETURNS TABLE (
  table_name TEXT,
  deleted_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  events_deleted BIGINT;
  metrics_deleted BIGINT;
  alerts_deleted BIGINT;
BEGIN
  -- Delete old security events
  DELETE FROM private.security_events 
  WHERE created_at < NOW() - (events_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS events_deleted = ROW_COUNT;

  -- Delete old security metrics
  DELETE FROM private.security_metrics 
  WHERE recorded_at < NOW() - (metrics_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS metrics_deleted = ROW_COUNT;

  -- Delete old resolved security alerts
  DELETE FROM private.security_alerts 
  WHERE resolved = TRUE 
    AND resolved_at < NOW() - (alerts_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS alerts_deleted = ROW_COUNT;

  -- Return results
  RETURN QUERY VALUES 
    ('security_events', events_deleted),
    ('security_metrics', metrics_deleted),
    ('security_alerts', alerts_deleted);
END;
$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA private TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;