export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const getCookie = (req: Request, n: string) => {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(n + '='))
  return hit ? decodeURIComponent(hit.slice(n.length + 1)) : undefined
}

const sb = (req: Request) => createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { 
    db: { schema: 'public' },
    cookies: { get: (n) => getCookie(req, n), set: () => {}, remove: () => {} } 
  }
)

export async function POST(req: Request) {
  const supabase = sb(req)
  const { data: userRes, error: uErr } = await supabase.auth.getUser()
  if (uErr || !userRes?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('bc_upgrade_to_pro')
  if (error) {
    console.error('[plan/upgrade] rpc error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, access: data })
}