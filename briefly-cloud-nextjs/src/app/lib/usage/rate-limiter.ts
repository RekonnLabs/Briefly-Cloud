/**
 * Rate Limiting Service
 * 
 * This service implements per-user rate limiting with sliding windows
 * and tier-based limits for the multi-tenant architecture.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export type RateLimitWindow = 'minute' | 'hour' | 'day' | 'month'
export type RateLimitAction = 
  | 'api_request'
  | 'chat_message'
  | 'document_upload'
  | 'vector_search'
  | 'embedding_generation'
  | 'file_download'
  | 'oauth_request'

// Rate limit configurations for different actions
export const rateLimitConfigs = {
  api_request: {
    minute: 100,
    hour: 1000,
    day: 10000
  },
  chat_message: {
    minute: 30,
    hour: 500,
    day: 2000
  },
  document_upload: {
    minute: 10,
    hour: 100,
    day: 500
  },
  vector_search: {
    minute: 50,
    hour: 1000,
    day: 5000
  },
  embedding_generation: {
    minute: 20,
    hour: 200,
    day: 1000
  },
  file_download: {
    minute: 20,
    hour: 200,
    day: 1000
  },
  oauth_request: {
    minute: 5,
    hour: 20,
    day: 100
  }
} as const

export interface RateLimitConfig {
  action: RateLimitAction
  window: RateLimitWindow
  limit: number
  tier?: string
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: Date
  retryAfter?: number
}

export interface RateLimitStatus {
  action: RateLimitAction
  window: RateLimitWindow
  current: number
  limit: number
  remaining: number
  resetTime: Date
  windowStart: Date
}

/**
 * Rate Limiter Service
 */
export class RateLimiter {
  private static readonly DEFAULT_LIMITS: Record<string, Record<RateLimitWindow, Record<RateLimitAction, number>>> = {
    free: {
      minute: {
        api_request: 10,
        chat_message: 5,
        document_upload: 2,
        vector_search: 10,
        embedding_generation: 5,
        file_download: 10,
        oauth_request: 2
      },
      hour: {
        api_request: 100,
        chat_message: 50,
        document_upload: 20,
        vector_search: 100,
        embedding_generation: 50,
        file_download: 100,
        oauth_request: 10
      },
      day: {
        api_request: 1000,
        chat_message: 100,
        document_upload: 25,
        vector_search: 500,
        embedding_generation: 100,
        file_download: 500,
        oauth_request: 50
      },
      month: {
        api_request: 10000,
        chat_message: 100,
        document_upload: 25,
        vector_search: 1000,
        embedding_generation: 100,
        file_download: 1000,
        oauth_request: 100
      }
    },
    pro: {
      minute: {
        api_request: 30,
        chat_message: 15,
        document_upload: 10,
        vector_search: 30,
        embedding_generation: 15,
        file_download: 30,
        oauth_request: 5
      },
      hour: {
        api_request: 500,
        chat_message: 200,
        document_upload: 100,
        vector_search: 500,
        embedding_generation: 200,
        file_download: 500,
        oauth_request: 50
      },
      day: {
        api_request: 5000,
        chat_message: 400,
        document_upload: 500,
        vector_search: 2000,
        embedding_generation: 400,
        file_download: 2000,
        oauth_request: 200
      },
      month: {
        api_request: 50000,
        chat_message: 400,
        document_upload: 500,
        vector_search: 10000,
        embedding_generation: 400,
        file_download: 10000,
        oauth_request: 500
      }
    },
    pro_byok: {
      minute: {
        api_request: 100,
        chat_message: 50,
        document_upload: 20,
        vector_search: 100,
        embedding_generation: 50,
        file_download: 100,
        oauth_request: 10
      },
      hour: {
        api_request: 2000,
        chat_message: 1000,
        document_upload: 500,
        vector_search: 2000,
        embedding_generation: 1000,
        file_download: 2000,
        oauth_request: 100
      },
      day: {
        api_request: 20000,
        chat_message: 2000,
        document_upload: 5000,
        vector_search: 10000,
        embedding_generation: 2000,
        file_download: 10000,
        oauth_request: 1000
      },
      month: {
        api_request: 200000,
        chat_message: 2000,
        document_upload: 5000,
        vector_search: 50000,
        embedding_generation: 2000,
        file_download: 50000,
        oauth_request: 2000
      }
    }
  }

