/**
 * Usage Tracking Security Tests
 * 
 * Tests for usage tracking security including:
 * - Usage data integrity and validation
 * - Subscription tier enforcement
 * - Usage manipulation prevention
 * - Accurate billing and quota calculations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UsageTracker } from '../../src/app/lib/usage/usage-tracker';
import { TierManager } from '../../src/app/lib/usage/tier-manager';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            order: jest.fn()
          }))
        })),
        limit: jest.fn()
      }))
    })),
    insert: jest.fn(),
    update: jest.fn(() => ({
      eq: jest.fn()
    })),
    upsert: jest.fn()
  })),
  rpc: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Usage Tracking Security Tests', () => {
  let usageTracker: UsageTracker;
  let tierManager: TierManager;

  beforeEach(() => {
    jest.clearAllMocks();
    usageTracker = new UsageTracker();
    tierManager = new TierManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Usage Data Integrity and Validation', () => {
    it('should validate usage data before storing', async () => {
      const validUsageData = {
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-456',
        metadata: {
          file_size: 1024 * 1024, // 1MB
          file_name: 'document.pdf',
          mime_type: 'application/pdf'
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'usage-log-1' }],
        error: null
      });

      const result = await usageTracker.trackUsage(
        validUsageData.user_id,
        validUsageData.action,
        validUsageData.resource_type,
        validUsageData.resource_id,
        validUsageData.metadata
      );

      expect(result.success).toBe(true);
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: validUsageData.user_id,
          action: validUsageData.action,
          resource_type: validUsageData.resource_type,
          resource_id: validUsageData.resource_id,
          metadata: validUsageData.metadata
        })
      );
    });

    it('should reject invalid usage data', async () => {
      const invalidUsageData = [
        {
          name: 'Invalid user ID',
          data: {
            user_id: null,
            action: 'file_upload',
            resource_type: 'file'
          }
        },
        {
          name: 'SQL injection in user ID',
          data: {
            user_id: "'; DROP TABLE usage_logs; --",
            action: 'file_upload',
            resource_type: 'file'
          }
        },
        {
          name: 'Invalid action type',
          data: {
            user_id: 'user-123',
            action: 'malicious_action',
            resource_type: 'file'
          }
        },
        {
          name: 'Negative file size',
          data: {
            user_id: 'user-123',
            action: 'file_upload',
            resource_type: 'file',
            metadata: { file_size: -1000 }
          }
        },
        {
          name: 'Extremely large file size',
          data: {
            user_id: 'user-123',
            action: 'file_upload',
            resource_type: 'file',
            metadata: { file_size: Number.MAX_SAFE_INTEGER }
          }
        }
      ];

      for (const testCase of invalidUsageData) {
        const result = await usageTracker.validateUsageData(testCase.data);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should sanitize usage metadata', async () => {
      const unsafeMetadata = {
        file_name: '<script>alert("xss")</script>document.pdf',
        description: 'File with "quotes" and \'apostrophes\'',
        path: '../../../etc/passwd',
        user_input: 'Normal text with <b>HTML</b> tags'
      };

      const sanitizedMetadata = await usageTracker.sanitizeMetadata(unsafeMetadata);

      expect(sanitizedMetadata.file_name).not.toContain('<script>');
      expect(sanitizedMetadata.file_name).not.toContain('</script>');
      expect(sanitizedMetadata.path).not.toContain('../');
      expect(sanitizedMetadata.user_input).not.toContain('<b>');
      expect(sanitizedMetadata.user_input).not.toContain('</b>');
    });

    it('should enforce usage data size limits', async () => {
      const oversizedMetadata = {
        large_field: 'x'.repeat(10000), // 10KB of data
        description: 'Normal description',
        file_name: 'document.pdf'
      };

      const result = await usageTracker.validateUsageData({
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        metadata: oversizedMetadata
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Metadata size exceeds limit');
    });

    it('should validate usage timestamps', async () => {
      const futureTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours in future
      const veryOldTimestamp = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

      // Future timestamp should be rejected
      const futureResult = await usageTracker.validateUsageData({
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        created_at: futureTimestamp.toISOString()
      });

      expect(futureResult.valid).toBe(false);
      expect(futureResult.errors).toContain('Invalid timestamp: future date not allowed');

      // Very old timestamp should be rejected
      const oldResult = await usageTracker.validateUsageData({
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        created_at: veryOldTimestamp.toISOString()
      });

      expect(oldResult.valid).toBe(false);
      expect(oldResult.errors).toContain('Invalid timestamp: too old');
    });
  });

  describe('Subscription Tier Enforcement', () => {
    it('should enforce free tier usage limits', async () => {
      const freeUserId = 'free-user-123';
      
      // Mock current usage at limit
      mockSupabase.rpc.mockResolvedValue({
        data: {
          files_uploaded: 10, // Free tier limit
          storage_used: 100 * 1024 * 1024, // 100MB limit
          chat_messages_sent: 100 // Free tier limit
        },
        error: null
      });

      // Test file upload limit
      const fileUploadResult = await tierManager.checkUsageLimit(
        freeUserId,
        'file_upload',
        10 // Free tier limit
      );

      expect(fileUploadResult.allowed).toBe(false);
      expect(fileUploadResult.tier).toBe('free');
      expect(fileUploadResult.remaining).toBe(0);

      // Test storage limit
      const storageResult = await tierManager.checkStorageLimit(
        freeUserId,
        1024 * 1024 // Trying to upload 1MB more
      );

      expect(storageResult.allowed).toBe(false);
      expect(storageResult.reason).toContain('storage limit exceeded');
    });

    it('should enforce pro tier usage limits', async () => {
      const proUserId = 'pro-user-123';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'pro',
          files_uploaded: 500,
          storage_used: 5 * 1024 * 1024 * 1024, // 5GB
          chat_messages_sent: 5000
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(
        proUserId,
        'file_upload',
        1000 // Pro tier limit
      );

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.remaining).toBe(500);
    });

    it('should handle pro BYOK tier (unlimited usage)', async () => {
      const byokUserId = 'byok-user-123';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'pro_byok',
          files_uploaded: 10000,
          storage_used: 100 * 1024 * 1024 * 1024, // 100GB
          chat_messages_sent: 50000
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(
        byokUserId,
        'file_upload',
        Number.MAX_SAFE_INTEGER
      );

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('pro_byok');
      expect(result.unlimited).toBe(true);
    });

    it('should prevent tier manipulation through API calls', async () => {
      const userId = 'malicious-user-123';
      
      // User tries to manipulate their tier in the request
      const maliciousRequest = {
        user_id: userId,
        subscription_tier: 'pro_byok', // Claiming higher tier
        override_limits: true
      };

      // Mock that actual tier is fetched from secure source
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'free', // Actual tier from database
          files_uploaded: 15 // Over free limit
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(userId, 'file_upload', 10);

      // Should use actual tier from database, not manipulated request
      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('free');
    });

    it('should handle subscription downgrades correctly', async () => {
      const userId = 'downgrading-user-123';
      
      // User downgrades from pro to free mid-month
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'free',
          files_uploaded: 50, // Over new free limit
          tier_changed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Changed yesterday
          previous_tier: 'pro'
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(userId, 'file_upload', 10);

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.overLimit).toBe(true);
      expect(result.gracePeriod).toBeDefined(); // Should have grace period
    });

    it('should validate subscription status before allowing usage', async () => {
      const userId = 'expired-user-123';
      
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'pro',
          subscription_status: 'expired',
          subscription_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(userId, 'file_upload', 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('subscription expired');
    });
  });

  describe('Usage Manipulation Prevention', () => {
    it('should prevent negative usage reporting', async () => {
      const userId = 'user-123';
      
      const maliciousUsage = {
        user_id: userId,
        action: 'file_upload',
        resource_type: 'file',
        metadata: {
          file_size: -1000000, // Negative size to reduce usage
          tokens_used: -500
        }
      };

      const result = await usageTracker.validateUsageData(maliciousUsage);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Negative values not allowed');
    });

    it('should prevent usage data tampering', async () => {
      const userId = 'user-123';
      const originalUsage = {
        files_uploaded: 5,
        storage_used: 50 * 1024 * 1024 // 50MB
      };

      // Mock original usage
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: originalUsage,
        error: null
      });

      // Attempt to tamper with usage data
      const tamperedUpdate = {
        files_uploaded: 2, // Trying to reduce count
        storage_used: 10 * 1024 * 1024 // Trying to reduce storage
      };

      // Usage should only increase, not decrease (except through legitimate deletions)
      const result = await usageTracker.updateUsage(userId, tamperedUpdate);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usage can only increase');
    });

    it('should detect and prevent usage replay attacks', async () => {
      const userId = 'user-123';
      const usageEvent = {
        user_id: userId,
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-123',
        metadata: {
          file_size: 1024 * 1024,
          timestamp: Date.now()
        }
      };

      // First submission should succeed
      mockSupabase.from().insert.mockResolvedValueOnce({
        data: [{ id: 'usage-log-1' }],
        error: null
      });

      const firstResult = await usageTracker.trackUsage(
        usageEvent.user_id,
        usageEvent.action,
        usageEvent.resource_type,
        usageEvent.resource_id,
        usageEvent.metadata
      );

      expect(firstResult.success).toBe(true);

      // Replay of same event should be detected and rejected
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { id: 'usage-log-1' }, // Event already exists
        error: null
      });

      const replayResult = await usageTracker.trackUsage(
        usageEvent.user_id,
        usageEvent.action,
        usageEvent.resource_type,
        usageEvent.resource_id,
        usageEvent.metadata
      );

      expect(replayResult.success).toBe(false);
      expect(replayResult.error).toContain('Duplicate usage event');
    });

    it('should validate usage event timing', async () => {
      const userId = 'user-123';
      
      // Rapid-fire usage events (potential bot behavior)
      const rapidEvents = Array.from({ length: 100 }, (_, i) => ({
        user_id: userId,
        action: 'api_call',
        resource_type: 'endpoint',
        timestamp: Date.now() + i // All within same millisecond range
      }));

      let suspiciousEventCount = 0;
      
      for (const event of rapidEvents) {
        const timingValidation = await usageTracker.validateEventTiming(event);
        
        if (!timingValidation.valid) {
          suspiciousEventCount++;
        }
      }

      // Should detect suspicious rapid-fire pattern
      expect(suspiciousEventCount).toBeGreaterThan(0);
    });

    it('should prevent cross-user usage attribution', async () => {
      const user1 = 'user-123';
      const user2 = 'user-456';
      
      // Attempt to attribute user2's usage to user1
      const maliciousUsage = {
        user_id: user1,
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-belonging-to-user2',
        metadata: {
          actual_user: user2, // Hidden attribution
          file_size: 1024 * 1024
        }
      };

      // Mock resource ownership check
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { user_id: user2 }, // File belongs to user2
        error: null
      });

      const result = await usageTracker.validateResourceOwnership(
        maliciousUsage.user_id,
        maliciousUsage.resource_id
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Resource ownership mismatch');
    });
  });

  describe('Accurate Billing and Quota Calculations', () => {
    it('should calculate accurate monthly usage for billing', async () => {
      const userId = 'user-123';
      const billingPeriodStart = new Date('2024-01-01');
      const billingPeriodEnd = new Date('2024-01-31');

      mockSupabase.rpc.mockResolvedValue({
        data: {
          files_uploaded: 25,
          storage_used: 2.5 * 1024 * 1024 * 1024, // 2.5GB
          chat_messages_sent: 150,
          api_calls_made: 1000,
          processing_time_seconds: 3600 // 1 hour
        },
        error: null
      });

      const billingUsage = await usageTracker.calculateBillingUsage(
        userId,
        billingPeriodStart,
        billingPeriodEnd
      );

      expect(billingUsage.files_uploaded).toBe(25);
      expect(billingUsage.storage_gb).toBe(2.5);
      expect(billingUsage.chat_messages_sent).toBe(150);
      expect(billingUsage.api_calls_made).toBe(1000);
      expect(billingUsage.processing_hours).toBe(1);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('calculate_billing_usage', {
        p_user_id: userId,
        p_start_date: billingPeriodStart.toISOString(),
        p_end_date: billingPeriodEnd.toISOString()
      });
    });

    it('should handle prorated billing for mid-cycle upgrades', async () => {
      const userId = 'user-123';
      const billingStart = new Date('2024-01-01');
      const upgradeDate = new Date('2024-01-15'); // Upgraded mid-month
      const billingEnd = new Date('2024-01-31');

      mockSupabase.rpc.mockResolvedValue({
        data: {
          free_period_usage: {
            files_uploaded: 10,
            storage_used: 100 * 1024 * 1024 // 100MB
          },
          pro_period_usage: {
            files_uploaded: 50,
            storage_used: 1024 * 1024 * 1024 // 1GB
          },
          upgrade_date: upgradeDate.toISOString()
        },
        error: null
      });

      const proratedUsage = await usageTracker.calculateProratedUsage(
        userId,
        billingStart,
        billingEnd
      );

      expect(proratedUsage.free_period).toBeDefined();
      expect(proratedUsage.pro_period).toBeDefined();
      expect(proratedUsage.upgrade_date).toBe(upgradeDate.toISOString());
    });

    it('should accurately track quota consumption', async () => {
      const userId = 'user-123';
      const quotas = {
        files_per_month: 100,
        storage_gb: 10,
        chat_messages_per_month: 1000
      };

      mockSupabase.rpc.mockResolvedValue({
        data: {
          files_uploaded: 75,
          storage_used: 7.5 * 1024 * 1024 * 1024, // 7.5GB
          chat_messages_sent: 800
        },
        error: null
      });

      const quotaUsage = await usageTracker.calculateQuotaUsage(userId, quotas);

      expect(quotaUsage.files.used).toBe(75);
      expect(quotaUsage.files.remaining).toBe(25);
      expect(quotaUsage.files.percentage).toBe(75);

      expect(quotaUsage.storage.used_gb).toBe(7.5);
      expect(quotaUsage.storage.remaining_gb).toBe(2.5);
      expect(quotaUsage.storage.percentage).toBe(75);

      expect(quotaUsage.chat_messages.used).toBe(800);
      expect(quotaUsage.chat_messages.remaining).toBe(200);
      expect(quotaUsage.chat_messages.percentage).toBe(80);
    });

    it('should handle usage aggregation across multiple time zones', async () => {
      const userId = 'user-123';
      
      // Usage events from different time zones
      const usageEvents = [
        {
          timestamp: '2024-01-15T10:00:00Z', // UTC
          action: 'file_upload',
          metadata: { file_size: 1024 * 1024 }
        },
        {
          timestamp: '2024-01-15T15:00:00-05:00', // EST (same day UTC)
          action: 'file_upload',
          metadata: { file_size: 2 * 1024 * 1024 }
        },
        {
          timestamp: '2024-01-16T02:00:00+09:00', // JST (same day UTC)
          action: 'file_upload',
          metadata: { file_size: 1024 * 1024 }
        }
      ];

      // All should be aggregated to the same UTC day
      const dailyUsage = await usageTracker.aggregateDailyUsage(userId, usageEvents);

      expect(dailyUsage['2024-01-15']).toBeDefined();
      expect(dailyUsage['2024-01-15'].files_uploaded).toBe(2);
      expect(dailyUsage['2024-01-15'].storage_used).toBe(3 * 1024 * 1024);

      expect(dailyUsage['2024-01-16']).toBeDefined();
      expect(dailyUsage['2024-01-16'].files_uploaded).toBe(1);
    });

    it('should prevent billing calculation manipulation', async () => {
      const userId = 'user-123';
      const billingPeriod = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      // Attempt to manipulate billing calculation with malicious parameters
      const maliciousParams = {
        p_user_id: "'; UPDATE usage_logs SET file_size = 0; --",
        p_start_date: billingPeriod.start.toISOString(),
        p_end_date: billingPeriod.end.toISOString(),
        p_discount_factor: 0.1 // Trying to add unauthorized discount
      };

      // Mock that malicious parameters are rejected
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invalid parameters' }
      });

      const result = await usageTracker.calculateBillingUsage(
        maliciousParams.p_user_id,
        new Date(maliciousParams.p_start_date),
        new Date(maliciousParams.p_end_date)
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Usage Analytics and Reporting', () => {
    it('should generate accurate usage analytics', async () => {
      const userId = 'user-123';
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      mockSupabase.rpc.mockResolvedValue({
        data: {
          daily_usage: [
            { date: '2024-01-01', files_uploaded: 2, storage_used: 10485760 },
            { date: '2024-01-02', files_uploaded: 1, storage_used: 5242880 },
            // ... more daily data
          ],
          peak_usage_day: '2024-01-15',
          average_daily_files: 1.5,
          total_storage_growth: 500 * 1024 * 1024,
          usage_patterns: {
            most_active_hour: 14, // 2 PM
            most_active_day: 'Tuesday',
            file_type_distribution: {
              'pdf': 60,
              'docx': 30,
              'txt': 10
            }
          }
        },
        error: null
      });

      const analytics = await usageTracker.generateUsageAnalytics(userId, timeRange);

      expect(analytics.daily_usage).toBeDefined();
      expect(analytics.peak_usage_day).toBe('2024-01-15');
      expect(analytics.average_daily_files).toBe(1.5);
      expect(analytics.usage_patterns).toBeDefined();
      expect(analytics.usage_patterns.file_type_distribution).toBeDefined();
    });

    it('should protect sensitive usage data in analytics', async () => {
      const userId = 'user-123';
      
      const analytics = await usageTracker.generateUsageAnalytics(userId, {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      });

      // Should not expose sensitive information
      expect(analytics).not.toHaveProperty('user_email');
      expect(analytics).not.toHaveProperty('payment_info');
      expect(analytics).not.toHaveProperty('api_keys');
      
      // Should only contain aggregated, non-sensitive usage data
      expect(analytics).toHaveProperty('daily_usage');
      expect(analytics).toHaveProperty('usage_patterns');
    });
  });
});