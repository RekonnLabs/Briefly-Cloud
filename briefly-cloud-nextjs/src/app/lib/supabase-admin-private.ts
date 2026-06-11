// @ts-nocheck — pending type cleanup
import 'server-only'
// TODO: This file is currently unused (zero imports across the codebase).
// If it is ever imported, db.schema must be changed from 'public' to 'app'
// to match the rest of the codebase. Left as-is to avoid a silent regression
// if someone imports it expecting public-schema behaviour.
import { createClient } from '@supabase/supabase-js'

export const supabaseAdminPrivate = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' }, auth: { autoRefreshToken: false, persistSession: false } }
)