  /**
   * Check rate limit for a user action
   */
  async checkRateLimit(
    userId: string,
    action: RateLimitAction,
    window: RateLimitWindow = 'minute',
    increment: number = 1
  ): Promise<RateLimitResult> {
    try {
      const windowStart = this.getWindowStart(window)
      const limit = await this.getLimitForUser(userId, action, window)
      
      // Get current count for this window
      const { data: rateLimit, error } = await supabaseAdmin
        .from('app.rate_limits')
        .select('count')
        .eq('user_id', userId)
        .eq('limit_type', window)
        .eq('action', action)
        .eq('window_start', windowStart.toISOString())
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      const currentCount = rateLimit?.count || 0
      const remaining = Math.max(0, limit - currentCount)
      const allowed = (currentCount + increment) <= limit
      const resetTime = this.getWindowEnd(window, windowStart)

      let retryAfter: number | undefined
      if (!allowed) {
        retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      }

      return {
        allowed,
        limit,
        remaining,
        resetTime,
        retryAfter
      }

    } catch (error) {
      logger.error('Failed to check rate limit', {
        userId,
        action,
        window,
        increment
      }, error as Error)

      // Return conservative result on error
      return {
        allowed: false,
        limit: 1,
        remaining: 0,
        resetTime: new Date(Date.now() + 60000), // 1 minute from now
        retryAfter: 60
      }
    }
  }

  /**
   * Enforce rate limit and increment counter if allowed
   */
  async enforceRateLimit(
    userId: string,
    action: RateLimitAction,
    window: RateLimitWindow = 'minute',
    increment: number = 1
  ): Promise<RateLimitResult> {
    const result = await this.checkRateLimit(userId, action, window, increment)

    if (!result.allowed) {
      // Log rate limit violation
      await supabaseAdmin
        .from('private.audit_logs')
        .insert({
          user_id: userId,
          action: 'RATE_LIMIT_EXCEEDED',
          resource_type: 'rate_limiter',
          new_values: {
            action,
            window,
            limit: result.limit,
            retry_after: result.retryAfter
          },
          severity: 'warning'
        })

      const error = createError.rateLimitExceeded(
        `Rate limit exceeded for ${action}`,
        {
          action,
          window,
          limit: result.limit,
          retryAfter: result.retryAfter
        }
      )

      throw error
    }

    // Increment the counter
    await this.incrementCounter(userId, action, window, increment)

    return result
  }

  /**
   * Increment rate limit counter
   */
  private async incrementCounter(
    userId: string,
    action: RateLimitAction,
    window: RateLimitWindow,
    increment: number
  ): Promise<void> {
    try {
      const windowStart = this.getWindowStart(window)

      // Upsert the rate limit record
      const { error } = await supabaseAdmin
        .from('app.rate_limits')
        .upsert({
          user_id: userId,
          limit_type: window,
          action,
          window_start: windowStart.toISOString(),
          count: increment
        }, {
          onConflict: 'user_id,limit_type,action,window_start',
          ignoreDuplicates: false
        })

      if (error) {
        // If upsert failed, try to increment existing record
        await supabaseAdmin.rpc('increment_rate_limit', {
          p_user_id: userId,
          p_limit_type: window,
          p_action: action,
          p_window_start: windowStart.toISOString(),
          p_increment: increment
        })
      }

    } catch (error) {
      logger.error('Failed to increment rate limit counter', {
        userId,
        action,
        window,
        increment
      }, error as Error)
      
      // Don't throw - rate limiting should be best effort
    }
  }

  /**
   * Get rate limit status for a user
   */
  async getRateLimitStatus(
    userId: string,
    actions?: RateLimitAction[],
    windows?: RateLimitWindow[]
  ): Promise<RateLimitStatus[]> {
    try {
      const actionsToCheck = actions || ['api_request', 'chat_message', 'document_upload']
      const windowsToCheck = windows || ['minute', 'hour', 'day']
      
      const statuses: RateLimitStatus[] = []

      for (const action of actionsToCheck) {
        for (const window of windowsToCheck) {
          const windowStart = this.getWindowStart(window)
          const limit = await this.getLimitForUser(userId, action, window)

          const { data: rateLimit } = await supabaseAdmin
            .from('app.rate_limits')
            .select('count')
            .eq('user_id', userId)
            .eq('limit_type', window)
            .eq('action', action)
            .eq('window_start', windowStart.toISOString())
            .single()

          const current = rateLimit?.count || 0
          const remaining = Math.max(0, limit - current)
          const resetTime = this.getWindowEnd(window, windowStart)

          statuses.push({
            action,
            window,
            current,
            limit,
            remaining,
            resetTime,
            windowStart
          })
        }
      }

      return statuses

    } catch (error) {
      logger.error('Failed to get rate limit status', { userId }, error as Error)
      return []
    }
  }

