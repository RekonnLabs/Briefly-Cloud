// src/app/api/auth/signout/route.ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set({ name, value, ...options }),
        remove: (name, options) => cookieStore.set({ name, value: '', ...options, maxAge: 0 }),
      },
    }
  )
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/auth/signin', process.env.NEXT_PUBLIC_SITE_URL!))
}

export async function GET() { return POST() }
