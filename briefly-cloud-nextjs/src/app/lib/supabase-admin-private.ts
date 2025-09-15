import 'server-only'
import { createClient } from '@supabase/supabase-js'

export const supabaseAdminPrivate = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' }, auth: { autoRefreshToken: false, persistSession: false } }
)