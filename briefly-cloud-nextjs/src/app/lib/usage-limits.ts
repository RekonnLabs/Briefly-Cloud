import { supabaseApp } from './supabase-clients'
import type { User } from './supabase'
import { getUserById, updateUser } from './supabase'

// Updated tier limits (migrated from Python)
export const TIER_LIMITS = {
  free: {
    documents: 25,
    chat_messages: 100,
    api_calls: 1000,
    storage_bytes: 104857600, // 100MB
  },
  pro: {
    documents: 500,
    chat_messages: 400,
    api_calls: 10000,
    storage_bytes: 1073741824, // 1GB
  },
  pro_byok: {
    documents: 5000,
    chat_messages: 2000,
    api_calls: 50000,
    storage_bytes: 10737418240, // 10GB
  }
} as const

export type SubscriptionTier = keyof typeof TIER_LIMITS
export type LimitType = keyof typeof TIER_LIMITS[SubscriptionTier]

export class UsageLimitError extends Error {
  constructor(
    public limitType: string,
    public current: number,
    public limit: number,
    public tier: string,
    public upgradeRequired: boolean = false
  ) {
    super(`Usage limit exceeded for ${limitType}: ${current}/${limit} (${tier} tier)`)
    this.name = 'UsageLimitError'
  }

  toJSON() {
    return {
      error: 'usage_limit_exceeded',
      message: `You have exceeded your ${this.limitType} limit for the ${this.tier} tier`,
      current_usage: this.current,
      limit: this.limit,
      tier: this.tier,
      upgrade_required: this.upgradeRequired
    }
  }
}

export interface UsageData {
  tier: SubscriptionTier
  current: number
  limit: number
  would_exceed: boolean
  remaining: number
}

export async function getUserUsage(userId: string): Promise<User | null> {
  try {
    return await getUserById(userId)
  } catch (error) {
    console.error(`Error fetching user usage for ${userId}:`, error)
    return null
  }
}

export async function checkUsageLimit(
  userId: string,
  limitType: LimitType,
  increment: number = 1
): Promise<{ withinLimits: boolean; usageData: UsageData }> {
  const user = await getUserUsage(userId)
  if (!user) {
    return {
      withinLimits: false,
      usageData: {
        tier: 'free',
        current: 0,
        limit: 0,
        would_exceed: true,
        remaining: 0
      }
    }
  }

  const tier = user.subscription_tier as SubscriptionTier
  const tierLimits = TIER_LIMITS[tier]

  // Map limit types to database columns
  const limitMapping = {
    documents: {
      current: user.documents_uploaded || 0,
      limit: user.documents_limit || tierLimits.documents
    },
    chat_messages: {
      current: user.chat_messages_count || 0,
      limit: user.chat_messages_limit || tierLimits.chat_messages
    },
    api_calls: {
      current: user.api_calls_count || 0,
      limit: user.api_calls_limit || tierLimits.api_calls
    },
    storage_bytes: {
      current: user.storage_used_bytes || 0,
      limit: user.storage_limit_bytes || tierLimits.storage_bytes
    }
  }

  const { current, limit } = limitMapping[limitType]
  const wouldExceed = (current + increment) > limit

  return {
    withinLimits: !wouldExceed,
    usageData: {
      tier,
      current,
      limit,
      would_exceed: wouldExceed,
      remaining: Math.max(0, limit - current)
    }
  }
}

export async function enforceUsageLimit(
  userId: string,
  limitType: LimitType,
  increment: number = 1
): Promise<UsageData> {
  const { withinLimits, usageData } = await checkUsageLimit(userId, limitType, increment)

  if (!withinLimits) {
    throw new UsageLimitError(
      limitType,
      usageData.current,
      usageData.limit,
      usageData.tier,
      usageData.tier === 'free'
    )
  }

  return usageData
}

