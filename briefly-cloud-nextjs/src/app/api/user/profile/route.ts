export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin' // uses SUPABASE_SERVICE_ROLE_KEY with app schema

async function handler(_req: Request, ctx: { user: { id: string } | null }) {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAppAdmin
    .from('profiles')
    .select('*')
    .eq('id', ctx.user.id)
    .single()

  if (error) {
    console.error('[user/profile]', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export const GET = createProtectedApiHandler(handler)
