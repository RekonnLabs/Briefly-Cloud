/**
 * Feature Flags and Staged Rollout System
 * 
 * This module provides a comprehensive feature flag system for gradual rollouts,
 * A/B testing, and user tier-based feature management.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { cache } from './cache';

// Feature flag types
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  user_tiers: string[];
  beta_users: string[];
  ab_test_config?: ABTestConfig;
  created_at: Date;
  updated_at: Date;
}

export interface ABTestConfig {
  test_name: string;
  variants: ABTestVariant[];
  traffic_split: Record<string, number>;
  metrics: string[];
  start_date: Date;
  end_date?: Date;
}

export interface ABTestVariant {
  name: string;
  description: string;
  config: Record<string, any>;
}

export interface UserContext {
  user_id: string;
  email: string;
  subscription_tier: 'free' | 'pro' | 'pro_byok';
  is_beta_user: boolean;
  created_at: Date;
}

export interface FeatureFlagResult {
  enabled: boolean;
  variant?: string;
  config?: Record<string, any>;
  reason: string;
}

class FeatureFlagService {
  private supabase;
  private cache_ttl = 300; // 5 minutes

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Check if a feature is enabled for a specific user
   */
  async isFeatureEnabled(
    featureName: string,
    userContext: UserContext
  ): Promise<FeatureFlagResult> {
    try {
      const flag = await this.getFeatureFlag(featureName);
      
      if (!flag) {
        return {
          enabled: false,
          reason: 'Feature flag not found'
        };
      }

      // Check if feature is globally disabled
      if (!flag.enabled) {
        return {
          enabled: false,
          reason: 'Feature globally disabled'
        };
      }

      // Check user tier restrictions
      if (flag.user_tiers.length > 0 && !flag.user_tiers.includes(userContext.subscription_tier)) {
        return {
          enabled: false,
          reason: `Feature not available for ${userContext.subscription_tier} tier`
        };
      }

      // Check beta user access
      if (flag.beta_users.length > 0) {
        if (flag.beta_users.includes(userContext.user_id) || userContext.is_beta_user) {
          return {
            enabled: true,
            reason: 'Beta user access'
          };
        }
        return {
          enabled: false,
          reason: 'Feature limited to beta users'
        };
      }

      // Check rollout percentage
      if (flag.rollout_percentage < 100) {
        const userHash = this.getUserHash(userContext.user_id, featureName);
        const isInRollout = userHash < flag.rollout_percentage;
        
        if (!isInRollout) {
          return {
            enabled: false,
            reason: `User not in ${flag.rollout_percentage}% rollout`
          };
        }
      }

      // Handle A/B testing
      if (flag.ab_test_config) {
        const variant = this.getABTestVariant(flag.ab_test_config, userContext);
        return {
          enabled: true,
          variant: variant.name,
          config: variant.config,
          reason: `A/B test variant: ${variant.name}`
        };
      }

      return {
        enabled: true,
        reason: 'Feature enabled'
      };

    } catch (error) {
      logger.error('Error checking feature flag', {
        feature: featureName,
        user_id: userContext.user_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fail open - return false for safety
      return {
        enabled: false,
        reason: 'Error checking feature flag'
      };
    }
  }

  /**
   * Get feature flag configuration
   */
  private async getFeatureFlag(featureName: string): Promise<FeatureFlag | null> {
    const cacheKey = `feature_flag:${featureName}`;
    
    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('name', featureName)
      .single();

    if (error || !data) {
      return null;
    }

    // Cache the result
    await cache.set(cacheKey, JSON.stringify(data), this.cache_ttl);
    
    return data;
  }

  /**
   * Create a consistent hash for user-based rollouts
   */
  private getUserHash(userId: string, featureName: string): number {
    const input = `${userId}:${featureName}`;
    let hash = 0;
    
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash) % 100;
  }

  /**
   * Determine A/B test variant for user
   */
  private getABTestVariant(abConfig: ABTestConfig, userContext: UserContext): ABTestVariant {
    const userHash = this.getUserHash(userContext.user_id, abConfig.test_name);
    let cumulativeWeight = 0;
    
    for (const [variantName, weight] of Object.entries(abConfig.traffic_split)) {
      cumulativeWeight += weight;
      if (userHash < cumulativeWeight) {
        const variant = abConfig.variants.find(v => v.name === variantName);
        return variant || abConfig.variants[0];
      }
    }
    
    // Fallback to first variant
    return abConfig.variants[0];
  }

  /**
   * Create or update a feature flag
   */
  async createFeatureFlag(flag: Omit<FeatureFlag, 'id' | 'created_at' | 'updated_at'>): Promise<FeatureFlag> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .insert({
        ...flag,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create feature flag: ${error.message}`);
    }

    // Invalidate cache
    await cache.delete(`feature_flag:${flag.name}`);
    
    return data;
  }

  /**
   * Update feature flag
   */
  async updateFeatureFlag(id: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update feature flag: ${error.message}`);
    }

    // Invalidate cache
    await cache.delete(`feature_flag:${data.name}`);
    
    return data;
  }

  /**
   * Get all feature flags for admin interface
   */
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch feature flags: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Add user to beta group
   */
  async addBetaUser(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ is_beta_user: true })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to add beta user: ${error.message}`);
    }
  }

  /**
   * Remove user from beta group
   */
  async removeBetaUser(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ is_beta_user: false })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to remove beta user: ${error.message}`);
    }
  }

  /**
   * Track feature flag usage for analytics
   */
  async trackFeatureUsage(
    featureName: string,
    userId: string,
    enabled: boolean,
    variant?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('feature_flag_usage')
        .insert({
          feature_name: featureName,
          user_id: userId,
          enabled,
          variant,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      // Don't throw - this is for analytics only
      logger.error('Failed to track feature usage', {
        feature: featureName,
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Singleton instance
export const featureFlagService = new FeatureFlagService();

// Convenience function for checking features
export async function isFeatureEnabled(
  featureName: string,
  userContext: UserContext
): Promise<FeatureFlagResult> {
  const result = await featureFlagService.isFeatureEnabled(featureName, userContext);
  
  // Track usage for analytics
  await featureFlagService.trackFeatureUsage(
    featureName,
    userContext.user_id,
    result.enabled,
    result.variant
  );
  
  return result;
}

// Predefined feature flags for the application
export const FEATURE_FLAGS = {
  // Core features
  VECTOR_SEARCH_V2: 'vector_search_v2',
  ADVANCED_CHUNKING: 'advanced_chunking',
  REAL_TIME_CHAT: 'real_time_chat',
  
  // Cloud storage
  GOOGLE_DRIVE_V2: 'google_drive_v2',
  ONEDRIVE_INTEGRATION: 'onedrive_integration',
  DROPBOX_INTEGRATION: 'dropbox_integration',
  
  // AI features
  GPT4_TURBO: 'gpt4_turbo',
  CUSTOM_MODELS: 'custom_models',
  FUNCTION_CALLING: 'function_calling',
  
  // UI improvements
  NEW_DASHBOARD: 'new_dashboard',
  DARK_MODE: 'dark_mode',
  MOBILE_APP: 'mobile_app',
  
  // Performance
  EDGE_CACHING: 'edge_caching',
  STREAMING_RESPONSES: 'streaming_responses',
  
  // Beta features
  COLLABORATION: 'collaboration',
  API_ACCESS: 'api_access',
  WEBHOOKS: 'webhooks'
} as const;

export type FeatureFlagName = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];