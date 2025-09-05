-- Token table hardening for security
-- Ensures proper constraints and RLS policies

-- Add unique constraint on (user_id, provider) if it doesn't already exist
ALTER TABLE public.storage_tokens 
ADD CONSTRAINT IF NOT EXISTS storage_tokens_user_provider_uniq 
UNIQUE (user_id, provider);

-- Enable RLS on the token table
ALTER TABLE public.storage_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "owner can read" ON public.storage_tokens;
DROP POLICY IF EXISTS "owner can upsert" ON public.storage_tokens;
DROP POLICY IF EXISTS "owner can update" ON public.storage_tokens;
DROP POLICY IF EXISTS "owner can delete" ON public.storage_tokens;

-- Create RLS policies - only the owner can access their tokens
CREATE POLICY "owner can read"
  ON public.storage_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "owner can upsert"
  ON public.storage_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner can update"
  ON public.storage_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "owner can delete"
  ON public.storage_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_tokens TO authenticated;