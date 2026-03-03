-- Remove Public Schema Compatibility Views
-- This migration removes the public schema views that were created for backward
-- compatibility during the multi-tenant schema migration. These views are no
-- longer needed as all code has been migrated to use the app schema directly.

-- ============================================================================
-- PHASE 1: Revoke Permissions on Public Schema Views
-- ============================================================================

-- Revoke permissions on public schema views
REVOKE ALL ON public.users FROM briefly_authenticated;
REVOKE ALL ON public.file_metadata FROM briefly_authenticated;
REVOKE ALL ON public.document_chunks FROM briefly_authenticated;
REVOKE ALL ON public.conversations FROM briefly_authenticated;
REVOKE ALL ON public.chat_messages FROM briefly_authenticated;
REVOKE ALL ON public.usage_logs FROM briefly_authenticated;
REVOKE ALL ON public.user_settings FROM briefly_authenticated;

-- ============================================================================
-- PHASE 2: Drop Public Schema Views
-- ============================================================================

-- Drop compatibility views in public schema
DROP VIEW IF EXISTS public.users;
DROP VIEW IF EXISTS public.file_metadata;
DROP VIEW IF EXISTS public.document_chunks;
DROP VIEW IF EXISTS public.conversations;
DROP VIEW IF EXISTS public.chat_messages;
DROP VIEW IF EXISTS public.usage_logs;
DROP VIEW IF EXISTS public.user_settings;

-- ============================================================================
-- PHASE 3: Log Cleanup Completion
-- ============================================================================

-- Log the cleanup completion
INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
VALUES (
    'PUBLIC_SCHEMA_CLEANUP',
    'database',
    jsonb_build_object(
        'migration', '21-remove-public-schema-views',
        'views_removed', ARRAY[
            'public.users',
            'public.file_metadata', 
            'public.document_chunks',
            'public.conversations',
            'public.chat_messages',
            'public.usage_logs',
            'public.user_settings'
        ],
        'reason', 'Migration to app schema complete - compatibility views no longer needed',
        'completed_at', NOW()
    ),
    'info'
);

-- ============================================================================
-- CLEANUP COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Public schema - compatibility views removed after successful migration to app schema';