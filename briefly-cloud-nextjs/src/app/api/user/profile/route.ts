export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { supabasePublicAdmin } from '@/app/lib/auth/supabase-server-admin'

async function handler(_req: Request, ctx: { user: { id: string } | null }) {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabasePublicAdmin
    .from('user_profiles')
    .select('*')
    .eq('id', ctx.user.id)
    .single()

  if (error) {
    console.error('[user/profile] Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      userId: ctx.user.id
    })
    return NextResponse.json({ error: 'db_error', detail: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json(data)
}

export const GET = createProtectedApiHandler(handler)

