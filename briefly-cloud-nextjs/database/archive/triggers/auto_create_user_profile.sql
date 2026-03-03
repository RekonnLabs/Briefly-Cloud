-- Auto-create user profile trigger for Supabase Auth
-- This trigger automatically creates a profile in app.users when a user is inserted into auth.users

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION app.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  INSERT INTO app.users (
    id,
    email,
    full_name,
    avatar_url,
    subscription_tier,
    subscription_status,
    chat_messages_count,
    chat_messages_limit,
    documents_uploaded,
    documents_limit,
    api_calls_count,
    api_calls_limit,
    storage_used_bytes,
    storage_limit_bytes,
    usage_stats,
    preferences,
    features_enabled,
    permissions,
    usage_reset_date,
    trial_end_date,
    last_login_at,
    gdpr_consent_version,
    marketing_consent,
    analytics_consent
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'free',
    'active',
    0,
    100,
    0,
    25,
    0,
    1000,
    0,
    104857600, -- 100MB
    '{}',
    '{}',
    jsonb_build_object(
      'cloud_storage', true,
      'ai_chat', true,
      'document_upload', true
    ),
    jsonb_build_object(
      'can_upload', true,
      'can_chat', true,
      'can_export', false
    ),
    (NOW() + INTERVAL '30 days'),
    (NOW() + INTERVAL '7 days'),
    NOW(),
    '1.0',
    false,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE app.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION app.handle_new_user() TO service_role;

-- Comment
COMMENT ON FUNCTION app.handle_new_user() IS 'Automatically creates a user profile in app.users when a new user is inserted into auth.users';
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'Triggers automatic user profile creation for new auth users';
