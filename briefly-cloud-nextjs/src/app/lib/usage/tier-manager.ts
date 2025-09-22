/**
 * Subscription Tier Management Service
 * 
 * This service manages subscription tiers, limits, and enforcement
 * for the multi-tenant security architecture.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { TIER_LIMITS, type SubscriptionTier } from './usage-tracker'

export interface TierUpgrade {
  fromTier: SubscriptionTier
  toTier: SubscriptionTier
  effectiveDate: string
  billingCycleReset: boolean
}

export interface UsageLimit {
  current: number
  limit: number
  remaining: number
  percentUsed: number
  resetDate: string
}

export interface TierStatus {
  tier: SubscriptionTier
  status: 'active' | 'inactive' | 'cancelled' | 'past_due'
  billingCycle: 'monthly' | 'yearly'
  nextBillingDate: string
  limits: {
    chatMessages: UsageLimit
    documents: UsageLimit
    apiCalls: UsageLimit
    storage: UsageLimit
  }
  features: Record<string, boolean>
}

export interface UpgradeRecommendation {
  reason: string
  currentUsage: number
  currentLimit: number
  recommendedTier: SubscriptionTier
  benefits: string[]
  estimatedCost?: number
}

/**
 * Tier Manager Service
 */
export class TierManager {
  /**
   * Get user's current subscription tier and status
   */
  async getUserSubscription(userId: string): Promise<TierStatus> {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select(`
          subscription_tier,
          subscription_status,
          billing_cycle,
          next_billing_date,
          chat_messages_count,
          chat_messages_limit,
          documents_uploaded,
          documents_limit,
          api_calls_count,
          api_calls_limit,
          storage_used_bytes,
          storage_limit_bytes,
          usage_reset_date,
          features_enabled
        `)
        .eq('id', userId)
        .single()

      if (error || !user) {
        throw new Error('User not found or access denied')
      }

      const tier = user.subscription_tier as SubscriptionTier
      const tierLimits = TIER_LIMITS[tier]

      // Calculate usage limits
      const chatLimit = user.chat_messages_limit || tierLimits.max_llm_calls
      const docLimit = user.documents_limit || tierLimits.max_files
      const apiLimit = user.api_calls_limit || tierLimits.max_api_calls
      const storageLimit = user.storage_limit_bytes || tierLimits.max_storage_bytes

      const chatCurrent = user.chat_messages_count || 0
      const docCurrent = user.documents_uploaded || 0
      const apiCurrent = user.api_calls_count || 0
      const storageCurrent = user.storage_used_bytes || 0

      return {
        tier,
        status: user.subscription_status,
        billingCycle: user.billing_cycle || 'monthly',
        nextBillingDate: user.next_billing_date || new Date().toISOString(),
        limits: {
          chatMessages: {
            current: chatCurrent,
            limit: chatLimit === -1 ? Infinity : chatLimit,
            remaining: chatLimit === -1 ? Infinity : Math.max(0, chatLimit - chatCurrent),
            percentUsed: chatLimit === -1 ? 0 : Math.min(100, (chatCurrent / chatLimit) * 100),
            resetDate: user.usage_reset_date || new Date().toISOString()
          },
          documents: {
            current: docCurrent,
            limit: docLimit === -1 ? Infinity : docLimit,
            remaining: docLimit === -1 ? Infinity : Math.max(0, docLimit - docCurrent),
            percentUsed: docLimit === -1 ? 0 : Math.min(100, (docCurrent / docLimit) * 100),
            resetDate: user.usage_reset_date || new Date().toISOString()
          },
          apiCalls: {
            current: apiCurrent,
            limit: apiLimit === -1 ? Infinity : apiLimit,
            remaining: apiLimit === -1 ? Infinity : Math.max(0, apiLimit - apiCurrent),
            percentUsed: apiLimit === -1 ? 0 : Math.min(100, (apiCurrent / apiLimit) * 100),
            resetDate: user.usage_reset_date || new Date().toISOString()
          },
          storage: {
            current: storageCurrent,
            limit: storageLimit === -1 ? Infinity : storageLimit,
            remaining: storageLimit === -1 ? Infinity : Math.max(0, storageLimit - storageCurrent),
            percentUsed: storageLimit === -1 ? 0 : Math.min(100, (storageCurrent / storageLimit) * 100),
            resetDate: user.usage_reset_date || new Date().toISOString()
          }
        },
        features: {
          ...tierLimits.features,
          ...(user.features_enabled || {})
        }
      }

    } catch (error) {
      logger.error('Failed to get user subscription', { userId }, error as Error)
      throw createError.databaseError('Failed to get subscription info', error as Error)
    }
  }

  /**
   * Check if user has access to a specific feature
   */
  async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId)
      return subscription.features[feature] || false
    } catch (error) {
      logger.error('Failed to check feature access', { userId, feature }, error as Error)
      return false
    }
  }

  /**
   * Enforce action limits before allowing an operation
   */
  async enforceActionLimits(
    userId: string,
    action: 'upload' | 'chat' | 'api_call' | 'storage',
    quantity: number = 1
  ): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId)
      
      if (subscription.status !== 'active') {
        throw createError.paymentRequired('Subscription is not active')
      }

      let limit: UsageLimit
      let actionName: string

      switch (action) {
        case 'chat':
          limit = subscription.limits.chatMessages
          actionName = 'chat messages'
          break
        case 'upload':
          limit = subscription.limits.documents
          actionName = 'document uploads'
          break
        case 'api_call':
          limit = subscription.limits.apiCalls
          actionName = 'API calls'
          break
        case 'storage':
          limit = subscription.limits.storage
          actionName = 'storage'
          break
        default:
          throw new Error(`Unknown action: ${action}`)
      }

      // Check if adding the quantity would exceed the limit
      if (limit.limit !== Infinity && (limit.current + quantity) > limit.limit) {
        throw createError.paymentRequired(
          `${actionName} limit exceeded. You have used ${limit.current}/${limit.limit} for your ${subscription.tier} plan. Upgrade to increase your limits.`
        )
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('limit exceeded')) {
        throw error
      }
      
      logger.error('Failed to enforce action limits', {
        userId,
        action,
        quantity
      }, error as Error)
      
      // Don't block operations due to limit checking errors
      logger.warn('Allowing operation despite limit check failure', {
        userId,
        action,
        quantity
      })
    }
  }

  /**
   * Get upgrade recommendations based on usage patterns
   */
  async getUpgradeRecommendations(userId: string): Promise<UpgradeRecommendation[]> {
    try {
      const subscription = await this.getUserSubscription(userId)
      const recommendations: UpgradeRecommendation[] = []

      // Skip recommendations for highest tier
      if (subscription.tier === 'pro_byok') {
        return recommendations
      }

      // Check each limit type for potential upgrades
      const limits = subscription.limits
      
      // Chat messages recommendation
      if (limits.chatMessages.percentUsed > 80) {
        const nextTier = subscription.tier === 'free' ? 'pro' : 'pro_byok'
        recommendations.push({
          reason: 'High chat message usage',
          currentUsage: limits.chatMessages.current,
          currentLimit: limits.chatMessages.limit,
          recommendedTier: nextTier,
          benefits: [
            `Increase chat limit to ${TIER_LIMITS[nextTier].max_llm_calls === -1 ? 'unlimited' : TIER_LIMITS[nextTier].max_llm_calls}`,
            'Priority support',
            'Advanced features'
          ]
        })
      }

      // Document upload recommendation
      if (limits.documents.percentUsed > 80) {
        const nextTier = subscription.tier === 'free' ? 'pro' : 'pro_byok'
        recommendations.push({
          reason: 'High document upload usage',
          currentUsage: limits.documents.current,
          currentLimit: limits.documents.limit,
          recommendedTier: nextTier,
          benefits: [
            `Increase document limit to ${TIER_LIMITS[nextTier].max_files}`,
            'Larger file size support',
            'Batch processing'
          ]
        })
      }

      return recommendations

    } catch (error) {
      logger.error('Failed to get upgrade recommendations', { userId }, error as Error)
      return []
    }
  }
}

// Singleton instance
let tierManager: TierManager | null = null

/**
 * Get the tier manager instance
 */
export function getTierManager(): TierManager {
  if (!tierManager) {
    tierManager = new TierManager()
  }
  return tierManager
}

/**
 * Convenience functions
 */

export async function getUserSubscription(userId: string): Promise<TierStatus> {
  const manager = getTierManager()
  return manager.getUserSubscription(userId)
}

export async function hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
  const manager = getTierManager()
  return manager.hasFeatureAccess(userId, feature)
}

export async function enforceActionLimits(
  userId: string,
  action: 'upload' | 'chat' | 'api_call' | 'storage',
  quantity?: number
): Promise<void> {
  const manager = getTierManager()
  return manager.enforceActionLimits(userId, action, quantity)
}

export async function getUpgradeRecommendations(userId: string): Promise<UpgradeRecommendation[]> {
  const manager = getTierManager()
  return manager.getUpgradeRecommendations(userId)
}
