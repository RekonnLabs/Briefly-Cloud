export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { supabaseAdmin } from '@/app/lib/supabase-admin' // uses SUPABASE_SERVICE_ROLE_KEY

async function handler(_req: Request, ctx: { user: { id: string } | null }) {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('app.user_profile')
    .select('*')
    .eq('user_id', ctx.user.id)
    .single()

  if (error) {
    console.error('[user/profile]', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export const GET = createProtectedApiHandler(handler)
