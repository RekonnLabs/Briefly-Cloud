/**
 * User Profile API Route for Supabase Auth
 * 
 * This route provides user profile information for authenticated users
 * and handles profile creation if missing.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/auth/profile - Get or create user profile
export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { 
        cookies: { 
          get: (name: string) => cookieStore.get(name)?.value 
        } 
      }
    )

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Check if profile exists in app.users table
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('app.users')
      .select(`
        id,
        email,
        full_name,
        avatar_url,
        subscription_tier,
        subscription_status,
        chat_messages_count,
        chat_messages_limit,
        features_enabled,
        permissions,
        last_login_at,
        created_at
      `)
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      console.error('Error fetching user profile:', fetchError)
      return NextResponse.json({ error: 'profile_fetch_failed' }, { status: 500 })
    }

    // Create profile if missing (use admin to bypass RLS on first insert)
    if (!existing) {
      const newProfile = {
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        subscription_tier: 'free' as const,
        subscription_status: 'active',
        chat_messages_count: 0,
        chat_messages_limit: 100,
        documents_uploaded: 0,
        documents_limit: 25,
        api_calls_count: 0,
        api_calls_limit: 1000,
        storage_used_bytes: 0,
        storage_limit_bytes: 104857600, // 100MB
        usage_stats: {},
        preferences: {},
        features_enabled: {
          cloud_storage: true,
          ai_chat: true,
          document_upload: true
        },
        permissions: {
          can_upload: true,
          can_chat: true,
          can_export: false
        },
        usage_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        last_login_at: new Date().toISOString(),
        gdpr_consent_version: '1.0',
        marketing_consent: false,
        analytics_consent: true
      }

      const { error: insertError } = await supabaseAdmin
        .from('app.users')
        .insert(newProfile)

      if (insertError) {
        console.error('Error creating user profile:', insertError)
        return NextResponse.json({ error: 'profile_insert_failed' }, { status: 500 })
      }

      // Return the newly created profile
      return NextResponse.json({
        success: true,
        user: {
          id: newProfile.id,
          email: newProfile.email,
          full_name: newProfile.full_name,
          avatar_url: newProfile.avatar_url,
          subscription_tier: newProfile.subscription_tier,
          subscription_status: newProfile.subscription_status,
          usage_count: newProfile.chat_messages_count,
          usage_limit: newProfile.chat_messages_limit,
          features_enabled: newProfile.features_enabled,
          permissions: newProfile.permissions,
          last_login_at: newProfile.last_login_at,
          created_at: new Date().toISOString()
        }
      })
    }

    // Return existing profile
    return NextResponse.json({
      success: true,
      user: {
        id: existing.id,
        email: existing.email,
        full_name: existing.full_name,
        avatar_url: existing.avatar_url,
        subscription_tier: existing.subscription_tier,
        subscription_status: existing.subscription_status,
        usage_count: existing.chat_messages_count || 0,
        usage_limit: existing.chat_messages_limit || 100,
        features_enabled: existing.features_enabled || {},
        permissions: existing.permissions || {},
        last_login_at: existing.last_login_at,
        created_at: existing.created_at
      }
    })
  } catch (error) {
    console.error('Error in profile route:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

