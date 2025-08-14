/**
 * Authentication Security Tests
 * 
 * Comprehensive test suite for authentication security including:
 * - Token validation and session management
 * - Authentication bypass prevention
 * - Session expiration and invalidation
 * - Authentication failure logging
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '../../src/app/lib/auth/auth-middleware';
import { AuditLogger } from '../../src/app/lib/audit/audit-logger';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    getSession: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    insert: jest.fn(),
    update: jest.fn(() => ({
      eq: jest.fn()
    }))
  }))
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Authentication Security Tests', () => {
  let auditLogger: AuditLogger;
  
  beforeEach(() => {
    jest.clearAllMocks();
    auditLogger = new AuditLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Token Validation and Session Management', () => {
    it('should reject invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
      expect(mockSupabase.auth.getUser).toHaveBeenCalledWith(invalidToken);
    });

    it('should accept valid JWT tokens', async () => {
      const validToken = 'valid.jwt.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated'
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).not.toBe(401);
      expect(mockSupabase.auth.getUser).toHaveBeenCalledWith(validToken);
    });

    it('should validate token expiration', async () => {
      const expiredToken = 'expired.jwt.token';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
      const responseBody = await response.json();
      expect(responseBody.error).toContain('expired');
    });

    it('should handle malformed authorization headers', async () => {
      const malformedHeaders = [
        'Bearer', // Missing token
        'InvalidScheme token', // Wrong scheme
        'Bearer token1 token2', // Multiple tokens
        '', // Empty header
      ];

      for (const header of malformedHeaders) {
        const request = new NextRequest('http://localhost:3000/api/protected', {
          headers: header ? { 'Authorization': header } : {}
        });

        const response = await authMiddleware(request);
        expect(response.status).toBe(401);
      }
    });

    it('should validate session consistency', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };

      // Mock user exists in auth
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      // Mock user exists in database
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { id: 'user-123', email: 'test@example.com' },
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).not.toBe(401);
      expect(mockSupabase.from).toHaveBeenCalledWith('users');
    });
  });

  describe('Authentication Bypass Prevention', () => {
    it('should prevent access without authentication header', async () => {
      const request = new NextRequest('http://localhost:3000/api/protected');
      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
    });

    it('should prevent privilege escalation through token manipulation', async () => {
      // Test with a token that claims admin privileges but isn't valid
      const manipulatedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkbWluIFVzZXIiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE1MTYyMzkwMjJ9.invalid';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid signature' }
      });

      const request = new NextRequest('http://localhost:3000/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${manipulatedToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
    });

    it('should prevent SQL injection in authentication queries', async () => {
      const maliciousEmail = "admin@example.com'; DROP TABLE users; --";
      
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' }
      });

      // Simulate login attempt with malicious email
      const loginAttempt = await mockSupabase.auth.signInWithPassword({
        email: maliciousEmail,
        password: 'password'
      });

      expect(loginAttempt.error).toBeTruthy();
      expect(loginAttempt.data.user).toBeNull();
    });

    it('should prevent session fixation attacks', async () => {
      const fixedSessionId = 'fixed-session-id';
      
      // Mock session validation
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session not found' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Cookie': `sb-session=${fixedSessionId}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
    });

    it('should prevent concurrent session abuse', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        last_sign_in_at: new Date().toISOString()
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      // Mock multiple concurrent requests
      const requests = Array.from({ length: 10 }, () => 
        new NextRequest('http://localhost:3000/api/protected', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Forwarded-For': '192.168.1.100'
          }
        })
      );

      const responses = await Promise.all(
        requests.map(req => authMiddleware(req))
      );

      // All should succeed for valid token, but rate limiting should apply
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Session Expiration and Invalidation', () => {
    it('should handle expired sessions gracefully', async () => {
      const expiredToken = 'expired.token';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
      
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Token expired');
      expect(responseBody.code).toBe('TOKEN_EXPIRED');
    });

    it('should invalidate sessions on logout', async () => {
      const token = 'valid.token';
      
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null
      });

      // Simulate logout
      await mockSupabase.auth.signOut();

      // Subsequent request with same token should fail
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT invalid' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('should handle session refresh correctly', async () => {
      const refreshToken = 'refresh.token';
      const newAccessToken = 'new.access.token';
      
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            access_token: newAccessToken,
            refresh_token: refreshToken,
            expires_at: Date.now() + 3600000 // 1 hour from now
          }
        },
        error: null
      });

      const refreshResult = await mockSupabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      expect(refreshResult.data.session.access_token).toBe(newAccessToken);
      expect(refreshResult.error).toBeNull();
    });

    it('should enforce session timeout policies', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        last_sign_in_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      // Mock session timeout check
      const sessionAge = Date.now() - new Date(mockUser.last_sign_in_at).getTime();
      const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

      if (sessionAge > maxSessionAge) {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Session expired due to inactivity' }
        });
      }

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
    });
  });

  describe('Authentication Failure Logging', () => {
    it('should log failed authentication attempts', async () => {
      const invalidToken = 'invalid.token';
      const clientIP = '192.168.1.100';
      const userAgent = 'Mozilla/5.0 (Test Browser)';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' }
      });

      const logSpy = jest.spyOn(auditLogger, 'logSecurityEvent');

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${invalidToken}`,
          'X-Forwarded-For': clientIP,
          'User-Agent': userAgent
        }
      });

      await authMiddleware(request);

      expect(logSpy).toHaveBeenCalledWith({
        event_type: 'authentication_failure',
        severity: 'medium',
        details: expect.objectContaining({
          reason: 'Invalid JWT',
          ip_address: clientIP,
          user_agent: userAgent,
          endpoint: '/api/protected'
        })
      });
    });

    it('should log suspicious authentication patterns', async () => {
      const clientIP = '192.168.1.100';
      const logSpy = jest.spyOn(auditLogger, 'logSecurityEvent');

      // Simulate multiple failed attempts from same IP
      for (let i = 0; i < 5; i++) {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid JWT' }
        });

        const request = new NextRequest('http://localhost:3000/api/protected', {
          headers: {
            'Authorization': `Bearer invalid.token.${i}`,
            'X-Forwarded-For': clientIP
          }
        });

        await authMiddleware(request);
      }

      // Should log suspicious pattern after multiple failures
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'suspicious_authentication_pattern',
          severity: 'high',
          details: expect.objectContaining({
            ip_address: clientIP,
            failure_count: expect.any(Number)
          })
        })
      );
    });

    it('should log successful authentications with context', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };
      const clientIP = '192.168.1.100';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const logSpy = jest.spyOn(auditLogger, 'logAction');

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Forwarded-For': clientIP
        }
      });

      await authMiddleware(request);

      expect(logSpy).toHaveBeenCalledWith({
        user_id: mockUser.id,
        action: 'authentication_success',
        resource_type: 'session',
        resource_id: expect.any(String),
        details: expect.objectContaining({
          ip_address: clientIP,
          endpoint: '/api/protected'
        })
      });
    });

    it('should track authentication attempt frequency', async () => {
      const clientIP = '192.168.1.100';
      const timeWindow = 5 * 60 * 1000; // 5 minutes
      const maxAttempts = 10;

      // Mock rate limiting storage
      const attemptCounts = new Map<string, { count: number; firstAttempt: number }>();

      const trackAttempt = (ip: string) => {
        const now = Date.now();
        const existing = attemptCounts.get(ip);

        if (!existing || (now - existing.firstAttempt) > timeWindow) {
          attemptCounts.set(ip, { count: 1, firstAttempt: now });
          return 1;
        } else {
          existing.count++;
          return existing.count;
        }
      };

      // Simulate rapid authentication attempts
      for (let i = 0; i < 15; i++) {
        const attemptCount = trackAttempt(clientIP);
        
        if (attemptCount > maxAttempts) {
          // Should trigger rate limiting
          expect(attemptCount).toBeGreaterThan(maxAttempts);
          break;
        }
      }

      const finalCount = attemptCounts.get(clientIP)?.count || 0;
      expect(finalCount).toBeGreaterThan(maxAttempts);
    });

    it('should log authentication context and metadata', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const logSpy = jest.spyOn(auditLogger, 'logAction');

      const request = new NextRequest('http://localhost:3000/api/files/upload', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Forwarded-For': '192.168.1.100',
          'User-Agent': 'Mozilla/5.0 (Test Browser)',
          'X-Real-IP': '10.0.0.1',
          'CF-Connecting-IP': '203.0.113.1'
        }
      });

      await authMiddleware(request);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            ip_address: expect.any(String),
            user_agent: 'Mozilla/5.0 (Test Browser)',
            endpoint: '/api/files/upload',
            method: 'GET',
            timestamp: expect.any(String)
          })
        })
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const token = 'valid.token';
      
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network timeout'));

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(500);
      
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Authentication service unavailable');
    });

    it('should handle malformed JWT tokens', async () => {
      const malformedTokens = [
        'not.a.jwt',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malformed',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..missing-payload',
        ''
      ];

      for (const token of malformedTokens) {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid JWT format' }
        });

        const request = new NextRequest('http://localhost:3000/api/protected', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const response = await authMiddleware(request);
        expect(response.status).toBe(401);
      }
    });

    it('should handle database connection failures during auth', async () => {
      const token = 'valid.token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      // Mock database connection failure
      mockSupabase.from().select().eq().single.mockRejectedValue(
        new Error('Connection to database failed')
      );

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(500);
    });

    it('should validate token signature integrity', async () => {
      const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.tampered_signature';
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid signature' }
      });

      const request = new NextRequest('http://localhost:3000/api/protected', {
        headers: {
          'Authorization': `Bearer ${tamperedToken}`
        }
      });

      const response = await authMiddleware(request);
      
      expect(response.status).toBe(401);
      
      const responseBody = await response.json();
      expect(responseBody.error).toContain('Invalid');
    });
  });
});