  /**
   * Get rate limit for a specific user, action, and window
   */
  private async getLimitForUser(
    userId: string,
    action: RateLimitAction,
    window: RateLimitWindow
  ): Promise<number> {
    try {
      // Get user's subscription tier
      const { data: user, error } = await supabaseAdmin
        .from('app.users')
        .select('subscription_tier')
        .eq('id', userId)
        .single()

      if (error || !user) {
        return this.DEFAULT_LIMITS.free[window][action]
      }

      const tier = user.subscription_tier || 'free'
      return this.DEFAULT_LIMITS[tier]?.[window]?.[action] || this.DEFAULT_LIMITS.free[window][action]

    } catch (error) {
      logger.error('Failed to get user tier for rate limiting', { userId }, error as Error)
      return this.DEFAULT_LIMITS.free[window][action]
    }
  }

  /**
   * Get window start time
   */
  private getWindowStart(window: RateLimitWindow): Date {
    const now = new Date()
    
    switch (window) {
      case 'minute':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
      case 'hour':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate())
      case 'month':
        return new Date(now.getFullYear(), now.getMonth())
      default:
        return now
    }
  }

  /**
   * Get window end time
   */
  private getWindowEnd(window: RateLimitWindow, windowStart: Date): Date {
    const end = new Date(windowStart)
    
    switch (window) {
      case 'minute':
        end.setMinutes(end.getMinutes() + 1)
        break
      case 'hour':
        end.setHours(end.getHours() + 1)
        break
      case 'day':
        end.setDate(end.getDate() + 1)
        break
      case 'month':
        end.setMonth(end.getMonth() + 1)
        break
    }
    
    return end
  }

  /**
   * Clean up old rate limit records
   */
  async cleanupOldRecords(olderThanHours: number = 24): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)

      const { error } = await supabaseAdmin
        .from('app.rate_limits')
        .delete()
        .lt('window_start', cutoffTime.toISOString())

      if (error) {
        throw error
      }

      logger.info('Rate limit cleanup completed', { olderThanHours, cutoffTime })

    } catch (error) {
      logger.error('Failed to cleanup old rate limit records', { olderThanHours }, error as Error)
    }
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserRateLimits(userId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('app.rate_limits')
        .delete()
        .eq('user_id', userId)

      if (error) {
        throw error
      }

      // Log the reset
      await supabaseAdmin
        .from('private.audit_logs')
        .insert({
          user_id: userId,
          action: 'RATE_LIMITS_RESET',
          resource_type: 'rate_limiter',
          new_values: {
            reset_by: 'admin',
            reset_at: new Date().toISOString()
          },
          severity: 'info'
        })

      logger.info('Rate limits reset for user', { userId })

    } catch (error) {
      logger.error('Failed to reset user rate limits', { userId }, error as Error)
      throw createError.databaseError('Failed to reset rate limits', error as Error)
    }
  }
}

/**
 * Singleton instance
 */
let rateLimiter: RateLimiter | null = null

/**
 * Get the rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter()
  }
  return rateLimiter
}

/**
 * Convenience functions
 */

/**
 * Check rate limit for an action
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  window?: RateLimitWindow
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  return limiter.checkRateLimit(userId, action, window)
}

/**
 * Enforce rate limit for an action
 */
export async function enforceRateLimit(
  userId: string,
  action: RateLimitAction,
  window?: RateLimitWindow
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  return limiter.enforceRateLimit(userId, action, window)
}

/**
 * Get rate limit status for a user
 */
export async function getRateLimitStatus(
  userId: string,
  actions?: RateLimitAction[],
  windows?: RateLimitWindow[]
): Promise<RateLimitStatus[]> {
  const limiter = getRateLimiter()
  return limiter.getRateLimitStatus(userId, actions, windows)
}