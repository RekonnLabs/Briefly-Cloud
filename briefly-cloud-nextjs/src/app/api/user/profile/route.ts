export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin'

async function handler(_req: Request, ctx: { user: { id: string } | null }) {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Try to get existing profile
  let { data, error } = await supabaseAppAdmin
    .from('profiles')
    .select('*')
    .eq('id', ctx.user.id)
    .maybeSingle()

  // If profile doesn't exist, create it
  if (!data && !error) {
    console.info('[user/profile] Creating new profile for user:', ctx.user.id)
    const { data: newProfile, error: createError } = await supabaseAppAdmin
      .from('profiles')
      .insert({
        id: ctx.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('[user/profile] Error creating profile:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        userId: ctx.user.id
      })
      return NextResponse.json({ error: 'db_error', detail: createError.message, code: createError.code }, { status: 500 })
    }

    data = newProfile
  } else if (error) {
    console.error('[user/profile] Error fetching profile:', {
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

