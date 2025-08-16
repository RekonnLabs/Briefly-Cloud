/**
 * Usage Tracking Service
 * 
 * This service provides comprehensive usage tracking, analytics, and limit enforcement
 * for the multi-tenant security architecture.
 */

import { supabaseAdmin } from '@/app/lib/supabase'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
// Define tier limits directly here since we removed the old auth file
const TIER_LIMITS = {
  free: {
    max_files: 10,
    max_llm_calls: 100,
    max_storage_bytes: 100 * 1024 * 1024, // 100MB
    features: ['basic_chat', 'document_upload']
  },
  pro: {
    max_files: 1000,
    max_llm_calls: 10000,
    max_storage_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    features: ['basic_chat', 'document_upload', 'advanced_search', 'api_access']
  },
  pro_byok: {
    max_files: -1, // unlimited
    max_llm_calls: -1, // unlimited
    max_storage_bytes: 50 * 1024 * 1024 * 1024, // 50GB
    features: ['basic_chat', 'document_upload', 'advanced_search', 'api_access', 'byok']
  }
}

export type SubscriptionTier = 'free' | 'pro' | 'pro_byok'
export type UsageAction = 
  | 'chat_message' 
  | 'document_upload' 
  | 'document_download'
  | 'api_call' 
  | 'vector_search'
  | 'embedding_generation'
  | 'file_processing'
  | 'storage_usage'
  | 'oauth_connection'
  | 'export_request'

export interface UsageLogEntry {
  userId: string
  action: UsageAction
  resourceType?: string
  resourceId?: string
  quantity: number
  ipAddress?: string
  userAgent?: string
  metadata: Record<string, any>
  costCents?: number
  timestamp: Date
}

export interface UsageLimits {
  maxFiles: number
  maxLlmCalls: number
  maxStorageBytes: number
  maxApiCalls: number
  features: string[]
}

export interface UsageStats {
  filesUploaded: number
  chatMessages: number
  apiCalls: number
  storageUsed: number
  vectorSearches: number
  embeddingsGenerated: number
  periodStart: Date
  periodEnd: Date
}

export interface UsageCheckResult {
  allowed: boolean
  currentUsage: number
  limit: number
  remaining: number
  tier: SubscriptionTier
  wouldExceed: boolean
  resetDate?: Date
}

/**
 * Usage Tracker Service
 */
export class UsageTracker {
  /**
   * Log a usage event
   */
  async logUsage(
    userId: string,
    action: UsageAction,
    options: {
      resourceType?: string
      resourceId?: string
      quantity?: number
      ipAddress?: string
      userAgent?: string
      metadata?: Record<string, any>
      costCents?: number
    } = {}
  ): Promise<void> {
    const {
      resourceType,
      resourceId,
      quantity = 1,
      ipAddress,
      userAgent,
      metadata = {},
      costCents = 0
    } = options

    try {
      // Use the secure database function for logging
      const { error } = await supabaseAdmin.rpc('log_usage', {
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        quantity,
        metadata: {
          ...metadata,
          ip_address: ipAddress,
          user_agent: userAgent,
          cost_cents: costCents,
          logged_at: new Date().toISOString()
        },
        user_id: userId
      })

      if (error) {
        throw error
      }

      logger.info('Usage logged successfully', {
        userId,
        action,
        resourceType,
        quantity,
        metadata
      })

    } catch (error) {
      logger.error('Failed to log usage', {
        userId,
        action,
        resourceType,
        quantity
      }, error as Error)

      // Don't throw - usage logging should not break main functionality
      // But we should track these failures
      try {
        await supabaseAdmin
          .from('private.audit_logs')
          .insert({
            user_id: userId,
            action: 'USAGE_LOGGING_FAILED',
            resource_type: 'usage_tracker',
            new_values: {
              original_action: action,
              error_message: (error as Error).message,
              failed_at: new Date().toISOString()
            },
            severity: 'warning'
          })
      } catch (auditError) {
        logger.error('Failed to log usage logging failure', auditError as Error)
      }
    }
  }

