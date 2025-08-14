-- Role Permissions Setup for Multi-Tenant Security
-- This file configures database roles and their permissions for the multi-tenant architecture

-- ============================================================================
-- ROLE DEFINITIONS AND PERMISSIONS
-- ============================================================================

-- Service Role (Full Access)
-- Used by API routes that need to perform administrative operations
GRANT ALL PRIVILEGES ON SCHEMA app TO briefly_service;
GRANT ALL PRIVILEGES ON SCHEMA private TO briefly_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app TO briefly_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA private TO briefly_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app TO briefly_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA private TO briefly_service;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA app TO briefly_service;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA private TO briefly_service;

-- Authenticated Role (User Operations)
-- Used by authenticated users through RLS policies
GRANT USAGE ON SCHEMA app TO briefly_authenticated;

-- Table-specific permissions for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.files TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.document_chunks TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.conversations TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.chat_messages TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_settings TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.consent_records TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.data_export_requests TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.data_deletion_requests TO briefly_authenticated;

-- Read-only access to system tables
GRANT SELECT ON app.feature_flags TO briefly_authenticated;
GRANT SELECT ON app.usage_logs TO briefly_authenticated;
GRANT SELECT ON app.rate_limits TO briefly_authenticated;

-- Insert access for tracking tables
GRANT INSERT ON app.feature_flag_usage TO briefly_authenticated;

-- Sequence permissions for authenticated users
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO briefly_authenticated;

-- Anonymous Role (Public Access)
-- Very limited permissions for unauthenticated users
GRANT USAGE ON SCHEMA public TO briefly_anonymous;
-- No table permissions - anonymous users should not access data

-- ============================================================================
-- FUNCTION PERMISSIONS
-- ============================================================================

-- Grant execute permissions on utility functions
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO briefly_service, briefly_authenticated;

-- ============================================================================
-- DEFAULT PRIVILEGES FOR FUTURE OBJECTS
-- ============================================================================

-- Set default privileges for future tables in app schema
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO briefly_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO briefly_authenticated;

-- Set default privileges for future sequences in app schema
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON SEQUENCES TO briefly_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO briefly_authenticated;

-- Set default privileges for future functions in app schema
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON FUNCTIONS TO briefly_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO briefly_authenticated;

-- Set default privileges for future tables in private schema (service only)
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO briefly_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON SEQUENCES TO briefly_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON FUNCTIONS TO briefly_service;

-- ============================================================================
-- SECURITY POLICIES
-- ============================================================================

-- Revoke public access to schemas
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- Revoke public access to all tables
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC;

-- Ensure only specific roles can create objects in schemas
REVOKE CREATE ON SCHEMA app FROM PUBLIC;
REVOKE CREATE ON SCHEMA private FROM PUBLIC;
GRANT CREATE ON SCHEMA app TO briefly_service;
GRANT CREATE ON SCHEMA private TO briefly_service;

-- ============================================================================
-- ROLE MEMBERSHIP (if using role inheritance)
-- ============================================================================

-- Note: In Supabase, these roles are typically managed through the dashboard
-- This is for reference if setting up in a custom PostgreSQL instance

/*
-- Make service role inherit from authenticated role
GRANT briefly_authenticated TO briefly_service;

-- Set up role hierarchy
-- briefly_service (admin) -> briefly_authenticated (users) -> briefly_anonymous (public)
*/

-- ============================================================================
-- AUDIT LOGGING FOR ROLE CHANGES
-- ============================================================================

-- Log the role setup completion
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
    'ROLE_PERMISSIONS_SETUP',
    'database',
    jsonb_build_object(
        'roles_configured', ARRAY['briefly_service', 'briefly_authenticated', 'briefly_anonymous'],
        'schemas_secured', ARRAY['app', 'private'],
        'rls_enforced', true,
        'completed_at', NOW()
    ),
    'info'
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Create a function to verify role permissions
CREATE OR REPLACE FUNCTION private.verify_role_permissions()
RETURNS TABLE (
    role_name TEXT,
    schema_name TEXT,
    table_name TEXT,
    privilege_type TEXT,
    is_grantable BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        grantee::TEXT as role_name,
        table_schema::TEXT as schema_name,
        table_name::TEXT,
        privilege_type::TEXT,
        is_grantable::BOOLEAN
    FROM information_schema.table_privileges 
    WHERE grantee IN ('briefly_service', 'briefly_authenticated', 'briefly_anonymous')
    AND table_schema IN ('app', 'private', 'public')
    ORDER BY grantee, table_schema, table_name, privilege_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on verification function to service role
GRANT EXECUTE ON FUNCTION private.verify_role_permissions() TO briefly_service;

COMMENT ON FUNCTION private.verify_role_permissions() IS 'Verification function to check role permissions across schemas';