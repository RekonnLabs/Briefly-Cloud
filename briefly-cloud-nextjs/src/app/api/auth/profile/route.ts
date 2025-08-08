import { NextRequest } from 'next/server'
import { supabase, supabaseAdmin } from '@/app/lib/supabase'
import { TIER_LIMITS } from '@/app/lib/auth'
import { createSuccessResponse, createErrorResponse } from '@/app/lib/utils'

export async function GET(request: NextRequest) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json(
        createErrorResponse('Missing or invalid authorization header'),
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]

    // Verify token with Supabase
    const { data: userResponse, error: authError } = await supabase.auth.getUser(token)

    if (authError || !userResponse.user) {
      return Response.json(
        createErrorResponse('Invalid or expired token'),
        { status: 401 }
      )
    }

    const userId = userResponse.user.id

    // Get user profile from database
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userData) {
      const tierInfo = TIER_LIMITS[userData.subscription_tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free

      return Response.json(
        createSuccessResponse({
          id: userData.id,
          email: userData.email,
          subscription_tier: userData.subscription_tier,
          usage_count: userData.chat_messages_count || 0,
          usage_limit: userData.chat_messages_limit || tierInfo.max_llm_calls,
          created_at: userData.created_at || '',
          updated_at: userData.updated_at || '',
          tier_info: tierInfo
        })
      )
    } else {
      // Create user profile if it doesn't exist (shouldn't happen but just in case)
      const newUser = {
        id: userId,
        email: userResponse.user.email,
        full_name: userResponse.user.email?.split('@')[0] || 'User',
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

      await supabaseAdmin.from('users').insert(newUser)

      return Response.json(
        createSuccessResponse({
          id: userId,
          email: userResponse.user.email,
          subscription_tier: 'free',
          usage_count: 0,
          usage_limit: TIER_LIMITS.free.max_llm_calls,
          created_at: '',
          updated_at: '',
          tier_info: TIER_LIMITS.free
        })
      )
    }

  } catch (error) {
    console.error('Profile error:', error)
    return Response.json(
      createErrorResponse('Failed to get profile'),
      { status: 500 }
    )
  }
}