import { createClient } from '@supabase/supabase-js'

export const supabaseAdminPrivate = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'private' }, auth: { autoRefreshToken: false, persistSession: false } }
)