  /**
   * Check if user is within tier limits for a specific action
   */
  async checkTierLimits(
    userId: string,
    action: UsageAction,
    quantity: number = 1,
    periodDays: number = 30
  ): Promise<UsageCheckResult> {
    try {
      // Use the secure database function for limit checking
      const { data: result, error } = await supabaseAdmin
        .rpc('check_usage_limit', {
          action,
          user_id: userId,
          period_days: periodDays
        })

      if (error) {
        throw error
      }

      if (!result) {
        throw new Error('No usage limit result returned')
      }

      const wouldExceed = (result.current_usage + quantity) > result.limit

      return {
        allowed: !wouldExceed,
        currentUsage: result.current_usage,
        limit: result.limit,
        remaining: Math.max(0, result.limit - result.current_usage),
        tier: await this.getUserTier(userId),
        wouldExceed,
        resetDate: result.period_start ? new Date(result.period_start) : undefined
      }

    } catch (error) {
      logger.error('Failed to check tier limits', {
        userId,
        action,
        quantity,
        periodDays
      }, error as Error)

      // Return conservative result on error
      return {
        allowed: false,
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        tier: 'free',
        wouldExceed: true
      }
    }
  }

  /**
   * Enforce tier limits before allowing an action
   */
  async enforceTierLimits(
    userId: string,
    action: UsageAction,
    quantity: number = 1,
    periodDays: number = 30
  ): Promise<UsageCheckResult> {
    const result = await this.checkTierLimits(userId, action, quantity, periodDays)

    if (!result.allowed) {
      const error = createError.usageLimitExceeded(
        `${action} limit exceeded`,
        {
          action,
          currentUsage: result.currentUsage,
          limit: result.limit,
          tier: result.tier,
          resetDate: result.resetDate
        }
      )

      // Log the limit violation
      await this.logUsage(userId, action, {
        metadata: {
          limit_exceeded: true,
          current_usage: result.currentUsage,
          limit: result.limit,
          tier: result.tier
        }
      })

      throw error
    }

    return result
  }

  /**
   * Get comprehensive usage statistics for a user
   */
  async getUserUsageStats(
    userId: string,
    periodDays: number = 30
  ): Promise<UsageStats> {
    try {
      const periodStart = new Date()
      periodStart.setDate(periodStart.getDate() - periodDays)

      // Get usage counts by action type
      const { data: usageCounts, error } = await supabaseAdmin
        .from('app.usage_logs')
        .select('action, quantity')
        .eq('user_id', userId)
        .gte('created_at', periodStart.toISOString())

      if (error) {
        throw error
      }

      // Aggregate usage by action type
      const stats: UsageStats = {
        filesUploaded: 0,
        chatMessages: 0,
        apiCalls: 0,
        storageUsed: 0,
        vectorSearches: 0,
        embeddingsGenerated: 0,
        periodStart,
        periodEnd: new Date()
      }

      usageCounts?.forEach(entry => {
        const quantity = entry.quantity || 1
        
        switch (entry.action) {
          case 'document_upload':
            stats.filesUploaded += quantity
            break
          case 'chat_message':
            stats.chatMessages += quantity
            break
          case 'api_call':
            stats.apiCalls += quantity
            break
          case 'storage_usage':
            stats.storageUsed += quantity
            break
          case 'vector_search':
            stats.vectorSearches += quantity
            break
          case 'embedding_generation':
            stats.embeddingsGenerated += quantity
            break
        }
      })

      return stats

    } catch (error) {
      logger.error('Failed to get user usage stats', { userId, periodDays }, error as Error)
      
      return {
        filesUploaded: 0,
        chatMessages: 0,
        apiCalls: 0,
        storageUsed: 0,
        vectorSearches: 0,
        embeddingsGenerated: 0,
        periodStart: new Date(),
        periodEnd: new Date()
      }
    }
  }

