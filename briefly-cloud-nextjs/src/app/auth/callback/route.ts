/**
 * Supabase Auth Callback Handler
 * 
 * This route handles OAuth callbacks from Google and Microsoft
 * and creates/updates user profiles in our app.users table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createOrUpdateUserProfile } from '@/app/lib/auth/supabase-auth'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/briefly/app/dashboard'

  if (code) {
    try {
      const supabase = createSupabaseServerClient()
      
      // Exchange code for session
      const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Auth callback error:', error)
        return NextResponse.redirect(new URL('/auth/error?error=callback_error', request.url))
      }

      if (user && session) {
        // Create or update user profile in our app.users table
        try {
          await createOrUpdateUserProfile(
            user.id,
            user.email!,
            user.user_metadata?.full_name || user.user_metadata?.name,
            user.user_metadata?.avatar_url || user.user_metadata?.picture
          )

          // Log successful authentication
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

          console.log('User authenticated successfully:', user.email)
        } catch (profileError) {
          console.error('Failed to create/update user profile:', profileError)
          return NextResponse.redirect(new URL('/auth/error?error=profile_creation_failed', request.url))
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