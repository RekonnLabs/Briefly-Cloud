/**
 * User Quota Status API
 * 
 * Returns current usage and limits for display in dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { getUserLimits, formatQuotaStatus } from '@/app/lib/usage/quota-enforcement'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/usage/quota
 * 
 * Get current user's quota status
 */
export const GET = withAuth(async (request: NextRequest, context) => {
  try {
    const { user } = context
    
    const limits = await getUserLimits(user.id)
    
    if (!limits) {
      // User profile might still be initializing - return success with null data
      // This prevents errors during profile creation
      logger.warn('Quota limits not available yet', { userId: user.id })
      return NextResponse.json(
        { 
          success: true, 
          data: null,
          message: 'Profile initializing, quota data not yet available'
        },
        { status: 200 }
      )
    }

    const quotaStatus = formatQuotaStatus(limits)

    return NextResponse.json({
      success: true,
      data: {
        ...quotaStatus,
        warnings: getQuotaWarnings(limits),
        recommendations: getQuotaRecommendations(limits)
      }
    })

  } catch (error) {
    logger.error('Failed to get quota status', {
      userId: context.user.id,
      error: (error as Error).message
    })

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get quota status',
        message: 'Please try again later'
      },
      { status: 500 }
    )
  }
})

/**
 * Generate warnings based on quota usage
 */
function getQuotaWarnings(limits: any): string[] {
  const warnings: string[] = []

  if (limits.files_used_percentage >= 90) {
    warnings.push(`You've used ${limits.files_used_percentage}% of your file limit. Consider upgrading to Pro.`)
  }

  if (limits.storage_used_percentage >= 90) {
    warnings.push(`You've used ${limits.storage_used_percentage}% of your storage limit. Consider upgrading to Pro.`)
  }

  if (limits.chat_used_percentage >= 90) {
    warnings.push(`You've used ${limits.chat_used_percentage}% of your chat message limit. Consider upgrading to Pro.`)
  }

  if (limits.is_trial_active && limits.trial_days_remaining <= 3) {
    warnings.push(`Your trial expires in ${limits.trial_days_remaining} days. Upgrade to Pro to keep your data.`)
  }

  return warnings
}

/**
 * Generate recommendations based on usage patterns
 */
function getQuotaRecommendations(limits: any): Array<{
  type: 'upgrade' | 'cleanup' | 'optimize'
  message: string
  action?: string
}> {
  const recommendations: Array<{
    type: 'upgrade' | 'cleanup' | 'optimize'
    message: string
    action?: string
  }> = []

  // Upgrade recommendations
  if (limits.subscription_tier === 'free' && (
    limits.files_used_percentage >= 80 ||
    limits.storage_used_percentage >= 80 ||
    limits.chat_used_percentage >= 80
  )) {
    recommendations.push({
      type: 'upgrade',
      message: 'Upgrade to Pro for 10x more storage, files, and chat messages',
      action: '/pricing'
    })
  }

  // Cleanup recommendations
  if (limits.files_used_percentage >= 70 && limits.subscription_tier === 'free') {
    recommendations.push({
      type: 'cleanup',
      message: 'Delete unused files to free up space. Files inactive for 30 days are automatically removed.',
      action: '/files'
    })
  }

  // Optimization recommendations
  if (limits.files_used >= 3) {
    recommendations.push({
      type: 'optimize',
      message: 'Duplicate files are automatically detected to save storage and processing costs.',
      action: null
    })
  }

  return recommendations
}

