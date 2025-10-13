-- Fix RLS policies and permissions for app.apideck_connections table
-- This migration addresses the Google Drive Vault integration issues

-- ============================================================================
-- PHASE 1: Enable Row Level Security
-- ============================================================================

-- Enable RLS on the apideck_connections table
ALTER TABLE app.apideck_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 2: Create RLS Policies
-- ============================================================================

-- Policy: Users can manage their own apideck connections
CREATE POLICY "Users can manage own apideck connections" ON app.apideck_connections
  FOR ALL 
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can access all apideck connections (for admin operations)
CREATE POLICY "Service can access all apideck connections" ON app.apideck_connections
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PHASE 3: Grant Table Permissions
-- ============================================================================

-- Grant permissions to briefly_authenticated role (used by authenticated users)
GRANT SELECT, INSERT, UPDATE, DELETE ON app.apideck_connections TO briefly_authenticated;

-- Grant permissions to briefly_service role (used by service operations)
GRANT ALL PRIVILEGES ON app.apideck_connections TO briefly_service;

-- ============================================================================
-- PHASE 4: Verification and Logging
-- ============================================================================

-- Verify RLS is enabled
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' 
        AND c.relname = 'apideck_connections' 
        AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not properly enabled on app.apideck_connections';
    END IF;
    
    RAISE NOTICE 'RLS successfully enabled on app.apideck_connections';
END
$;

-- Verify policies exist
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Users can manage own apideck connections'
    ) THEN
        RAISE EXCEPTION 'User policy not found on app.apideck_connections';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Service can access all apideck connections'
    ) THEN
        RAISE EXCEPTION 'Service policy not found on app.apideck_connections';
    END IF;
    
    RAISE NOTICE 'RLS policies successfully created on app.apideck_connections';
END
$;

-- Log the migration completion
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
    'APIDECK_CONNECTIONS_RLS_FIX',
    'database',
    jsonb_build_object(
        'table', 'app.apideck_connections',
        'rls_enabled', true,
        'policies_created', ARRAY['Users can manage own apideck connections', 'Service can access all apideck connections'],
        'permissions_granted', ARRAY['briefly_authenticated', 'briefly_service'],
        'completed_at', NOW()
    ),
    'info'
);

-- ============================================================================
-- PHASE 5: Create Helper Function for Connection Validation
-- ============================================================================

-- Function to validate user has access to a specific connection
CREATE OR REPLACE FUNCTION app.validate_apideck_connection_access(
    p_user_id UUID,
    p_provider TEXT
)
RETURNS BOOLEAN AS $
DECLARE
    connection_exists BOOLEAN := FALSE;
BEGIN
    -- Check if user has access to the connection
    SELECT EXISTS(
        SELECT 1 FROM app.apideck_connections 
        WHERE user_id = p_user_id 
        AND provider = p_provider
        AND status = 'connected'
    ) INTO connection_exists;
    
    RETURN connection_exists;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the validation function
GRANT EXECUTE ON FUNCTION app.validate_apideck_connection_access(UUID, TEXT) TO briefly_authenticated, briefly_service;

-- Add comment for documentation
COMMENT ON FUNCTION app.validate_apideck_connection_access(UUID, TEXT) IS 'Validates if a user has access to a specific Apideck connection';

-- ============================================================================
-- PHASE 6: Create Connection Status Helper Function
-- ============================================================================

-- Function to get connection status for a user
CREATE OR REPLACE FUNCTION app.get_user_apideck_connections(p_user_id UUID)
RETURNS TABLE (
    provider TEXT,
    consumer_id TEXT,
    connection_id TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        ac.provider,
        ac.consumer_id,
        ac.connection_id,
        ac.status,
        ac.created_at,
        ac.updated_at
    FROM app.apideck_connections ac
    WHERE ac.user_id = p_user_id
    ORDER BY ac.created_at DESC;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the status function
GRANT EXECUTE ON FUNCTION app.get_user_apideck_connections(UUID) TO briefly_authenticated, briefly_service;

-- Add comment for documentation
COMMENT ON FUNCTION app.get_user_apideck_connections(UUID) IS 'Returns all Apideck connections for a specific user';

-- ============================================================================
-- ROLLBACK PROCEDURES (for reference)
-- ============================================================================

/*
-- To rollback this migration if needed:

-- Drop the helper functions
DROP FUNCTION IF EXISTS app.validate_apideck_connection_access(UUID, TEXT);
DROP FUNCTION IF EXISTS app.get_user_apideck_connections(UUID);

-- Drop the RLS policies
DROP POLICY IF EXISTS "Users can manage own apideck connections" ON app.apideck_connections;
DROP POLICY IF EXISTS "Service can access all apideck connections" ON app.apideck_connections;

-- Disable RLS
ALTER TABLE app.apideck_connections DISABLE ROW LEVEL SECURITY;

-- Revoke permissions
REVOKE ALL ON app.apideck_connections FROM briefly_authenticated;
REVOKE ALL ON app.apideck_connections FROM briefly_service;
*/

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Apideck Connections RLS Fix Migration Completed Successfully';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Changes applied:';
    RAISE NOTICE '- Enabled RLS on app.apideck_connections table';
    RAISE NOTICE '- Created user access policy for authenticated users';
    RAISE NOTICE '- Created service access policy for admin operations';
    RAISE NOTICE '- Granted proper permissions to briefly_authenticated role';
    RAISE NOTICE '- Granted proper permissions to briefly_service role';
    RAISE NOTICE '- Created helper functions for connection validation';
    RAISE NOTICE '- Added audit logging for migration tracking';
    RAISE NOTICE '=================================================================';
END
$;