/**
 * User Profile API Route for Supabase Auth
 * 
 * This route provides user profile information for authenticated users
 * and handles profile updates.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/lib/auth/auth-middleware'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// GET /api/auth/profile - Get current user profile
async function getProfileHandler(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { user } = context

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        subscription_tier: user.subscription_tier,
        subscription_status: user.subscription_status,
        usage_count: user.usage_count,
        usage_limit: user.usage_limit,
        features_enabled: user.features_enabled,
        permissions: user.permissions,
        last_login_at: user.last_login_at,
        created_at: user.created_at
      }
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'PROFILE_FETCH_ERROR',
        message: 'Failed to fetch user profile'
      },
      { status: 500 }
    )
  }
}

// PUT /api/auth/profile - Update user profile
async function updateProfileHandler(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { user } = context
    const body = await request.json()

    // Validate allowed fields for update
    const allowedFields = ['full_name', 'preferences', 'marketing_consent', 'analytics_consent']
    const updateData: any = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_VALID_FIELDS',
          message: 'No valid fields provided for update'
        },
        { status: 400 }
      )
    }

    // Update user profile
    const { data: updatedUser, error } = await supabaseAdmin
      .from('app.users')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
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
        preferences,
        marketing_consent,
        analytics_consent,
        last_login_at,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      throw error
    }

    // Log profile update
    await supabaseAdmin
      .from('private.audit_logs')
      .insert({
        user_id: user.id,
        action: 'USER_PROFILE_UPDATE',
        resource_type: 'user_profile',
        resource_id: user.id,
        old_values: { 
          full_name: user.full_name,
          preferences: user.preferences || {}
        },
        new_values: updateData,
        severity: 'info'
      })

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        avatar_url: updatedUser.avatar_url,
        subscription_tier: updatedUser.subscription_tier,
        subscription_status: updatedUser.subscription_status,
        usage_count: updatedUser.chat_messages_count || 0,
        usage_limit: updatedUser.chat_messages_limit || 100,
        features_enabled: updatedUser.features_enabled || {},
        permissions: updatedUser.permissions || {},
        preferences: updatedUser.preferences || {},
        marketing_consent: updatedUser.marketing_consent,
        analytics_consent: updatedUser.analytics_consent,
        last_login_at: updatedUser.last_login_at,
        created_at: updatedUser.created_at
      }
    })
  } catch (error) {
    console.error('Error updating user profile:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'PROFILE_UPDATE_ERROR',
        message: 'Failed to update user profile'
      },
      { status: 500 }
    )
  }
}

// DELETE /api/auth/profile - Delete user account (GDPR compliance)
async function deleteProfileHandler(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { user } = context

    // Create data deletion request
    const { error: deletionError } = await supabaseAdmin
      .from('app.data_deletion_requests')
      .insert({
        user_id: user.id,
        status: 'pending',
        deletion_type: 'account',
        reason: 'User requested account deletion'
      })

    if (deletionError) {
      throw deletionError
    }

    // Log account deletion request
    await supabaseAdmin
      .from('private.audit_logs')
      .insert({
        user_id: user.id,
        action: 'ACCOUNT_DELETION_REQUESTED',
        resource_type: 'user_account',
        resource_id: user.id,
        severity: 'warning'
      })

    return NextResponse.json({
      success: true,
      message: 'Account deletion request submitted. Your account will be deleted within 30 days.'
    })
  } catch (error) {
    console.error('Error processing account deletion:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'DELETION_REQUEST_ERROR',
        message: 'Failed to process account deletion request'
      },
      { status: 500 }
    )
  }
}

// Export handlers with authentication middleware
export const GET = withAuth(getProfileHandler)
export const PUT = withAuth(updateProfileHandler)
export const DELETE = withAuth(deleteProfileHandler)