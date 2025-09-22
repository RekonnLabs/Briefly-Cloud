export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getCookie(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

function sb(req: Request) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      db: { schema: 'public' },
      cookies: { get: (n) => getCookie(req, n), set: () => {}, remove: () => {} } 
    }
  )
}

export async function POST(req: Request) {
  const supabase = sb(req)
  const { data: userRes, error: uErr } = await supabase.auth.getUser()
  if (uErr || !userRes?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Prefer RPC so we don't encode table details in the app
  const { data, error } = await supabase.rpc('bc_start_trial')
  if (error) {
    console.error('[plan/start-trial] rpc error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, access: data })
}
