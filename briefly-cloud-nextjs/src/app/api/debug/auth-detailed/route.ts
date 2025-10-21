export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  
  try {
    // Get all cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    
    // Get cookie header
    const cookieHeader = request.headers.get('cookie')
    
    // Extract Supabase project reference
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const projectRef = supabaseUrl?.split('//')[1]?.split('.')[0]
    
    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            // Don't set cookies in API routes
          },
        },
      }
    )
    
    // Try to get user
    const { data: { user }, error } = await supabase.auth.getUser()
    
    // Try to get session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    return NextResponse.json({
      correlationId,
      debug: {
        projectRef,
        supabaseUrl,
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader?.length || 0,
        allCookies: allCookies.map(c => ({
          name: c.name,
          valueLength: c.value?.length || 0,
          hasValue: !!c.value
        })),
        supabaseCookies: allCookies.filter(c => c.name.startsWith('sb-')).map(c => ({
          name: c.name,
          valueLength: c.value?.length || 0,
          hasValue: !!c.value
        })),
        expectedCookieNames: [
          `sb-${projectRef}-auth-token`,
          `sb-${projectRef}-auth-token.0`,
          `sb-${projectRef}-auth-token.1`,
        ],
        user: user ? {
          id: user.id,
          email: user.email,
          hasId: !!user.id
        } : null,
        session: session ? {
          hasAccessToken: !!session.access_token,
          accessTokenLength: session.access_token?.length || 0,
          expiresAt: session.expires_at
        } : null,
        authError: error ? {
          message: error.message,
          status: error.status
        } : null,
        sessionError: sessionError ? {
          message: sessionError.message,
          status: sessionError.status
        } : null
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      correlationId,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    }, { status: 500 })
  }
}

