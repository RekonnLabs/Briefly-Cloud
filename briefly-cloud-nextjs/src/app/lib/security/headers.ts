/**
 * Production Security Headers Configuration
 * 
 * Defines security headers that should be applied in production environments
 * to protect against common web vulnerabilities and attacks.
 */

export interface SecurityHeaders {
  [key: string]: string
}

/**
 * Production security headers configuration
 * 
 * These headers are applied only in production to avoid interfering
 * with development tools and local testing.
 */
export const PRODUCTION_SECURITY_HEADERS: SecurityHeaders = {
  // HTTPS enforcement - forces all connections to use HTTPS
  // includeSubDomains: applies to all subdomains
  // preload: allows inclusion in browser HSTS preload lists
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Prevents MIME type sniffing attacks
  // Forces browsers to respect declared content types
  'X-Content-Type-Options': 'nosniff',
  
  // Clickjacking protection - prevents embedding in frames
  // DENY: completely prevents framing
  'X-Frame-Options': 'DENY',
  
  // Controls referrer information sent with requests
  // strict-origin-when-cross-origin: sends full URL for same-origin, origin only for cross-origin HTTPS
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Legacy XSS protection (still useful for older browsers)
  // 1; mode=block: enables XSS filtering and blocks page if attack detected
  'X-XSS-Protection': '1; mode=block',
  
  // Permissions policy to restrict dangerous browser features
  // Explicitly denies access to sensitive APIs
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
}

/**
 * Content Security Policy (CSP) configuration
 * 
 * Note: CSP is complex and should be carefully configured based on
 * the specific needs of the application. This is a basic configuration.
 */
export const CONTENT_SECURITY_POLICY = {
  // Basic CSP for enhanced security
  basic: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.openai.com https://*.supabase.co https://api.stripe.com; frame-ancestors 'none';",
  
  // Strict CSP (may require more configuration)
  strict: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.openai.com https://*.supabase.co https://api.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
}

/**
 * Apply security headers to a NextResponse
 * 
 * @param response - NextResponse to apply headers to
 * @param options - Configuration options
 */
export function applySecurityHeaders(
  response: Response, 
  options: {
    environment?: string
    includeCSP?: boolean
    cspPolicy?: 'basic' | 'strict'
  } = {}
): void {
  const { 
    environment = process.env.NODE_ENV,
    includeCSP = false,
    cspPolicy = 'basic'
  } = options
  
  // Only apply in production environment
  if (environment !== 'production') {
    return
  }
  
  // Apply all production security headers
  Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
    response.headers.set(name, value)
  })
  
  // Optionally apply Content Security Policy
  if (includeCSP) {
    response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY[cspPolicy])
  }
}

/**
 * Get security headers as an object (useful for Next.js config)
 */
export function getSecurityHeadersConfig(includeCSP = false, cspPolicy: 'basic' | 'strict' = 'basic') {
  const headers = { ...PRODUCTION_SECURITY_HEADERS }
  
  if (includeCSP) {
    headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY[cspPolicy]
  }
  
  return Object.entries(headers).map(([key, value]) => ({ key, value }))
}

/**
 * Security headers documentation for compliance and auditing
 */
export const SECURITY_HEADERS_DOCUMENTATION = {
  'Strict-Transport-Security': {
    purpose: 'Enforces HTTPS connections and prevents protocol downgrade attacks',
    compliance: 'Required for PCI DSS, recommended by OWASP',
    impact: 'Forces all connections to use HTTPS for enhanced security'
  },
  
  'X-Content-Type-Options': {
    purpose: 'Prevents MIME type sniffing attacks',
    compliance: 'OWASP recommended security header',
    impact: 'Browsers will not try to guess content types, preventing certain attacks'
  },
  
  'X-Frame-Options': {
    purpose: 'Prevents clickjacking attacks by controlling frame embedding',
    compliance: 'OWASP recommended, required for many security frameworks',
    impact: 'Prevents the page from being embedded in frames or iframes'
  },
  
  'Referrer-Policy': {
    purpose: 'Controls referrer information to protect user privacy',
    compliance: 'Privacy regulations (GDPR), security best practices',
    impact: 'Limits referrer information sent to external sites'
  },
  
  'X-XSS-Protection': {
    purpose: 'Enables browser XSS filtering (legacy but still useful)',
    compliance: 'Defense in depth security practice',
    impact: 'Provides additional XSS protection in older browsers'
  },
  
  'Permissions-Policy': {
    purpose: 'Restricts access to sensitive browser APIs',
    compliance: 'Privacy by design, security best practices',
    impact: 'Prevents unauthorized access to camera, microphone, location, etc.'
  }
} as const