import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/ssr'

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies }, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  })
  await supabase.auth.signOut()
  return Response.json({ ok: true })
}
