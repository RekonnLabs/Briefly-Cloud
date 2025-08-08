import { NextRequest } from 'next/server'
import { supabase, supabaseAdmin } from '@/app/lib/supabase'
import { TIER_LIMITS } from '@/app/lib/auth'
import { createSuccessResponse, createErrorResponse } from '@/app/lib/utils'
import { validateRequest } from '@/app/lib/validations'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(loginSchema, body)
    
    if (!validation.success) {
      return Response.json(
        createErrorResponse(validation.error),
        { status: 400 }
      )
    }

    const { email, password } = validation.data

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError || !authData.user) {
      let errorMessage = 'Invalid email or password'
      
      if (authError?.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password'
      } else if (authError?.message.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account'
      }
      
      return Response.json(
        createErrorResponse(errorMessage),
        { status: 401 }
      )
    }

    // Get user profile from database
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (userData) {
      const tierInfo = TIER_LIMITS[userData.subscription_tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free
      
      return Response.json(
        createSuccessResponse({
          token: authData.session?.access_token,
          refresh_token: authData.session?.refresh_token,
          user: {
            id: userData.id,
            email: userData.email,
            subscription_tier: userData.subscription_tier,
            usage_count: userData.chat_messages_count || 0,
            usage_limit: userData.chat_messages_limit || tierInfo.max_llm_calls
          },
          tier_info: tierInfo
        })
      )
    } else {
      // Create user profile if it doesn't exist (migrated from Python logic)
      const newUser = {
        id: authData.user.id,
        email: authData.user.email,
        full_name: authData.user.email?.split('@')[0] || 'User',
        plan: 'free',
        subscription_tier: 'free',
        subscription_status: 'active',
        chat_messages_count: 0,
        chat_messages_limit: TIER_LIMITS.free.max_llm_calls,
        documents_uploaded: 0,
        documents_limit: TIER_LIMITS.free.max_files,
        api_calls_count: 0,
        api_calls_limit: 1000,
        storage_used_bytes: 0,
        storage_limit_bytes: TIER_LIMITS.free.max_storage_bytes,
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
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }

      await supabaseAdmin.from('users').upsert(newUser)

      return Response.json(
        createSuccessResponse({
          token: authData.session?.access_token,
          refresh_token: authData.session?.refresh_token,
          user: {
            id: newUser.id,
            email: newUser.email,
            subscription_tier: newUser.subscription_tier,
            usage_count: newUser.chat_messages_count,
            usage_limit: newUser.chat_messages_limit
          },
          tier_info: TIER_LIMITS.free
        })
      )
    }

  } catch (error) {
    console.error('Login error:', error)
    return Response.json(
      createErrorResponse('Authentication failed'),
      { status: 500 }
    )
  }
}