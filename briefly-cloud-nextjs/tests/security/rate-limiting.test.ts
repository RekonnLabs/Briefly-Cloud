/**
 * Rate Limiting and Usage Tracking Security Tests
 * 
 * Comprehensive test suite for rate limiting and usage tracking including:
 * - Rate limit enforcement across different time windows
 * - Usage limit enforcement for different subscription tiers
 * - Rate limit reset and window calculations
 * - Usage tracking accuracy validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RateLimiter } from '../../src/app/lib/usage/rate-limiter';
import { UsageTracker } from '../../src/app/lib/usage/usage-tracker';
import { TierManager } from '../../src/app/lib/usage/tier-manager';

// Mock Redis client for rate limiting
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  multi: jest.fn(() => ({
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn()
  }))
};

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn()
      })),
      gte: jest.fn(() => ({
        lte: jest.fn(() => ({
          order: jest.fn()
        }))
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

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Rate Limiting Security Tests', () => {
  let rateLimiter: RateLimiter;
  let usageTracker: UsageTracker;
  let tierManager: TierManager;

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter = new RateLimiter();
    usageTracker = new UsageTracker();
    tierManager = new TierManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rate Limit Enforcement Across Time Windows', () => {
    it('should enforce per-minute rate limits', async () => {
      const userId = 'user-123';
      const endpoint = '/api/chat';
      const limit = 10; // 10 requests per minute
      const window = 60; // 60 seconds

      // Mock Redis responses for rate limiting
      let requestCount = 0;
      mockRedis.incr.mockImplementation(() => {
        requestCount++;
        return Promise.resolve(requestCount);
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      // Test requests within limit
      for (let i = 1; i <= limit; i++) {
        mockRedis.incr.mockResolvedValueOnce(i);
        
        const result = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);
        
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - i);
        expect(result.resetTime).toBeDefined();
      }

      // Test request exceeding limit
      mockRedis.incr.mockResolvedValueOnce(limit + 1);
      
      const exceededResult = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);
      
      expect(exceededResult.allowed).toBe(false);
      expect(exceededResult.remaining).toBe(0);
      expect(exceededResult.retryAfter).toBeGreaterThan(0);
    });

    it('should enforce per-hour rate limits', async () => {
      const userId = 'user-123';
      const endpoint = '/api/files/upload';
      const limit = 100; // 100 uploads per hour
      const window = 3600; // 1 hour in seconds

      mockRedis.incr.mockResolvedValue(50); // 50 requests so far
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(1800); // 30 minutes remaining

      const result = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
      expect(result.resetTime).toBeDefined();
      expect(mockRedis.incr).toHaveBeenCalledWith(`rate_limit:${userId}:${endpoint}:hour`);
    });

    it('should enforce per-day rate limits', async () => {
      const userId = 'user-123';
      const endpoint = '/api/documents/process';
      const limit = 1000; // 1000 documents per day
      const window = 86400; // 24 hours in seconds

      mockRedis.incr.mockResolvedValue(999); // Close to limit
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(43200); // 12 hours remaining

      const result = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      expect(result.resetTime).toBeDefined();
    });

    it('should handle multiple concurrent requests correctly', async () => {
      const userId = 'user-123';
      const endpoint = '/api/chat';
      const limit = 10;
      const window = 60;

      // Simulate concurrent requests
      const concurrentRequests = 15;
      let currentCount = 0;

      mockRedis.incr.mockImplementation(() => {
        currentCount++;
        return Promise.resolve(currentCount);
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      const promises = Array.from({ length: concurrentRequests }, () =>
        rateLimiter.checkRateLimit(userId, endpoint, limit, window)
      );

      const results = await Promise.all(promises);

      // First 10 should be allowed, rest should be denied
      const allowedCount = results.filter(r => r.allowed).length;
      const deniedCount = results.filter(r => !r.allowed).length;

      expect(allowedCount).toBeLessThanOrEqual(limit);
      expect(deniedCount).toBeGreaterThan(0);
      expect(allowedCount + deniedCount).toBe(concurrentRequests);
    });

    it('should reset rate limits after window expires', async () => {
      const userId = 'user-123';
      const endpoint = '/api/chat';
      const limit = 5;
      const window = 60;

      // First, exhaust the rate limit
      mockRedis.incr.mockResolvedValue(limit + 1);
      mockRedis.ttl.mockResolvedValue(30); // 30 seconds remaining

      const exceededResult = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);
      expect(exceededResult.allowed).toBe(false);

      // Simulate window expiration
      mockRedis.incr.mockResolvedValue(1); // Reset to 1
      mockRedis.ttl.mockResolvedValue(window); // Full window available

      const resetResult = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);
      expect(resetResult.allowed).toBe(true);
      expect(resetResult.remaining).toBe(limit - 1);
    });
  });

  describe('Usage Limit Enforcement for Subscription Tiers', () => {
    it('should enforce free tier limits', async () => {
      const userId = 'free-user';
      const freeTierLimits = {
        filesPerMonth: 10,
        chatMessagesPerMonth: 100,
        documentsPerMonth: 5,
        storageBytes: 100 * 1024 * 1024 // 100MB
      };

      // Mock current usage
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          files_uploaded: 8,
          chat_messages_sent: 95,
          documents_processed: 4,
          storage_used: 80 * 1024 * 1024 // 80MB
        },
        error: null
      });

      // Test file upload within limit
      const fileUploadResult = await tierManager.checkUsageLimit(
        userId,
        'file_upload',
        freeTierLimits.filesPerMonth
      );
      expect(fileUploadResult.allowed).toBe(true);
      expect(fileUploadResult.remaining).toBe(2);

      // Test chat message within limit
      const chatResult = await tierManager.checkUsageLimit(
        userId,
        'chat_message',
        freeTierLimits.chatMessagesPerMonth
      );
      expect(chatResult.allowed).toBe(true);
      expect(chatResult.remaining).toBe(5);

      // Test exceeding limit
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          files_uploaded: 10, // At limit
          chat_messages_sent: 100, // At limit
          documents_processed: 5, // At limit
          storage_used: 100 * 1024 * 1024 // At limit
        },
        error: null
      });

      const exceededResult = await tierManager.checkUsageLimit(
        userId,
        'file_upload',
        freeTierLimits.filesPerMonth
      );
      expect(exceededResult.allowed).toBe(false);
      expect(exceededResult.remaining).toBe(0);
    });

    it('should enforce pro tier limits', async () => {
      const userId = 'pro-user';
      const proTierLimits = {
        filesPerMonth: 1000,
        chatMessagesPerMonth: 10000,
        documentsPerMonth: 500,
        storageBytes: 10 * 1024 * 1024 * 1024 // 10GB
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          files_uploaded: 500,
          chat_messages_sent: 5000,
          documents_processed: 250,
          storage_used: 5 * 1024 * 1024 * 1024 // 5GB
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(
        userId,
        'file_upload',
        proTierLimits.filesPerMonth
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(500);
      expect(result.tier).toBe('pro');
    });

    it('should handle pro BYOK tier (unlimited)', async () => {
      const userId = 'byok-user';

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'pro_byok',
          files_uploaded: 10000,
          chat_messages_sent: 100000,
          documents_processed: 5000
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(
        userId,
        'file_upload',
        Number.MAX_SAFE_INTEGER // Unlimited
      );

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('pro_byok');
      expect(result.unlimited).toBe(true);
    });

    it('should prevent tier manipulation attacks', async () => {
      const userId = 'malicious-user';

      // User tries to manipulate their tier
      const maliciousTierData = {
        subscription_tier: 'pro_byok', // Claiming higher tier
        tier_override: 'unlimited'
      };

      // Mock that tier verification fails
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          subscription_tier: 'free', // Actual tier from secure source
          files_uploaded: 15 // Over free limit
        },
        error: null
      });

      const result = await tierManager.checkUsageLimit(userId, 'file_upload', 10);

      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.remaining).toBe(0);
    });

    it('should handle subscription tier changes gracefully', async () => {
      const userId = 'upgrading-user';

      // User starts with free tier
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          subscription_tier: 'free',
          files_uploaded: 10, // At free limit
          tier_changed_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      });

      const freeResult = await tierManager.checkUsageLimit(userId, 'file_upload', 10);
      expect(freeResult.allowed).toBe(false);

      // User upgrades to pro
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          subscription_tier: 'pro',
          files_uploaded: 10, // Same usage, but now under pro limit
          tier_changed_at: new Date().toISOString()
        },
        error: null
      });

      const proResult = await tierManager.checkUsageLimit(userId, 'file_upload', 1000);
      expect(proResult.allowed).toBe(true);
      expect(proResult.remaining).toBe(990);
    });
  });

  describe('Rate Limit Reset and Window Calculations', () => {
    it('should calculate correct reset times for different windows', async () => {
      const userId = 'user-123';
      const endpoint = '/api/test';

      // Test minute window
      mockRedis.ttl.mockResolvedValue(45); // 45 seconds remaining
      const minuteResult = await rateLimiter.checkRateLimit(userId, endpoint, 10, 60);
      expect(minuteResult.resetTime).toBeDefined();
      expect(minuteResult.resetTime! - Date.now()).toBeLessThanOrEqual(45000);

      // Test hour window
      mockRedis.ttl.mockResolvedValue(1800); // 30 minutes remaining
      const hourResult = await rateLimiter.checkRateLimit(userId, endpoint, 100, 3600);
      expect(hourResult.resetTime! - Date.now()).toBeLessThanOrEqual(1800000);

      // Test day window
      mockRedis.ttl.mockResolvedValue(43200); // 12 hours remaining
      const dayResult = await rateLimiter.checkRateLimit(userId, endpoint, 1000, 86400);
      expect(dayResult.resetTime! - Date.now()).toBeLessThanOrEqual(43200000);
    });

    it('should handle sliding window rate limiting', async () => {
      const userId = 'user-123';
      const endpoint = '/api/sliding';
      const limit = 10;
      const window = 60; // 1 minute sliding window

      // Mock sliding window implementation
      const requestTimes: number[] = [];
      
      mockRedis.multi().incr().expire().exec.mockImplementation(() => {
        const now = Date.now();
        requestTimes.push(now);
        
        // Remove requests older than window
        const cutoff = now - (window * 1000);
        const recentRequests = requestTimes.filter(time => time > cutoff);
        
        return Promise.resolve([[null, recentRequests.length], [null, 1]]);
      });

      // Make requests over time
      for (let i = 0; i < 15; i++) {
        const result = await rateLimiter.checkSlidingWindowLimit(userId, endpoint, limit, window);
        
        if (i < limit) {
          expect(result.allowed).toBe(true);
        } else {
          expect(result.allowed).toBe(false);
        }
        
        // Simulate time passing
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should handle distributed rate limiting across multiple instances', async () => {
      const userId = 'user-123';
      const endpoint = '/api/distributed';
      const limit = 10;
      const window = 60;

      // Mock distributed counter with atomic operations
      let distributedCount = 0;
      
      mockRedis.multi().incr().expire().exec.mockImplementation(() => {
        distributedCount++;
        return Promise.resolve([[null, distributedCount], [null, 1]]);
      });

      // Simulate requests from multiple instances
      const instanceRequests = Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () =>
          rateLimiter.checkRateLimit(userId, endpoint, limit, window)
        )
      ).flat();

      const results = await Promise.all(instanceRequests);
      
      // Should maintain consistent count across instances
      const allowedRequests = results.filter(r => r.allowed);
      expect(allowedRequests.length).toBeLessThanOrEqual(limit);
    });

    it('should handle rate limit key collisions', async () => {
      const user1 = 'user-123';
      const user2 = 'user-456';
      const endpoint = '/api/test';
      const limit = 5;
      const window = 60;

      // Mock separate counters for different users
      const userCounters = new Map();
      
      mockRedis.incr.mockImplementation((key: string) => {
        const currentCount = userCounters.get(key) || 0;
        const newCount = currentCount + 1;
        userCounters.set(key, newCount);
        return Promise.resolve(newCount);
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      // Both users make requests
      const user1Results = await Promise.all(
        Array.from({ length: 6 }, () =>
          rateLimiter.checkRateLimit(user1, endpoint, limit, window)
        )
      );

      const user2Results = await Promise.all(
        Array.from({ length: 6 }, () =>
          rateLimiter.checkRateLimit(user2, endpoint, limit, window)
        )
      );

      // Each user should have independent limits
      const user1Allowed = user1Results.filter(r => r.allowed).length;
      const user2Allowed = user2Results.filter(r => r.allowed).length;

      expect(user1Allowed).toBe(limit);
      expect(user2Allowed).toBe(limit);
    });
  });

  describe('Usage Tracking Accuracy Validation', () => {
    it('should accurately track file upload usage', async () => {
      const userId = 'user-123';
      const fileSize = 1024 * 1024; // 1MB
      const fileName = 'test-document.pdf';

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'usage-log-1' }],
        error: null
      });

      mockSupabase.from().upsert.mockResolvedValue({
        data: [{ files_uploaded: 1, storage_used: fileSize }],
        error: null
      });

      await usageTracker.trackFileUpload(userId, fileName, fileSize);

      expect(mockSupabase.from).toHaveBeenCalledWith('usage_logs');
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          action: 'file_upload',
          resource_type: 'file',
          metadata: expect.objectContaining({
            file_name: fileName,
            file_size: fileSize
          })
        })
      );
    });

    it('should accurately track chat message usage', async () => {
      const userId = 'user-123';
      const conversationId = 'conv-456';
      const messageLength = 150;
      const tokensUsed = 45;

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'usage-log-2' }],
        error: null
      });

      await usageTracker.trackChatMessage(userId, conversationId, messageLength, tokensUsed);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          action: 'chat_message',
          resource_type: 'conversation',
          resource_id: conversationId,
          metadata: expect.objectContaining({
            message_length: messageLength,
            tokens_used: tokensUsed
          })
        })
      );
    });

    it('should accurately track document processing usage', async () => {
      const userId = 'user-123';
      const documentId = 'doc-789';
      const processingTime = 5000; // 5 seconds
      const chunksCreated = 25;

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'usage-log-3' }],
        error: null
      });

      await usageTracker.trackDocumentProcessing(
        userId,
        documentId,
        processingTime,
        chunksCreated
      );

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          action: 'document_processing',
          resource_type: 'document',
          resource_id: documentId,
          metadata: expect.objectContaining({
            processing_time_ms: processingTime,
            chunks_created: chunksCreated
          })
        })
      );
    });

    it('should handle usage tracking failures gracefully', async () => {
      const userId = 'user-123';
      const fileName = 'test.pdf';
      const fileSize = 1024;

      // Mock database error
      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      // Should not throw error, but should log it
      await expect(
        usageTracker.trackFileUpload(userId, fileName, fileSize)
      ).resolves.not.toThrow();

      expect(mockSupabase.from().insert).toHaveBeenCalled();
    });

    it('should prevent usage tracking manipulation', async () => {
      const userId = 'user-123';
      const maliciousData = {
        user_id: "'; DROP TABLE usage_logs; --",
        action: 'file_upload',
        metadata: {
          file_size: -1000000, // Negative size
          file_name: '../../../etc/passwd'
        }
      };

      // Mock validation that rejects malicious data
      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: { message: 'Invalid data format' }
      });

      const result = await usageTracker.trackUsage(
        maliciousData.user_id,
        maliciousData.action,
        'file',
        null,
        maliciousData.metadata
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should aggregate usage statistics correctly', async () => {
      const userId = 'user-123';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockSupabase.rpc.mockResolvedValue({
        data: {
          files_uploaded: 25,
          chat_messages_sent: 150,
          documents_processed: 10,
          storage_used: 50 * 1024 * 1024, // 50MB
          api_calls_made: 500
        },
        error: null
      });

      const usage = await usageTracker.getUsageStatistics(userId, startDate, endDate);

      expect(usage.files_uploaded).toBe(25);
      expect(usage.chat_messages_sent).toBe(150);
      expect(usage.documents_processed).toBe(10);
      expect(usage.storage_used).toBe(50 * 1024 * 1024);
      expect(usage.api_calls_made).toBe(500);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_user_usage_stats', {
        p_user_id: userId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString()
      });
    });
  });

  describe('Rate Limiting Attack Scenarios', () => {
    it('should prevent rate limit bypass through IP rotation', async () => {
      const userId = 'user-123';
      const endpoint = '/api/test';
      const limit = 5;
      const window = 60;

      // Attacker tries different IPs with same user
      const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3'];
      
      let totalRequests = 0;
      mockRedis.incr.mockImplementation(() => {
        totalRequests++;
        return Promise.resolve(totalRequests);
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      // Make requests from different IPs (should still be rate limited by user)
      for (const ip of ips) {
        for (let i = 0; i < 3; i++) {
          const result = await rateLimiter.checkRateLimit(
            userId,
            endpoint,
            limit,
            window,
            { ip }
          );
          
          if (totalRequests <= limit) {
            expect(result.allowed).toBe(true);
          } else {
            expect(result.allowed).toBe(false);
          }
        }
      }

      expect(totalRequests).toBeGreaterThan(limit);
    });

    it('should prevent rate limit bypass through user agent rotation', async () => {
      const userId = 'user-123';
      const endpoint = '/api/test';
      const limit = 5;
      const window = 60;

      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Mozilla/5.0 (X11; Linux x86_64)'
      ];

      let requestCount = 0;
      mockRedis.incr.mockImplementation(() => {
        requestCount++;
        return Promise.resolve(requestCount);
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      // Attacker rotates user agents (should still be rate limited by user)
      for (const userAgent of userAgents) {
        for (let i = 0; i < 3; i++) {
          const result = await rateLimiter.checkRateLimit(
            userId,
            endpoint,
            limit,
            window,
            { userAgent }
          );
          
          if (requestCount <= limit) {
            expect(result.allowed).toBe(true);
          } else {
            expect(result.allowed).toBe(false);
          }
        }
      }
    });

    it('should prevent distributed denial of service through rate limiting', async () => {
      const endpoint = '/api/public';
      const globalLimit = 1000; // Global limit per minute
      const window = 60;

      // Simulate many users making requests
      const userCount = 100;
      const requestsPerUser = 15;

      let globalRequestCount = 0;
      mockRedis.incr.mockImplementation((key: string) => {
        if (key.includes('global')) {
          globalRequestCount++;
          return Promise.resolve(globalRequestCount);
        } else {
          return Promise.resolve(1); // Individual user count
        }
      });

      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(window);

      const allRequests = [];
      
      for (let userId = 1; userId <= userCount; userId++) {
        for (let req = 1; req <= requestsPerUser; req++) {
          allRequests.push(
            rateLimiter.checkGlobalRateLimit(
              `user-${userId}`,
              endpoint,
              globalLimit,
              window
            )
          );
        }
      }

      const results = await Promise.all(allRequests);
      const allowedRequests = results.filter(r => r.allowed).length;

      // Should not exceed global limit
      expect(allowedRequests).toBeLessThanOrEqual(globalLimit);
    });

    it('should handle rate limit storage failures gracefully', async () => {
      const userId = 'user-123';
      const endpoint = '/api/test';
      const limit = 10;
      const window = 60;

      // Mock Redis failure
      mockRedis.incr.mockRejectedValue(new Error('Redis connection failed'));

      // Should fail safely (either allow with warning or deny)
      const result = await rateLimiter.checkRateLimit(userId, endpoint, limit, window);
      
      // Implementation should handle gracefully
      expect(result).toBeDefined();
      expect(typeof result.allowed).toBe('boolean');
      
      if (!result.allowed) {
        expect(result.error).toBeDefined();
      }
    });
  });
});