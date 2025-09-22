/**
 * Integration test for OAuth route open redirect protection
 * Tests that external redirect attempts are properly sanitized
 */

import { clampNext } from '@/app/lib/auth/utils';

describe('OAuth Open Redirect Protection', () => {
  describe('clampNext integration', () => {
    it('should protect against external redirects in OAuth flow', () => {
      // Simulate malicious redirect attempts that could be passed to OAuth routes
      const maliciousAttempts = [
        'https://evil.com/steal-tokens',
        'http://malicious.site/phishing',
        '//attacker.com/redirect',
        'javascript:alert(document.cookie)',
        'data:text/html,<script>alert(1)</script>',
        'evil.com/fake-dashboard',
        'redirect-to-evil'
      ];

      maliciousAttempts.forEach(attempt => {
        const result = clampNext(attempt);
        expect(result).toBe('/briefly/app/dashboard');
      });
    });

    it('should allow legitimate internal redirects', () => {
      const legitimateRedirects = [
        '/briefly/app/dashboard',
        '/briefly/app/billing',
        '/auth/signin',
        '/briefly/app/dashboard?tab=files',
        '/auth/signin?error=oauth_failed'
      ];

      legitimateRedirects.forEach(redirect => {
        const result = clampNext(redirect);
        expect(result).toBe(redirect);
      });
    });

    it('should handle OAuth callback scenarios', () => {
      // Test scenarios that would occur in OAuth callback
      expect(clampNext(undefined)).toBe('/briefly/app/dashboard');
      expect(clampNext('')).toBe('/briefly/app/dashboard');
      expect(clampNext('/briefly/app/dashboard')).toBe('/briefly/app/dashboard');
      expect(clampNext('/briefly/app/billing?plan=pro')).toBe('/briefly/app/billing?plan=pro');
    });

    it('should handle OAuth start scenarios', () => {
      // Test scenarios that would occur in OAuth start
      expect(clampNext('/briefly/app/dashboard')).toBe('/briefly/app/dashboard');
      expect(clampNext('https://evil.com')).toBe('/briefly/app/dashboard');
      expect(clampNext('/auth/signin?next=%2Fbriefly%2Fapp%2Fdashboard')).toBe('/auth/signin?next=%2Fbriefly%2Fapp%2Fdashboard');
    });
  });

  describe('OAuth route behavior simulation', () => {
    it('should simulate /auth/start route protection', () => {
      // Simulate what happens in /auth/start route
      const simulateAuthStart = (nextParam: string | null) => {
        const next = clampNext(nextParam);
        const redirectTo = `/auth/callback?next=${encodeURIComponent(next)}`;
        return { next, redirectTo };
      };

      // Test with malicious input
      const maliciousResult = simulateAuthStart('https://evil.com');
      expect(maliciousResult.next).toBe('/briefly/app/dashboard');
      expect(maliciousResult.redirectTo).toBe('/auth/callback?next=%2Fbriefly%2Fapp%2Fdashboard');

      // Test with legitimate input
      const legitimateResult = simulateAuthStart('/briefly/app/billing');
      expect(legitimateResult.next).toBe('/briefly/app/billing');
      expect(legitimateResult.redirectTo).toBe('/auth/callback?next=%2Fbriefly%2Fapp%2Fbilling');
    });

    it('should simulate /auth/callback route protection', () => {
      // Simulate what happens in /auth/callback route
      const simulateAuthCallback = (nextParam: string | null) => {
        const next = clampNext(nextParam);
        return { finalRedirect: next };
      };

      // Test with malicious input
      const maliciousResult = simulateAuthCallback('//evil.com/steal');
      expect(maliciousResult.finalRedirect).toBe('/briefly/app/dashboard');

      // Test with legitimate input
      const legitimateResult = simulateAuthCallback('/briefly/app/dashboard?welcome=true');
      expect(legitimateResult.finalRedirect).toBe('/briefly/app/dashboard?welcome=true');
    });
  });
});
