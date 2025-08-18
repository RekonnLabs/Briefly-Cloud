/**
 * Supabase Auth Callback Handler
 * 
 * This route handles OAuth callbacks from Google and Microsoft
 * and creates/updates user profiles in our app.users table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/briefly/app/dashboard'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors from provider
  if (error) {
    console.error('OAuth provider error:', error, errorDescription)
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}`, request.url))
  }

  if (code) {
    try {
      const cookieStore = cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value
            },
            set(name: string, value: string, options: any) {
              cookieStore.set({ name, value, ...options })
            },
            remove(name: string, options: any) {
              cookieStore.set({ name, value: '', ...options })
            },
          },
        }
      )
      
      console.log('Processing OAuth callback with code:', code.substring(0, 10) + '...')
      
      // Exchange code for session
      const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Auth callback error:', error)
        return NextResponse.redirect(new URL(`/auth/error?error=callback_error&description=${encodeURIComponent(error.message)}`, request.url))
      }

      if (user && session) {
        console.log('User authenticated successfully:', user.email)
        
        // Note: User profile will be automatically created by the database trigger
        // when the user was inserted into auth.users during OAuth flow
        
        // Log successful authentication
        try {
          await supabaseAdmin
            .from('private.audit_logs')
            .insert({
              user_id: user.id,
              action: 'USER_LOGIN',
              resource_type: 'authentication',
              new_values: {
                provider: user.app_metadata?.provider,
                email: user.email,
                login_method: 'oauth'
              },
              severity: 'info'
            })
        } catch (auditError) {
          // Don't fail the auth flow if audit logging fails
          console.warn('Failed to log authentication:', auditError)
        }
      }

      // Redirect to the requested page or dashboard
      return NextResponse.redirect(new URL(next, request.url))
    } catch (error) {
      console.error('Unexpected auth callback error:', error)
      return NextResponse.redirect(new URL('/auth/error?error=unexpected_error', request.url))
    }
  }

  // No code provided, redirect to sign in
  return NextResponse.redirect(new URL('/auth/signin', request.url))
}