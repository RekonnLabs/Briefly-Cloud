-- Connection Status Schema
-- Tracks cloud storage provider connection status for users

-- Connection status tracking table
CREATE TABLE IF NOT EXISTS connection_status (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft')),
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_connection_status_user_id ON connection_status(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_status_provider ON connection_status(provider);
CREATE INDEX IF NOT EXISTS idx_connection_status_connected ON connection_status(connected);

-- RLS policies for connection status
ALTER TABLE connection_status ENABLE ROW LEVEL SECURITY;

-- Users can only see their own connection status
CREATE POLICY "Users can view own connection status" ON connection_status
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own connection status
CREATE POLICY "Users can update own connection status" ON connection_status
  FOR ALL USING (auth.uid() = user_id);

-- Function to update connection status
CREATE OR REPLACE FUNCTION public.update_connection_status(
  p_user_id UUID,
  p_provider TEXT,
  p_connected BOOLEAN,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO connection_status (
    user_id, provider, connected, error_message, last_sync, updated_at
  )
  VALUES (
    p_user_id, p_provider, p_connected, p_error_message, 
    CASE WHEN p_connected THEN NOW() ELSE NULL END,
    NOW()
  )
  ON CONFLICT (user_id, provider) 
  DO UPDATE SET
    connected = EXCLUDED.connected,
    error_message = EXCLUDED.error_message,
    last_sync = CASE WHEN EXCLUDED.connected THEN NOW() ELSE connection_status.last_sync END,
    updated_at = NOW();
END;
$$;

-- Function to get connection status for a user
CREATE OR REPLACE FUNCTION public.get_connection_status(
  p_user_id UUID
) RETURNS TABLE(
  provider TEXT,
  connected BOOLEAN,
  last_sync TIMESTAMPTZ,
  error_message TEXT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT provider, connected, last_sync, error_message
  FROM connection_status
  WHERE user_id = p_user_id;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_connection_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_connection_status(UUID) TO authenticated, service_role;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_connection_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER connection_status_updated_at
  BEFORE UPDATE ON connection_status
  FOR EACH ROW
  EXECUTE FUNCTION update_connection_status_updated_at();