import { clampNext } from '../utils';

describe('clampNext', () => {
  it('should return dashboard for undefined input', () => {
    expect(clampNext()).toBe('/briefly/app/dashboard');
  });

  it('should return dashboard for null input', () => {
    expect(clampNext(null as any)).toBe('/briefly/app/dashboard');
  });

  it('should return dashboard for empty string', () => {
    expect(clampNext('')).toBe('/briefly/app/dashboard');
  });

  it('should allow valid internal paths', () => {
    expect(clampNext('/briefly/app/billing')).toBe('/briefly/app/billing');
    expect(clampNext('/auth/signin')).toBe('/auth/signin');
    expect(clampNext('/api/health')).toBe('/api/health');
  });

  it('should preserve query parameters for valid paths', () => {
    expect(clampNext('/briefly/app/dashboard?tab=files')).toBe('/briefly/app/dashboard?tab=files');
    expect(clampNext('/auth/signin?error=oauth_failed')).toBe('/auth/signin?error=oauth_failed');
  });

  it('should reject external URLs and default to dashboard', () => {
    expect(clampNext('https://evil.com')).toBe('/briefly/app/dashboard');
    expect(clampNext('http://malicious.site/steal')).toBe('/briefly/app/dashboard');
    expect(clampNext('//evil.com/phishing')).toBe('/briefly/app/dashboard');
  });

  it('should reject protocol-relative URLs', () => {
    expect(clampNext('//example.com')).toBe('/briefly/app/dashboard');
    expect(clampNext('//evil.com/redirect')).toBe('/briefly/app/dashboard');
  });

  it('should reject javascript: URLs', () => {
    expect(clampNext('javascript:alert(1)')).toBe('/briefly/app/dashboard');
  });

  it('should reject data: URLs', () => {
    expect(clampNext('data:text/html,<script>alert(1)</script>')).toBe('/briefly/app/dashboard');
  });

  it('should reject paths that do not start with /', () => {
    expect(clampNext('evil.com')).toBe('/briefly/app/dashboard');
    expect(clampNext('redirect-to-evil')).toBe('/briefly/app/dashboard');
  });

  it('should handle malformed URLs gracefully', () => {
    expect(clampNext('not-a-url')).toBe('/briefly/app/dashboard');
    expect(clampNext('http://')).toBe('/briefly/app/dashboard');
    expect(clampNext('://invalid')).toBe('/briefly/app/dashboard');
  });
});