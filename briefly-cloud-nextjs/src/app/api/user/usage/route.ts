import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, parsePaginationParams, createPaginatedResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'

// Tier limits for reference
const TIER_LIMITS = {
  free: {
    documents: 10,
    chat_messages: 100,
    api_calls: 1000,
    storage_bytes: 104857600, // 100MB
  },
  pro: {
    documents: 1000,
    chat_messages: 1000,
    api_calls: 10000,
    storage_bytes: 10737418240, // 10GB
  },
  pro_byok: {
    documents: 10000,
    chat_messages: 5000,
    api_calls: 50000,
    storage_bytes: 107374182400, // 100GB
  }
}

// GET /api/user/usage - Get user usage statistics
async function getUserUsageHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const supabase = supabaseAdmin
    
    const url = new URL(request.url)
    const timeframe = url.searchParams.get('timeframe') || 'current_month'
    const includeHistory = url.searchParams.get('include_history') === 'true'
    
    // Get current usage from user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select(`
        subscription_tier,
        chat_messages_count,
        chat_messages_limit,
        documents_uploaded,
        documents_limit,
        api_calls_count,
        api_calls_limit,
        storage_used_bytes,
        storage_limit_bytes,
        usage_reset_date
      `)
      .eq('id', user.id)
      .single()
    
    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return ApiResponse.internalError('Failed to fetch usage data')
    }
    
    // Get tier limits
    const tierLimits = TIER_LIMITS[userProfile.subscription_tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free
    
    // Calculate usage statistics
    const currentUsage = {
      chat_messages: {
        used: userProfile.chat_messages_count || 0,
        limit: userProfile.chat_messages_limit || tierLimits.chat_messages,
        percentage: Math.round(((userProfile.chat_messages_count || 0) / (userProfile.chat_messages_limit || tierLimits.chat_messages)) * 100),
        remaining: Math.max(0, (userProfile.chat_messages_limit || tierLimits.chat_messages) - (userProfile.chat_messages_count || 0))
      },
      documents: {
        used: userProfile.documents_uploaded || 0,
        limit: userProfile.documents_limit || tierLimits.documents,
        percentage: Math.round(((userProfile.documents_uploaded || 0) / (userProfile.documents_limit || tierLimits.documents)) * 100),
        remaining: Math.max(0, (userProfile.documents_limit || tierLimits.documents) - (userProfile.documents_uploaded || 0))
      },
      api_calls: {
        used: userProfile.api_calls_count || 0,
        limit: userProfile.api_calls_limit || tierLimits.api_calls,
        percentage: Math.round(((userProfile.api_calls_count || 0) / (userProfile.api_calls_limit || tierLimits.api_calls)) * 100),
        remaining: Math.max(0, (userProfile.api_calls_limit || tierLimits.api_calls) - (userProfile.api_calls_count || 0))
      },
      storage: {
        used: userProfile.storage_used_bytes || 0,
        limit: userProfile.storage_limit_bytes || tierLimits.storage_bytes,
        percentage: Math.round(((userProfile.storage_used_bytes || 0) / (userProfile.storage_limit_bytes || tierLimits.storage_bytes)) * 100),
        remaining: Math.max(0, (userProfile.storage_limit_bytes || tierLimits.storage_bytes) - (userProfile.storage_used_bytes || 0)),
        used_formatted: formatBytes(userProfile.storage_used_bytes || 0),
        limit_formatted: formatBytes(userProfile.storage_limit_bytes || tierLimits.storage_bytes)
      }
    }
    
    let usageHistory = null
    
    // Get usage history if requested
    if (includeHistory) {
      const pagination = parsePaginationParams(url.searchParams)
      
      // Calculate date range based on timeframe
      const now = new Date()
      let startDate: Date
      
      switch (timeframe) {
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'current_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'last_month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
      
      // Get usage logs
      const { data: usageLogs, error: logsError, count } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .range(pagination.offset!, pagination.offset! + pagination.limit! - 1)
      
      if (logsError) {
        console.error('Usage logs fetch error:', logsError)
      } else {
        usageHistory = createPaginatedResponse(usageLogs || [], count || 0, pagination)
      }
    }
    
    // Get usage warnings
    const warnings: Array<{
      type: string
      level: 'warning' | 'critical'
      message: string
    }> = []
    
    Object.entries(currentUsage).forEach(([key, usage]) => {
      if (usage.percentage >= 90) {
        warnings.push({
          type: key,
          level: 'critical',
          message: `You have used ${usage.percentage}% of your ${key.replace('_', ' ')} limit`
        })
      } else if (usage.percentage >= 80) {
        warnings.push({
          type: key,
          level: 'warning',
          message: `You have used ${usage.percentage}% of your ${key.replace('_', ' ')} limit`
        })
      }
    })
    
    // Log usage
    logApiUsage(user.id, '/api/user/usage', 'usage_view', {
      timeframe,
      include_history: includeHistory
    })
    
    const responseData = {
      subscription_tier: userProfile.subscription_tier,
      usage_reset_date: userProfile.usage_reset_date,
      current_usage: currentUsage,
      warnings,
      tier_limits: tierLimits,
      ...(usageHistory && { usage_history: usageHistory })
    }
    
    return ApiResponse.success(responseData)
    
  } catch (error) {
    console.error('Usage handler error:', error)
    return ApiResponse.internalError('Failed to process usage request')
  }
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// Export handler with middleware
export const GET = createProtectedApiHandler(getUserUsageHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})