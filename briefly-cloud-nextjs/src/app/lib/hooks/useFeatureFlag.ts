/**
 * React Hook for Feature Flags
 * 
 * Provides a convenient way to check feature flags in React components
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface FeatureFlagResult {
  enabled: boolean;
  variant?: string;
  config?: Record<string, any>;
  reason: string;
  loading: boolean;
  error?: string;
}

interface FeatureFlagCache {
  [key: string]: {
    result: Omit<FeatureFlagResult, 'loading'>;
    timestamp: number;
    ttl: number;
  };
}

// Global cache for feature flags to avoid duplicate requests
const featureFlagCache: FeatureFlagCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for checking a single feature flag
 */
export function useFeatureFlag(featureName: string): FeatureFlagResult {
  const { data: session, status } = useSession();
  const [result, setResult] = useState<FeatureFlagResult>({
    enabled: false,
    loading: true,
    reason: 'Loading...'
  });

  const checkFeatureFlag = useCallback(async () => {
    if (status === 'loading') {
      return;
    }

    if (!session?.user) {
      setResult({
        enabled: false,
        loading: false,
        reason: 'User not authenticated'
      });
      return;
    }

    // Check cache first
    const cacheKey = `${featureName}:${session.user.email}`;
    const cached = featureFlagCache[cacheKey];
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      setResult({
        ...cached.result,
        loading: false
      });
      return;
    }

    try {
      setResult(prev => ({ ...prev, loading: true }));

      const response = await fetch('/api/feature-flags/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature_name: featureName
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      const flagResult = {
        enabled: data.enabled,
        variant: data.variant,
        config: data.config,
        reason: data.reason
      };

      // Cache the result
      featureFlagCache[cacheKey] = {
        result: flagResult,
        timestamp: Date.now(),
        ttl: CACHE_TTL
      };

      setResult({
        ...flagResult,
        loading: false
      });

    } catch (error) {
      console.error('Error checking feature flag:', error);
      
      setResult({
        enabled: false,
        loading: false,
        reason: 'Error checking feature flag',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [featureName, session, status]);

  useEffect(() => {
    checkFeatureFlag();
  }, [checkFeatureFlag]);

  return result;
}

/**
 * Hook for checking multiple feature flags at once
 */
export function useFeatureFlags(featureNames: string[]): Record<string, FeatureFlagResult> {
  const { data: session, status } = useSession();
  const [results, setResults] = useState<Record<string, FeatureFlagResult>>(() => {
    const initial: Record<string, FeatureFlagResult> = {};
    featureNames.forEach(name => {
      initial[name] = {
        enabled: false,
        loading: true,
        reason: 'Loading...'
      };
    });
    return initial;
  });

  const checkFeatureFlags = useCallback(async () => {
    if (status === 'loading') {
      return;
    }

    if (!session?.user) {
      const unauthenticated: Record<string, FeatureFlagResult> = {};
      featureNames.forEach(name => {
        unauthenticated[name] = {
          enabled: false,
          loading: false,
          reason: 'User not authenticated'
        };
      });
      setResults(unauthenticated);
      return;
    }

    // Check which features need to be fetched (not in cache or expired)
    const featuresToFetch: string[] = [];
    const cachedResults: Record<string, FeatureFlagResult> = {};

    featureNames.forEach(featureName => {
      const cacheKey = `${featureName}:${session.user.email}`;
      const cached = featureFlagCache[cacheKey];
      
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        cachedResults[featureName] = {
          ...cached.result,
          loading: false
        };
      } else {
        featuresToFetch.push(featureName);
      }
    });

    // Update with cached results immediately
    if (Object.keys(cachedResults).length > 0) {
      setResults(prev => ({
        ...prev,
        ...cachedResults
      }));
    }

    // Fetch remaining features
    if (featuresToFetch.length === 0) {
      return;
    }

    try {
      // Set loading state for features being fetched
      setResults(prev => {
        const updated = { ...prev };
        featuresToFetch.forEach(name => {
          updated[name] = { ...updated[name], loading: true };
        });
        return updated;
      });

      // Fetch all features in parallel
      const promises = featuresToFetch.map(async (featureName) => {
        const response = await fetch('/api/feature-flags/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            feature_name: featureName
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          featureName,
          result: {
            enabled: data.enabled,
            variant: data.variant,
            config: data.config,
            reason: data.reason
          }
        };
      });

      const responses = await Promise.allSettled(promises);
      const newResults: Record<string, FeatureFlagResult> = {};

      responses.forEach((response, index) => {
        const featureName = featuresToFetch[index];
        
        if (response.status === 'fulfilled') {
          const flagResult = response.value.result;
          
          // Cache the result
          const cacheKey = `${featureName}:${session.user.email}`;
          featureFlagCache[cacheKey] = {
            result: flagResult,
            timestamp: Date.now(),
            ttl: CACHE_TTL
          };

          newResults[featureName] = {
            ...flagResult,
            loading: false
          };
        } else {
          console.error(`Error checking feature flag ${featureName}:`, response.reason);
          
          newResults[featureName] = {
            enabled: false,
            loading: false,
            reason: 'Error checking feature flag',
            error: response.reason instanceof Error ? response.reason.message : 'Unknown error'
          };
        }
      });

      setResults(prev => ({
        ...prev,
        ...newResults
      }));

    } catch (error) {
      console.error('Error checking feature flags:', error);
      
      // Set error state for all features being fetched
      const errorResults: Record<string, FeatureFlagResult> = {};
      featuresToFetch.forEach(name => {
        errorResults[name] = {
          enabled: false,
          loading: false,
          reason: 'Error checking feature flag',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      });

      setResults(prev => ({
        ...prev,
        ...errorResults
      }));
    }
  }, [featureNames, session, status]);

  useEffect(() => {
    checkFeatureFlags();
  }, [checkFeatureFlags]);

  return results;
}

/**
 * Hook for A/B testing with feature flags
 */
export function useABTest(testName: string) {
  const flagResult = useFeatureFlag(testName);
  
  return {
    variant: flagResult.variant || 'control',
    config: flagResult.config || {},
    isEnabled: flagResult.enabled,
    loading: flagResult.loading,
    error: flagResult.error
  };
}

/**
 * Utility function to clear feature flag cache
 */
export function clearFeatureFlagCache(featureName?: string, userEmail?: string) {
  if (featureName && userEmail) {
    const cacheKey = `${featureName}:${userEmail}`;
    delete featureFlagCache[cacheKey];
  } else {
    // Clear all cache
    Object.keys(featureFlagCache).forEach(key => {
      delete featureFlagCache[key];
    });
  }
}