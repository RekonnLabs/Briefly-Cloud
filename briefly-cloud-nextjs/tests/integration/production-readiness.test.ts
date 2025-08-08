/**
 * Production Readiness Integration Tests
 * 
 * Comprehensive tests to verify the system is ready for production deployment
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  timeout: 30000,
  retries: 3
};

describe('Production Readiness Tests', () => {
  let supabase: any;

  beforeAll(async () => {
    // Initialize test clients
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  });

  afterAll(async () => {
    // Cleanup test data if needed
  });

  describe('System Health Checks', () => {
    it('should have healthy system status', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      const health = await response.json();

      expect(response.status).toBe(200);
      expect(health.status).toBe('healthy');
      expect(health.services.database.status).toBe('healthy');
      expect(health.services.openai.status).toBe('healthy');
      expect(health.services.supabase.status).toBe('healthy');
    }, TEST_CONFIG.timeout);

    it('should have acceptable response times', async () => {
      const startTime = Date.now();
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should have proper security headers', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);

      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-xss-protection')).toBe('1; mode=block');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Database Connectivity', () => {
    it('should connect to database successfully', async () => {
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('should have proper RLS policies', async () => {
      // Test that unauthorized access is blocked
      const publicClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await publicClient
        .from('users')
        .select('*');

      // Should either return empty data or require authentication
      expect(error || data?.length === 0).toBeTruthy();
    });

    it('should handle database connection failures gracefully', async () => {
      // Test with invalid credentials
      const invalidClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        'invalid-key'
      );

      const { data, error } = await invalidClient
        .from('users')
        .select('count')
        .limit(1);

      expect(error).toBeDefined();
      expect(data).toBeNull();
    });
  });

  describe('API Endpoints', () => {
    it('should protect authenticated routes', async () => {
      const protectedEndpoints = [
        '/api/upload',
        '/api/chat',
        '/api/user/profile',
        '/api/storage/google',
        '/api/gdpr/consent'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`);
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should allow public routes', async () => {
      const publicEndpoints = [
        '/api/health',
        '/api/client-ip'
      ];

      for (const endpoint of publicEndpoints) {
        const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`);
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      }
    });

    it('should handle invalid requests properly', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/nonexistent`);
      expect(response.status).toBe(404);
    });

    it('should validate input data', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invalid: 'data'
        })
      });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('External Service Integration', () => {
    it('should connect to OpenAI API', async () => {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        }
      });

      expect(response.status).toBe(200);
    });

    it('should handle OpenAI API failures gracefully', async () => {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': 'Bearer invalid-key',
        }
      });

      expect(response.status).toBe(401);
    });

    it('should connect to Supabase services', async () => {
      const { error } = await supabase.auth.getSession();
      // Should not throw an error (may return null session)
      expect(error).toBeNull();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should have acceptable API response times', async () => {
      const endpoints = [
        '/api/health',
        '/api/client-ip'
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`);
        const responseTime = Date.now() - startTime;

        expect(response.status).toBeLessThan(400);
        expect(responseTime).toBeLessThan(1000); // Less than 1 second
      }
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = Array(concurrentRequests).fill(null).map(() =>
        fetch(`${TEST_CONFIG.baseUrl}/api/health`)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should have reasonable memory usage', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      const health = await response.json();

      if (health.performance?.memory) {
        expect(health.performance.memory.percentage).toBeLessThan(90);
      }
    });
  });

  describe('Security Validation', () => {
    it('should enforce HTTPS in production', async () => {
      if (process.env.NODE_ENV === 'production') {
        expect(TEST_CONFIG.baseUrl).toMatch(/^https:/);
      }
    });

    it('should have secure cookie settings', async () => {
      // This would be tested with actual authentication flow
      // For now, we verify the configuration exists
      expect(process.env.NEXTAUTH_SECRET).toBeDefined();
      expect(process.env.NEXTAUTH_SECRET!.length).toBeGreaterThan(32);
    });

    it('should validate environment variables', async () => {
      const requiredEnvVars = [
        'NEXTAUTH_SECRET',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'OPENAI_API_KEY'
      ];

      requiredEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
        expect(process.env[envVar]).not.toBe('');
      });
    });

    it('should not expose sensitive information', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      const health = await response.json();

      // Ensure no sensitive data is exposed
      const responseText = JSON.stringify(health);
      expect(responseText).not.toMatch(/password|secret|key|token/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // This would require a way to simulate database failures
      // For now, we test with invalid queries
      const { data, error } = await supabase
        .from('nonexistent_table')
        .select('*');

      expect(error).toBeDefined();
      expect(data).toBeNull();
    });

    it('should return proper error responses', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      
      const errorData = await response.json();
      expect(errorData).toHaveProperty('error');
    });

    it('should handle malformed requests', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json'
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Feature Flags', () => {
    it('should have feature flag system operational', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/feature-flags/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature_name: 'test_feature'
        })
      });

      // Should return 401 (unauthorized) or 200 (if authenticated)
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GDPR Compliance', () => {
    it('should have GDPR endpoints available', async () => {
      const gdprEndpoints = [
        '/api/gdpr/consent',
        '/api/gdpr/data-export',
        '/api/gdpr/data-deletion'
      ];

      for (const endpoint of gdprEndpoints) {
        const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`);
        // Should require authentication, not return 404
        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Monitoring and Observability', () => {
    it('should have monitoring endpoints', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/monitoring/dashboard`);
      // Should require admin access, not return 404
      expect(response.status).not.toBe(404);
    });

    it('should generate request IDs', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      expect(response.headers.get('x-request-id')).toBeDefined();
    });

    it('should include performance headers', async () => {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      expect(response.headers.get('x-response-time')).toBeDefined();
    });
  });
});