export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { userProfileSchema } from '@/app/lib/validations'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'

// GET /api/user/profile - Get user profile
async function getProfileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const supabase = supabaseAdmin
    
    // Get full user profile with usage statistics
    const { data: userProfile, error } = await supabase
      .schema('app')
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        subscription_tier,
        subscription_status,
        chat_messages_count,
        chat_messages_limit,
        documents_uploaded,
        documents_limit,
        api_calls_count,
        api_calls_limit,
        storage_used_bytes,
        storage_limit_bytes,
        preferences,
        features_enabled,
        permissions,
        created_at,
        updated_at,
        usage_reset_date,
        trial_end_date
      `)
      .eq('id', user.id)
      .single()
    
    if (error) {
      console.error('Profile fetch error:', error)
      return ApiResponse.internalError('Failed to fetch user profile')
    }
    
    // Calculate usage percentages
    const usageStats = {
      chat_messages: {
        used: userProfile.chat_messages_count || 0,
        limit: userProfile.chat_messages_limit || 0,
        percentage: Math.round(((userProfile.chat_messages_count || 0) / (userProfile.chat_messages_limit || 1)) * 100)
      },
      documents: {
        used: userProfile.documents_uploaded || 0,
        limit: userProfile.documents_limit || 0,
        percentage: Math.round(((userProfile.documents_uploaded || 0) / (userProfile.documents_limit || 1)) * 100)
      },
      api_calls: {
        used: userProfile.api_calls_count || 0,
        limit: userProfile.api_calls_limit || 0,
        percentage: Math.round(((userProfile.api_calls_count || 0) / (userProfile.api_calls_limit || 1)) * 100)
      },
      storage: {
        used: userProfile.storage_used_bytes || 0,
        limit: userProfile.storage_limit_bytes || 0,
        percentage: Math.round(((userProfile.storage_used_bytes || 0) / (userProfile.storage_limit_bytes || 1)) * 100)
      }
    }
    
    // Log usage
    logApiUsage(user.id, '/api/user/profile', 'profile_view')
    
    return ApiResponse.success({
      profile: userProfile,
      usage_stats: usageStats,
    })
    
  } catch (error) {
    console.error('Profile handler error:', error)
    return ApiResponse.internalError('Failed to process profile request')
  }
}

// PUT /api/user/profile - Update user profile
async function updateProfileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user, validatedData } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  if (!validatedData?.body) {
    return ApiResponse.badRequest('Invalid request body')
  }
  
  try {
    const supabase = supabaseAdmin
    
    const updateData = validatedData.body
    
    // Update user profile
    const { data: updatedProfile, error } = await supabase
      .schema('app')
      .from('profiles')
      .update({
        full_name: updateData.full_name,
        preferences: updateData.preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single()
    
    if (error) {
      console.error('Profile update error:', error)
      return ApiResponse.internalError('Failed to update profile')
    }
    
    // Log usage
    logApiUsage(user.id, '/api/user/profile', 'profile_update', {
      fields_updated: Object.keys(updateData)
    })
    
    return ApiResponse.success(
      { profile: updatedProfile },
      'Profile updated successfully'
    )
    
  } catch (error) {
    console.error('Profile update handler error:', error)
    return ApiResponse.internalError('Failed to process profile update')
  }
}

// DELETE /api/user/profile - Delete user account
async function deleteProfileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const supabase = supabaseAdmin
    
    // Start transaction-like operations
    // 1. Delete user data from related tables
    await Promise.all([
      supabase.from('conversations').delete().eq('user_id', user.id),
      supabase.from('file_metadata').delete().eq('user_id', user.id),
      supabase.from('document_chunks').delete().eq('user_id', user.id),
      supabase.from('usage_logs').delete().eq('user_id', user.id),
      supabase.from('oauth_tokens').delete().eq('user_id', user.id),
      supabase.from('user_settings').delete().eq('user_id', user.id),
    ])
    
    // 2. Delete user profile
    const { error: deleteError } = await supabase
      .schema('app')
      .from('profiles')
      .delete()
      .eq('id', user.id)
    
    if (deleteError) {
      console.error('Profile deletion error:', deleteError)
      return ApiResponse.internalError('Failed to delete profile')
    }
    
    // 3. Delete from Supabase Auth
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id)
    
    if (authDeleteError) {
      console.error('Auth deletion error:', authDeleteError)
      // Continue anyway as the profile data is already deleted
    }
    
    // Log usage
    logApiUsage(user.id, '/api/user/profile', 'account_deletion')
    
    return ApiResponse.success(
      null,
      'Account deleted successfully'
    )
    
  } catch (error) {
    console.error('Profile deletion handler error:', error)
    return ApiResponse.internalError('Failed to process account deletion')
  }
}

// Export handlers with middleware
export const GET = createProtectedApiHandler(getProfileHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const PUT = createProtectedApiHandler(updateProfileHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 20, // More restrictive for updates
  },
  validation: {
    body: userProfileSchema,
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const DELETE = createProtectedApiHandler(deleteProfileHandler, {
  rateLimit: {
    ...rateLimitConfigs.strict,
    maxRequests: 2, // Very restrictive for account deletion
  },
  logging: {
    enabled: true,
    includeBody: false,
  },
})

