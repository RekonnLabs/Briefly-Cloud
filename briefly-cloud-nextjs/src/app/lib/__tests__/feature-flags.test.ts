/**
 * Feature Flags System Tests
 */

import { featureFlagService, isFeatureEnabled, UserContext, FeatureFlag } from '../feature-flags';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js');
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    order: jest.fn(() => ({}))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

// Mock cache
jest.mock('../cache', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }
}));

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    error: jest.fn()
  }
}));

describe('Feature Flags System', () => {
  const mockUserContext: UserContext = {
    user_id: 'test-user-123',
    email: 'test@example.com',
    subscription_tier: 'pro',
    is_beta_user: false,
    created_at: new Date('2024-01-01')
  };

  const mockFeatureFlag: FeatureFlag = {
    id: 'flag-123',
    name: 'test_feature',
    description: 'Test feature flag',
    enabled: true,
    rollout_percentage: 100,
    user_tiers: ['pro'],
    beta_users: [],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isFeatureEnabled', () => {
    it('should return enabled=true for fully enabled feature', async () => {
      // Mock database response
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockFeatureFlag,
        error: null
      });

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Feature enabled');
    });

    it('should return enabled=false for disabled feature', async () => {
      const disabledFlag = { ...mockFeatureFlag, enabled: false };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: disabledFlag,
        error: null
      });

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Feature globally disabled');
    });

    it('should return enabled=false for non-existent feature', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await isFeatureEnabled('non_existent_feature', mockUserContext);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Feature flag not found');
    });

    it('should respect user tier restrictions', async () => {
      const tierRestrictedFlag = { 
        ...mockFeatureFlag, 
        user_tiers: ['pro_byok'] // User is 'pro', flag requires 'pro_byok'
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: tierRestrictedFlag,
        error: null
      });

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Feature not available for pro tier');
    });

    it('should allow access for beta users', async () => {
      const betaOnlyFlag = { 
        ...mockFeatureFlag, 
        beta_users: ['test-user-123'],
        rollout_percentage: 0 // Would normally block user
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: betaOnlyFlag,
        error: null
      });

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Beta user access');
    });

    it('should respect rollout percentage', async () => {
      const partialRolloutFlag = { 
        ...mockFeatureFlag, 
        rollout_percentage: 50
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: partialRolloutFlag,
        error: null
      });

      // Mock getUserHash to return a value that would be excluded from 50% rollout
      const originalGetUserHash = (featureFlagService as any).getUserHash;
      (featureFlagService as any).getUserHash = jest.fn().mockReturnValue(75); // > 50

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('User not in 50% rollout');

      // Restore original method
      (featureFlagService as any).getUserHash = originalGetUserHash;
    });

    it('should handle A/B test configuration', async () => {
      const abTestFlag = { 
        ...mockFeatureFlag,
        ab_test_config: {
          test_name: 'test_ab',
          variants: [
            { name: 'control', description: 'Control variant', config: { theme: 'default' } },
            { name: 'variant_a', description: 'Variant A', config: { theme: 'new' } }
          ],
          traffic_split: { control: 50, variant_a: 50 },
          metrics: ['engagement'],
          start_date: new Date('2024-01-01'),
        }
      };
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: abTestFlag,
        error: null
      });

      // Mock getABTestVariant to return control variant
      const originalGetABTestVariant = (featureFlagService as any).getABTestVariant;
      (featureFlagService as any).getABTestVariant = jest.fn().mockReturnValue({
        name: 'control',
        description: 'Control variant',
        config: { theme: 'default' }
      });

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(true);
      expect(result.variant).toBe('control');
      expect(result.config).toEqual({ theme: 'default' });
      expect(result.reason).toBe('A/B test variant: control');

      // Restore original method
      (featureFlagService as any).getABTestVariant = originalGetABTestVariant;
    });

    it('should fail safely on database errors', async () => {
      mockSupabase.from().select().eq().single.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await isFeatureEnabled('test_feature', mockUserContext);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Error checking feature flag');
    });
  });

  describe('featureFlagService', () => {
    it('should create feature flag successfully', async () => {
      const newFlag = {
        name: 'new_feature',
        description: 'New test feature',
        enabled: false,
        rollout_percentage: 0,
        user_tiers: ['pro'],
        beta_users: []
      };

      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: { ...newFlag, id: 'new-flag-123' },
        error: null
      });

      const result = await featureFlagService.createFeatureFlag(newFlag);

      expect(result.id).toBe('new-flag-123');
      expect(result.name).toBe('new_feature');
    });

    it('should update feature flag successfully', async () => {
      const updates = { enabled: true, rollout_percentage: 50 };

      mockSupabase.from().update().eq().select().single.mockResolvedValue({
        data: { ...mockFeatureFlag, ...updates },
        error: null
      });

      const result = await featureFlagService.updateFeatureFlag('flag-123', updates);

      expect(result.enabled).toBe(true);
      expect(result.rollout_percentage).toBe(50);
    });

    it('should get all feature flags', async () => {
      const flags = [mockFeatureFlag];

      mockSupabase.from().select().order.mockResolvedValue({
        data: flags,
        error: null
      });

      const result = await featureFlagService.getAllFeatureFlags();

      expect(result).toEqual(flags);
    });

    it('should add beta user successfully', async () => {
      mockSupabase.from().update().eq.mockResolvedValue({
        error: null
      });

      await expect(featureFlagService.addBetaUser('user-123')).resolves.not.toThrow();
    });

    it('should remove beta user successfully', async () => {
      mockSupabase.from().update().eq.mockResolvedValue({
        error: null
      });

      await expect(featureFlagService.removeBetaUser('user-123')).resolves.not.toThrow();
    });
  });

  describe('getUserHash', () => {
    it('should generate consistent hash for same input', () => {
      const service = featureFlagService as any;
      const hash1 = service.getUserHash('user-123', 'feature-abc');
      const hash2 = service.getUserHash('user-123', 'feature-abc');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBeGreaterThanOrEqual(0);
      expect(hash1).toBeLessThan(100);
    });

    it('should generate different hashes for different inputs', () => {
      const service = featureFlagService as any;
      const hash1 = service.getUserHash('user-123', 'feature-abc');
      const hash2 = service.getUserHash('user-456', 'feature-abc');
      const hash3 = service.getUserHash('user-123', 'feature-xyz');
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });
  });

  describe('getABTestVariant', () => {
    it('should select variant based on traffic split', () => {
      const service = featureFlagService as any;
      const abConfig = {
        test_name: 'test_ab',
        variants: [
          { name: 'control', description: 'Control', config: {} },
          { name: 'variant_a', description: 'Variant A', config: {} }
        ],
        traffic_split: { control: 70, variant_a: 30 },
        metrics: [],
        start_date: new Date()
      };

      // Mock getUserHash to return 25 (should get control since 25 < 70)
      service.getUserHash = jest.fn().mockReturnValue(25);

      const variant = service.getABTestVariant(abConfig, mockUserContext);
      expect(variant.name).toBe('control');

      // Mock getUserHash to return 85 (should get variant_a since 85 >= 70)
      service.getUserHash = jest.fn().mockReturnValue(85);

      const variant2 = service.getABTestVariant(abConfig, mockUserContext);
      expect(variant2.name).toBe('variant_a');
    });

    it('should fallback to first variant if no match', () => {
      const service = featureFlagService as any;
      const abConfig = {
        test_name: 'test_ab',
        variants: [
          { name: 'control', description: 'Control', config: {} }
        ],
        traffic_split: {},
        metrics: [],
        start_date: new Date()
      };

      const variant = service.getABTestVariant(abConfig, mockUserContext);
      expect(variant.name).toBe('control');
    });
  });
});