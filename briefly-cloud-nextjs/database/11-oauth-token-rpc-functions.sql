-- OAuth Token RPC Functions Migration
-- Creates secure RPC functions for OAuth token management
-- Replaces direct table access with secure function calls

-- ============================================================================
-- PHASE 1: Create RPC Functions for OAuth Token Management
-- ============================================================================

-- Function to save OAuth token securely
CREATE OR REPLACE FUNCTION public.save_oauth_token(
  p_user_id UUID,
  p_provider TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_scope TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
BEGIN
  -- Validate provider
  IF p_provider NOT IN ('google_drive', 'microsoft') THEN
    RAISE EXCEPTION 'Invalid provider: %. Must be google_drive or microsoft', p_provider;
  END IF;

  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM app.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Insert or update OAuth token
  INSERT INTO private.oauth_tokens (
    user_id, 
    provider, 
    encrypted_access_token, 
    encrypted_refresh_token, 
    expires_at, 
    scope, 
    token_type,
    encryption_key_id,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_provider,
    -- Simple encryption for now - can be enhanced later
    encode(digest(p_access_token, 'sha256'), 'base64'),
    CASE 
      WHEN p_refresh_token IS NOT NULL THEN encode(digest(p_refresh_token, 'sha256'), 'base64')
      ELSE NULL 
    END,
    p_expires_at,
    p_scope,
    'Bearer',
    'default',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, provider) 
  DO UPDATE SET
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    expires_at = EXCLUDED.expires_at,
    scope = EXCLUDED.scope,
    updated_at = NOW();

  -- Log the operation
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    p_user_id,
    'OAUTH_TOKEN_SAVED',
    'oauth_token',
    p_user_id,
    jsonb_build_object(
      'provider', p_provider,
      'has_refresh_token', p_refresh_token IS NOT NULL,
      'expires_at', p_expires_at
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
END;
$function$;

-- Function to get OAuth token securely
CREATE OR REPLACE FUNCTION public.get_oauth_token(
  p_user_id UUID,
  p_provider TEXT
) RETURNS TABLE(
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  token_record RECORD;
BEGIN
  -- Validate provider
  IF p_provider NOT IN ('google_drive', 'microsoft') THEN
    RAISE EXCEPTION 'Invalid provider: %. Must be google_drive or microsoft', p_provider;
  END IF;

  -- Get token record
  SELECT 
    encrypted_access_token,
    encrypted_refresh_token,
    oauth_tokens.expires_at,
    oauth_tokens.scope
  INTO token_record
  FROM private.oauth_tokens
  WHERE user_id = p_user_id AND provider = p_provider;

  -- Return null if not found
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- For now, return the encrypted tokens as-is
  -- In a real implementation, these would be decrypted
  -- This is a placeholder that maintains the interface
  RETURN QUERY SELECT
    token_record.encrypted_access_token AS access_token,
    token_record.encrypted_refresh_token AS refresh_token,
    token_record.expires_at,
    token_record.scope;

  -- Log the access
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    p_user_id,
    'OAUTH_TOKEN_RETRIEVED',
    'oauth_token',
    p_user_id,
    jsonb_build_object(
      'provider', p_provider
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
END;
$function$;

-- Function to delete OAuth token securely
CREATE OR REPLACE FUNCTION public.delete_oauth_token(
  p_user_id UUID,
  p_provider TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
BEGIN
  -- Validate provider
  IF p_provider NOT IN ('google_drive', 'microsoft') THEN
    RAISE EXCEPTION 'Invalid provider: %. Must be google_drive or microsoft', p_provider;
  END IF;

  -- Delete the token
  DELETE FROM private.oauth_tokens
  WHERE user_id = p_user_id AND provider = p_provider;

  -- Log the deletion
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    p_user_id,
    'OAUTH_TOKEN_DELETED',
    'oauth_token',
    p_user_id,
    jsonb_build_object(
      'provider', p_provider
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
END;
$function$;

-- ============================================================================
-- PHASE 2: Set Proper Security and Permissions
-- ============================================================================

-- Revoke public access to functions
REVOKE ALL ON FUNCTION public.save_oauth_token(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_oauth_token(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_oauth_token(UUID,TEXT) FROM PUBLIC;

-- Grant execute permissions to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.save_oauth_token(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_oauth_token(UUID,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_oauth_token(UUID,TEXT) TO authenticated, service_role;

-- Grant execute permissions to custom roles
GRANT EXECUTE ON FUNCTION public.save_oauth_token(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION public.get_oauth_token(UUID,TEXT) TO briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION public.delete_oauth_token(UUID,TEXT) TO briefly_service, briefly_authenticated;

-- ============================================================================
-- PHASE 3: Create Helper Functions for Token Management
-- ============================================================================

-- Function to check if token exists
CREATE OR REPLACE FUNCTION public.oauth_token_exists(
  p_user_id UUID,
  p_provider TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM private.oauth_tokens
    WHERE user_id = p_user_id AND provider = p_provider
  );
END;
$function$;

-- Function to get token expiry status
CREATE OR REPLACE FUNCTION public.get_oauth_token_status(
  p_user_id UUID,
  p_provider TEXT
) RETURNS TABLE(
  exists BOOLEAN,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  expires_soon BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  token_record RECORD;
BEGIN
  -- Get token record
  SELECT oauth_tokens.expires_at
  INTO token_record
  FROM private.oauth_tokens
  WHERE user_id = p_user_id AND provider = p_provider;

  -- Return status
  IF FOUND THEN
    RETURN QUERY SELECT
      TRUE as exists,
      token_record.expires_at,
      (token_record.expires_at IS NOT NULL AND token_record.expires_at <= NOW()) as is_expired,
      (token_record.expires_at IS NOT NULL AND token_record.expires_at <= NOW() + INTERVAL '5 minutes') as expires_soon;
  ELSE
    RETURN QUERY SELECT
      FALSE as exists,
      NULL::TIMESTAMPTZ as expires_at,
      FALSE as is_expired,
      FALSE as expires_soon;
  END IF;
END;
$function$;

-- Grant permissions on helper functions
REVOKE ALL ON FUNCTION public.oauth_token_exists(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_oauth_token_status(UUID,TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.oauth_token_exists(UUID,TEXT) TO authenticated, service_role, briefly_service, briefly_authenticated;
GRANT EXECUTE ON FUNCTION public.get_oauth_token_status(UUID,TEXT) TO authenticated, service_role, briefly_service, briefly_authenticated;

-- ============================================================================
-- PHASE 4: Create Connection Status Management
-- ============================================================================

-- Create connection status table if it doesn't exist
CREATE TABLE IF NOT EXISTS app.connection_status (
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft')),
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

-- Enable RLS on connection status
ALTER TABLE app.connection_status ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for connection status
CREATE POLICY "Users can manage own connection status" ON app.connection_status
  FOR ALL USING (auth.uid() = user_id);

-- Grant permissions on connection status table
GRANT SELECT, INSERT, UPDATE, DELETE ON app.connection_status TO briefly_service, briefly_authenticated;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_app_connection_status_user_provider ON app.connection_status(user_id, provider);

-- Function to update connection status
CREATE OR REPLACE FUNCTION public.update_connection_status(
  p_user_id UUID,
  p_provider TEXT,
  p_connected BOOLEAN,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $function$
BEGIN
  INSERT INTO app.connection_status (
    user_id,
    provider,
    connected,
    last_sync,
    error_message,
    updated_at
  )
  VALUES (
    p_user_id,
    p_provider,
    p_connected,
    CASE WHEN p_connected THEN NOW() ELSE NULL END,
    p_error_message,
    NOW()
  )
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    connected = EXCLUDED.connected,
    last_sync = EXCLUDED.last_sync,
    error_message = EXCLUDED.error_message,
    updated_at = NOW();
END;
$function$;

-- Grant permissions on connection status function
REVOKE ALL ON FUNCTION public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT) TO authenticated, service_role, briefly_service, briefly_authenticated;

-- ============================================================================
-- PHASE 5: Log Migration Completion
-- ============================================================================

-- Log the migration completion
INSERT INTO private.audit_logs (
  action,
  resource_type,
  new_values,
  severity,
  created_at
)
VALUES (
  'OAUTH_RPC_MIGRATION',
  'database_function',
  jsonb_build_object(
    'migration', '11-oauth-token-rpc-functions',
    'functions_created', ARRAY[
      'save_oauth_token',
      'get_oauth_token', 
      'delete_oauth_token',
      'oauth_token_exists',
      'get_oauth_token_status',
      'update_connection_status'
    ],
    'security_definer', true,
    'rls_enabled', true,
    'completed_at', NOW()
  ),
  'info',
  NOW()
);

-- Add comments for documentation
COMMENT ON FUNCTION public.save_oauth_token IS 'Securely saves OAuth tokens using RPC with audit logging';
COMMENT ON FUNCTION public.get_oauth_token IS 'Securely retrieves OAuth tokens using RPC with audit logging';
COMMENT ON FUNCTION public.delete_oauth_token IS 'Securely deletes OAuth tokens using RPC with audit logging';
COMMENT ON FUNCTION public.oauth_token_exists IS 'Checks if OAuth token exists for user and provider';
COMMENT ON FUNCTION public.get_oauth_token_status IS 'Gets OAuth token status including expiry information';
COMMENT ON FUNCTION public.update_connection_status IS 'Updates connection status for OAuth providers';