export async function incrementUsageCounter(
  userId: string,
  eventType: 'document_upload' | 'chat_message' | 'api_call',
  resourceCount: number = 1,
  eventData: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    // Try to use database function first (if available) in app schema
    const { data, error } = await supabaseApp.rpc('increment_usage', {
      p_user_id: userId,
      p_event_type: eventType,
      p_resource_count: resourceCount,
      p_event_data: eventData
    })

    if (!error) {
      return data || true
    }

    // Fallback to manual increment if RPC function doesn't exist
    console.warn('RPC function not available, using manual increment')
    return await manualIncrementUsage(userId, eventType, resourceCount)

  } catch (error) {
    console.error(`Error incrementing usage for ${userId}:`, error)
    // Try manual increment as fallback
    return await manualIncrementUsage(userId, eventType, resourceCount)
  }
}

async function manualIncrementUsage(
  userId: string,
  eventType: 'document_upload' | 'chat_message' | 'api_call',
  resourceCount: number
): Promise<boolean> {
  try {
    const user = await getUserById(userId)
    if (!user) return false

    const updates: Partial<User> = {}

    switch (eventType) {
      case 'document_upload':
        updates.documents_uploaded = (user.documents_uploaded || 0) + resourceCount
        break
      case 'chat_message':
        updates.chat_messages_count = (user.chat_messages_count || 0) + resourceCount
        break
      case 'api_call':
        updates.api_calls_count = (user.api_calls_count || 0) + resourceCount
        break
    }

    await updateUser(userId, updates)
    return true

  } catch (error) {
    console.error(`Error in manual increment for ${userId}:`, error)
    return false
  }
}

export async function checkAndIncrementUsage(
  userId: string,
  limitType: LimitType,
  eventType: 'document_upload' | 'chat_message' | 'api_call',
  increment: number = 1,
  eventData: Record<string, unknown> = {}
): Promise<UsageData> {
  // First check if within limits
  const usageData = await enforceUsageLimit(userId, limitType, increment)

  // If within limits, increment the counter
  const success = await incrementUsageCounter(userId, eventType, increment, eventData)

  if (!success) {
    console.error(`Failed to increment usage counter for ${userId}`)
  }

  return usageData
}

export function getUsageWarningThreshold(tier: SubscriptionTier, limitType: LimitType): number {
  const tierLimits = TIER_LIMITS[tier]
  if (!tierLimits || !(limitType in tierLimits)) {
    return 0
  }

  const limit = tierLimits[limitType]
  // Warn at 80% of limit
  return Math.floor(limit * 0.8)
}

export function formatStorageSize(bytesSize: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytesSize
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export function getUpgradeMessage(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free':
      return 'Upgrade to Pro for higher limits and better performance.'
    case 'pro':
      return 'Consider Pro BYOK for even higher limits with your own API keys.'
    case 'pro_byok':
      return "You're on our highest tier. Contact support for enterprise options."
    default:
      return 'Upgrade your plan for higher limits.'
  }
}

export async function resetMonthlyUsage(): Promise<boolean> {
  try {
    const { error } = await supabaseApp.rpc('reset_monthly_usage')
    if (error) {
      console.error('Error resetting monthly usage:', error)
      return false
    }
    console.info('Monthly usage reset completed')
    return true
  } catch (error) {
    console.error('Error resetting monthly usage:', error)
    return false
  }
}

export async function getUsageAnalytics(days: number = 30): Promise<unknown[]> {
  try {
    const { data, error } = await supabaseApp
      .from('usage_analytics')
      .select('*')
      .limit(days * 10)

    if (error) {
      console.error('Error fetching usage analytics:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error fetching usage analytics:', error)
    return []
  }
}

// Usage logging for analytics in app schema
export async function logUsage(
  userId: string,
  action: string,
  details: Record<string, unknown> = {},
  costCents: number = 0
): Promise<boolean> {
  try {
    const { error } = await supabaseApp
      .from('usage_logs')
      .insert({
        user_id: userId,
        action,
        details,
        cost_cents: costCents
      })

    if (error) {
      console.error('Error logging usage:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error logging usage:', error)
    return false
  }
}