  /**
   * Get user's subscription tier
   */
  private async getUserTier(userId: string): Promise<SubscriptionTier> {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('app.users')
        .select('subscription_tier')
        .eq('id', userId)
        .single()

      if (error || !user) {
        return 'free'
      }

      return user.subscription_tier as SubscriptionTier

    } catch (error) {
      logger.error('Failed to get user tier', { userId }, error as Error)
      return 'free'
    }
  }

  /**
   * Get tier limits for a user
   */
  async getTierLimits(userId: string): Promise<UsageLimits> {
    const tier = await this.getUserTier(userId)
    const limits = TIER_LIMITS[tier]

    return {
      maxFiles: limits.max_files,
      maxLlmCalls: limits.max_llm_calls,
      maxStorageBytes: limits.max_storage_bytes,
      maxApiCalls: 10000, // Default API call limit
      features: limits.features
    }
  }

  /**
   * Check if user has a specific feature enabled
   */
  async hasFeature(userId: string, feature: string): Promise<boolean> {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('app.users')
        .select('features_enabled, subscription_tier')
        .eq('id', userId)
        .single()

      if (error || !user) {
        return false
      }

      // Check user-specific feature flags
      if (user.features_enabled && user.features_enabled[feature]) {
        return true
      }

      // Check tier-based features
      const tierLimits = TIER_LIMITS[user.subscription_tier as SubscriptionTier]
      return tierLimits.features.includes(feature)

    } catch (error) {
      logger.error('Failed to check user feature', { userId, feature }, error as Error)
      return false
    }
  }

  /**
   * Get usage analytics for admin dashboard
   */
  async getUsageAnalytics(
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'hour' | 'action' = 'day'
  ): Promise<any[]> {
    try {
      let query = supabaseAdmin
        .from('app.usage_logs')
        .select('action, quantity, created_at, user_id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const { data: logs, error } = await query.limit(10000)

      if (error) {
        throw error
      }

      if (!logs || logs.length === 0) {
        return []
      }

      // Group and aggregate data based on groupBy parameter
      const grouped = this.groupUsageData(logs, groupBy)
      return grouped

    } catch (error) {
      logger.error('Failed to get usage analytics', {
        startDate,
        endDate,
        groupBy
      }, error as Error)
      
      return []
    }
  }

  /**
   * Group usage data for analytics
   */
  private groupUsageData(logs: any[], groupBy: 'day' | 'hour' | 'action'): any[] {
    const grouped = new Map()

    logs.forEach(log => {
      let key: string

      switch (groupBy) {
        case 'day':
          key = new Date(log.created_at).toISOString().split('T')[0]
          break
        case 'hour':
          const date = new Date(log.created_at)
          key = `${date.toISOString().split('T')[0]} ${date.getHours()}:00`
          break
        case 'action':
          key = log.action
          break
        default:
          key = log.action
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          total_quantity: 0,
          unique_users: new Set(),
          actions: new Map()
        })
      }

      const group = grouped.get(key)
      group.total_quantity += log.quantity || 1
      group.unique_users.add(log.user_id)

      if (!group.actions.has(log.action)) {
        group.actions.set(log.action, 0)
      }
      group.actions.set(log.action, group.actions.get(log.action) + (log.quantity || 1))
    })

    // Convert to array and format
    return Array.from(grouped.values()).map(group => ({
      key: group.key,
      total_quantity: group.total_quantity,
      unique_users: group.unique_users.size,
      actions: Object.fromEntries(group.actions)
    }))
  }

  /**
   * Reset usage counters (for monthly billing cycles)
   */
  async resetUsageCounters(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Reset for specific user
        await supabaseAdmin
          .from('app.users')
          .update({
            chat_messages_count: 0,
            documents_uploaded: 0,
            api_calls_count: 0,
            usage_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)

        logger.info('Usage counters reset for user', { userId })
      } else {
        // Reset for all users (monthly job)
        const { error } = await supabaseAdmin.rpc('reset_monthly_usage')
        
        if (error) {
          throw error
        }

        logger.info('Monthly usage reset completed for all users')
      }

    } catch (error) {
      logger.error('Failed to reset usage counters', { userId }, error as Error)
      throw createError.databaseError('Failed to reset usage counters', error as Error)
    }
  }
}

/**
 * Singleton instance
 */
let usageTracker: UsageTracker | null = null

/**
 * Get the usage tracker instance
 */
export function getUsageTracker(): UsageTracker {
  if (!usageTracker) {
    usageTracker = new UsageTracker()
  }
  return usageTracker
}

/**
 * Convenience functions
 */

/**
 * Log usage for an action
 */
export async function logUsage(
  userId: string,
  action: UsageAction,
  options?: {
    resourceType?: string
    resourceId?: string
    quantity?: number
    ipAddress?: string
    userAgent?: string
    metadata?: Record<string, any>
    costCents?: number
  }
): Promise<void> {
  const tracker = getUsageTracker()
  return tracker.logUsage(userId, action, options)
}

/**
 * Check and enforce tier limits
 */
export async function checkUsageLimits(
  userId: string,
  action: UsageAction,
  quantity?: number
): Promise<UsageCheckResult> {
  const tracker = getUsageTracker()
  return tracker.enforceTierLimits(userId, action, quantity)
}

/**
 * Get user usage statistics
 */
export async function getUserUsageStats(
  userId: string,
  periodDays?: number
): Promise<UsageStats> {
  const tracker = getUsageTracker()
  return tracker.getUserUsageStats(userId, periodDays)
}

/**
 * Check if user has a feature
 */
export async function hasFeature(userId: string, feature: string): Promise<boolean> {
  const tracker = getUsageTracker()
  return tracker.hasFeature(userId, feature)
}