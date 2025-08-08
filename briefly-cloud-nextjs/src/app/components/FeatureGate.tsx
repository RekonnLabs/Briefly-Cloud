/**
 * Feature Gate Component
 * 
 * Conditionally renders content based on feature flags
 */

'use client';

import React from 'react';
import { useFeatureFlag, useFeatureFlags, useABTest } from '@/app/lib/hooks/useFeatureFlag';

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

interface MultiFeatureGateProps {
  features: string[];
  mode?: 'all' | 'any'; // 'all' requires all features to be enabled, 'any' requires at least one
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

interface ABTestGateProps {
  testName: string;
  variant: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

interface FeatureConfigProps {
  feature: string;
  children: (config: Record<string, any>) => React.ReactNode;
  fallback?: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

/**
 * Basic feature gate - shows content only if feature is enabled
 */
export function FeatureGate({ 
  feature, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: FeatureGateProps) {
  const { enabled, loading, error } = useFeatureFlag(feature);

  if (loading) {
    return loadingComponent || null;
  }

  if (error) {
    console.error(`FeatureGate error for ${feature}:`, error);
    return fallback;
  }

  return enabled ? <>{children}</> : <>{fallback}</>;
}

/**
 * Multi-feature gate - shows content based on multiple feature flags
 */
export function MultiFeatureGate({ 
  features, 
  mode = 'all', 
  children, 
  fallback = null, 
  loadingComponent = null 
}: MultiFeatureGateProps) {
  const flagResults = useFeatureFlags(features);

  // Check if any flags are still loading
  const isLoading = Object.values(flagResults).some(result => result.loading);
  
  if (isLoading) {
    return loadingComponent || null;
  }

  // Check if any flags have errors
  const hasError = Object.values(flagResults).some(result => result.error);
  
  if (hasError) {
    const errors = Object.entries(flagResults)
      .filter(([_, result]) => result.error)
      .map(([feature, result]) => `${feature}: ${result.error}`);
    
    console.error('MultiFeatureGate errors:', errors);
    return <>{fallback}</>;
  }

  // Determine if content should be shown based on mode
  const enabledFlags = Object.values(flagResults).filter(result => result.enabled);
  const shouldShow = mode === 'all' 
    ? enabledFlags.length === features.length
    : enabledFlags.length > 0;

  return shouldShow ? <>{children}</> : <>{fallback}</>;
}

/**
 * A/B Test gate - shows content only for specific test variant
 */
export function ABTestGate({ 
  testName, 
  variant, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: ABTestGateProps) {
  const { variant: userVariant, isEnabled, loading, error } = useABTest(testName);

  if (loading) {
    return loadingComponent || null;
  }

  if (error) {
    console.error(`ABTestGate error for ${testName}:`, error);
    return <>{fallback}</>;
  }

  const shouldShow = isEnabled && userVariant === variant;
  return shouldShow ? <>{children}</> : <>{fallback}</>;
}

/**
 * Feature config provider - passes feature configuration to children
 */
export function FeatureConfig({ 
  feature, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: FeatureConfigProps) {
  const { enabled, config = {}, loading, error } = useFeatureFlag(feature);

  if (loading) {
    return loadingComponent || null;
  }

  if (error) {
    console.error(`FeatureConfig error for ${feature}:`, error);
    return <>{fallback}</>;
  }

  return enabled ? <>{children(config)}</> : <>{fallback}</>;
}

/**
 * Higher-order component for feature gating
 */
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  feature: string,
  fallback?: React.ComponentType<P>
) {
  return function FeatureGatedComponent(props: P) {
    const { enabled, loading } = useFeatureFlag(feature);

    if (loading) {
      return null; // Or a loading spinner
    }

    if (!enabled) {
      return fallback ? <fallback {...props} /> : null;
    }

    return <WrappedComponent {...props} />;
  };
}

/**
 * Hook for getting multiple feature states in a component
 */
export function useFeatureGates(features: Record<string, string>) {
  const featureNames = Object.values(features);
  const flagResults = useFeatureFlags(featureNames);

  const gates: Record<string, boolean> = {};
  const loading = Object.values(flagResults).some(result => result.loading);
  const errors = Object.entries(flagResults)
    .filter(([_, result]) => result.error)
    .reduce((acc, [feature, result]) => {
      acc[feature] = result.error!;
      return acc;
    }, {} as Record<string, string>);

  // Map back to original keys
  Object.entries(features).forEach(([key, featureName]) => {
    gates[key] = flagResults[featureName]?.enabled || false;
  });

  return {
    gates,
    loading,
    errors,
    hasErrors: Object.keys(errors).length > 0
  };
}

/**
 * Debug component for showing feature flag states (development only)
 */
export function FeatureFlagDebugger({ features }: { features: string[] }) {
  const flagResults = useFeatureFlags(features);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs max-w-sm">
      <h4 className="font-bold mb-2">Feature Flags Debug</h4>
      {Object.entries(flagResults).map(([feature, result]) => (
        <div key={feature} className="mb-1">
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
            result.loading ? 'bg-yellow-400' : 
            result.enabled ? 'bg-green-400' : 'bg-red-400'
          }`}></span>
          <span className="font-mono">{feature}</span>
          {result.variant && (
            <span className="ml-2 text-blue-300">({result.variant})</span>
          )}
          {result.error && (
            <span className="ml-2 text-red-300">⚠</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Export commonly used feature flags for convenience
export const FEATURES = {
  VECTOR_SEARCH_V2: 'vector_search_v2',
  ADVANCED_CHUNKING: 'advanced_chunking',
  REAL_TIME_CHAT: 'real_time_chat',
  GOOGLE_DRIVE_V2: 'google_drive_v2',
  ONEDRIVE_INTEGRATION: 'onedrive_integration',
  DROPBOX_INTEGRATION: 'dropbox_integration',
  GPT4_TURBO: 'gpt4_turbo',
  CUSTOM_MODELS: 'custom_models',
  FUNCTION_CALLING: 'function_calling',
  NEW_DASHBOARD: 'new_dashboard',
  DARK_MODE: 'dark_mode',
  MOBILE_APP: 'mobile_app',
  EDGE_CACHING: 'edge_caching',
  STREAMING_RESPONSES: 'streaming_responses',
  COLLABORATION: 'collaboration',
  API_ACCESS: 'api_access',
  WEBHOOKS: 'webhooks'
} as const;