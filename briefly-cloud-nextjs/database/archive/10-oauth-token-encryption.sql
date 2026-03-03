-- OAuth Token Encryption Functions
-- These SECURITY DEFINER functions provide secure encryption/decryption for OAuth tokens

-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encryption key management table
CREATE TABLE IF NOT EXISTS private.encryption_keys (
  key_version INTEGER PRIMARY KEY,
  key_data BYTEA NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Insert initial encryption key (should be rotated in production)
INSERT INTO private.encryption_keys (key_version, key_data, algorithm, is_active)
VALUES (1, decode(substring(md5(random()::text) from 1 for 32), 'hex'), 'aes-256-gcm', true)
ON CONFLICT (key_version) DO NOTHING;

-- Function to get active encryption key
CREATE OR REPLACE FUNCTION private.get_active_encryption_key()
RETURNS RECORD AS $$
DECLARE
  key_record RECORD;
BEGIN
  SELECT key_version, key_data, algorithm
  INTO key_record
  FROM private.encryption_keys
  WHERE is_active = true
  ORDER BY key_version DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active encryption key found';
  END IF;
  
  RETURN key_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to encrypt OAuth token
CREATE OR REPLACE FUNCTION encrypt_oauth_token(
  p_user_id UUID,
  p_provider TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_scope TEXT DEFAULT NULL,
  p_token_type TEXT DEFAULT 'Bearer',
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  key_record RECORD;
  encrypted_access_token BYTEA;
  encrypted_refresh_token BYTEA;
  access_nonce BYTEA;
  refresh_nonce BYTEA;
BEGIN
  -- Get active encryption key
  SELECT * INTO key_record FROM private.get_active_encryption_key();
  
  -- Generate random nonces for GCM mode
  access_nonce := gen_random_bytes(12); -- 96-bit nonce for GCM
  
  -- Encrypt access token
  encrypted_access_token := pgp_sym_encrypt_bytea(
    p_access_token::BYTEA,
    encode(key_record.key_data, 'hex'),
    'cipher-algo=aes256, compress-algo=0'
  );
  
  -- Encrypt refresh token if provided
  IF p_refresh_token IS NOT NULL THEN
    refresh_nonce := gen_random_bytes(12);
    encrypted_refresh_token := pgp_sym_encrypt_bytea(
      p_refresh_token::BYTEA,
      encode(key_record.key_data, 'hex'),
      'cipher-algo=aes256, compress-algo=0'
    );
  END IF;
  
  -- Insert or update encrypted token
  INSERT INTO private.oauth_tokens (
    user_id,
    provider,
    access_token_encrypted,
    refresh_token_encrypted,
    access_token_nonce,
    refresh_token_nonce,
    scope,
    token_type,
    expires_at,
    key_version,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_provider,
    encrypted_access_token,
    encrypted_refresh_token,
    access_nonce,
    refresh_nonce,
    p_scope,
    p_token_type,
    p_expires_at,
    key_record.key_version,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    access_token_nonce = EXCLUDED.access_token_nonce,
    refresh_token_nonce = EXCLUDED.refresh_token_nonce,
    scope = EXCLUDED.scope,
    token_type = EXCLUDED.token_type,
    expires_at = EXCLUDED.expires_at,
    key_version = EXCLUDED.key_version,
    updated_at = NOW();
    
  -- Log the encryption event
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    p_user_id,
    'OAUTH_TOKEN_ENCRYPTED',
    'oauth_token',
    p_user_id::TEXT || ':' || p_provider,
    jsonb_build_object(
      'provider', p_provider,
      'key_version', key_record.key_version,
      'has_refresh_token', p_refresh_token IS NOT NULL
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt OAuth token
CREATE OR REPLACE FUNCTION decrypt_oauth_token(
  p_user_id UUID,
  p_provider TEXT
)
RETURNS TABLE (
  user_id UUID,
  provider TEXT,
  access_token TEXT,
  refresh_token TEXT,
  scope TEXT,
  token_type TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  token_record RECORD;
  key_record RECORD;
  decrypted_access_token TEXT;
  decrypted_refresh_token TEXT;
BEGIN
  -- Get encrypted token record
  SELECT *
  INTO token_record
  FROM private.oauth_tokens
  WHERE oauth_tokens.user_id = p_user_id
    AND oauth_tokens.provider = p_provider;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get encryption key for this token
  SELECT key_data, algorithm
  INTO key_record
  FROM private.encryption_keys
  WHERE key_version = token_record.key_version;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encryption key not found for version %', token_record.key_version;
  END IF;
  
  -- Decrypt access token
  decrypted_access_token := convert_from(
    pgp_sym_decrypt_bytea(
      token_record.access_token_encrypted,
      encode(key_record.key_data, 'hex')
    ),
    'UTF8'
  );
  
  -- Decrypt refresh token if it exists
  IF token_record.refresh_token_encrypted IS NOT NULL THEN
    decrypted_refresh_token := convert_from(
      pgp_sym_decrypt_bytea(
        token_record.refresh_token_encrypted,
        encode(key_record.key_data, 'hex')
      ),
      'UTF8'
    );
  END IF;
  
  -- Return decrypted data
  RETURN QUERY SELECT
    token_record.user_id,
    token_record.provider,
    decrypted_access_token,
    decrypted_refresh_token,
    token_record.scope,
    token_record.token_type,
    token_record.expires_at,
    token_record.created_at,
    token_record.updated_at;
    
  -- Log the decryption event
  INSERT INTO private.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    p_user_id,
    'OAUTH_TOKEN_DECRYPTED',
    'oauth_token',
    p_user_id::TEXT || ':' || p_provider,
    jsonb_build_object(
      'provider', p_provider,
      'key_version', token_record.key_version
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rotate encryption keys
CREATE OR REPLACE FUNCTION rotate_oauth_encryption_key()
RETURNS INTEGER AS $$
DECLARE
  new_key_version INTEGER;
  new_key_data BYTEA;
BEGIN
  -- Get next key version
  SELECT COALESCE(MAX(key_version), 0) + 1
  INTO new_key_version
  FROM private.encryption_keys;
  
  -- Generate new key
  new_key_data := gen_random_bytes(32); -- 256-bit key
  
  -- Deactivate old keys
  UPDATE private.encryption_keys
  SET is_active = false
  WHERE is_active = true;
  
  -- Insert new active key
  INSERT INTO private.encryption_keys (
    key_version,
    key_data,
    algorithm,
    is_active,
    created_at
  )
  VALUES (
    new_key_version,
    new_key_data,
    'aes-256-gcm',
    true,
    NOW()
  );
  
  -- Log key rotation
  INSERT INTO private.audit_logs (
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  )
  VALUES (
    'ENCRYPTION_KEY_ROTATED',
    'encryption_key',
    new_key_version::TEXT,
    jsonb_build_object(
      'new_key_version', new_key_version,
      'algorithm', 'aes-256-gcm'
    ),
    inet_client_addr(),
    current_setting('application_name', true),
    NOW()
  );
  
  RETURN new_key_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the oauth_tokens table structure to support encryption
ALTER TABLE private.oauth_tokens 
ADD COLUMN IF NOT EXISTS access_token_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS access_token_nonce BYTEA,
ADD COLUMN IF NOT EXISTS refresh_token_nonce BYTEA,
ADD COLUMN IF NOT EXISTS key_version INTEGER REFERENCES private.encryption_keys(key_version);

-- Remove old plaintext columns (commented out for safety - uncomment after migration)
-- ALTER TABLE private.oauth_tokens DROP COLUMN IF EXISTS access_token;
-- ALTER TABLE private.oauth_tokens DROP COLUMN IF EXISTS refresh_token;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION encrypt_oauth_token TO briefly_service;
GRANT EXECUTE ON FUNCTION decrypt_oauth_token TO briefly_service;
GRANT EXECUTE ON FUNCTION rotate_oauth_encryption_key TO briefly_service;
GRANT EXECUTE ON FUNCTION private.get_active_encryption_key TO briefly_service;