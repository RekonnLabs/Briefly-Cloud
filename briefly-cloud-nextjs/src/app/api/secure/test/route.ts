/**
 * Test API route for verifying middleware protection
 * This route should only be accessible to authenticated users
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  // This route should only be reached if middleware allows it (user is authenticated)
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => 
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // This should not happen if middleware is working correctly
    return NextResponse.json(
      { error: 'Unauthorized', message: 'User not found' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    message: 'Access granted to secure API',
    user: {
      id: user.id,
      email: user.email
    },
    timestamp: new Date().toISOString(),
    endpoint: '/api/secure/test'
  })
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => 
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'User not found' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))

  return NextResponse.json({
    message: 'Secure POST operation completed',
    user: {
      id: user.id,
      email: user.email
    },
    data: body,
    timestamp: new Date().toISOString(),
    endpoint: '/api/secure/test'
  })
}
