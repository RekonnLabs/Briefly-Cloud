import { NextRequest } from 'next/server'
import { supabase, supabaseAdmin } from '@/app/lib/supabase'
import { TIER_LIMITS } from '@/app/lib/auth'
import { createSuccessResponse, createErrorResponse } from '@/app/lib/utils'
import { validateRequest } from '@/app/lib/validations'
import { z } from 'zod'

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long')
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(signupSchema, body)
    
    if (!validation.success) {
      return Response.json(
        createErrorResponse(validation.error),
        { status: 400 }
      )
    }

    const { email, password } = validation.data

    // Sign up with Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    })

    if (authError) {
      let errorMessage = 'Registration failed'
      
      if (authError.message.includes('User already registered')) {
        errorMessage = 'An account with this email already exists. Please try logging in instead.'
      } else if (authError.message.includes('Password should be at least')) {
        errorMessage = 'Password must be at least 6 characters long'
      } else if (authError.message.includes('Invalid email')) {
        errorMessage = 'Please enter a valid email address'
      } else {
        errorMessage = authError.message
      }
      
      return Response.json(
        createErrorResponse(errorMessage),
        { status: 400 }
      )
    }

    if (authData.user) {
      // Create user profile (migrated from Python logic)
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

      try {
        await supabaseAdmin.from('users').upsert(newUser)
      } catch (dbError) {
        console.warn('User profile creation failed:', dbError)
        // Continue anyway - the auth user was created successfully
      }

      return Response.json(
        createSuccessResponse({
          message: 'Registration successful. Please check your email for verification.',
          user: {
            id: newUser.id,
            email: newUser.email,
            subscription_tier: newUser.subscription_tier
          }
        })
      )
    } else {
      return Response.json(
        createErrorResponse('Registration failed - no user returned'),
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Signup error:', error)
    return Response.json(
      createErrorResponse('Registration failed'),
      { status: 500 }
    )
  }
}