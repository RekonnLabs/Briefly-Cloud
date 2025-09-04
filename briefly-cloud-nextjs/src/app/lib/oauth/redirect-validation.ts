/**
 * OAuth Redirect URI Validation
 * 
 * Provides security validation for OAuth redirect URIs to prevent
 * redirect attacks and ensure callbacks only go to trusted domains.
 */

/**
 * Domain allowlist for OAuth redirect URIs
 * 
 * Security Note: This list should be kept minimal and only include
 * domains that are under our control. Each domain should be verified
 * to prevent redirect attacks.
 */
const ALLOWED_DOMAINS = {
  production: [
    'briefly.rekonnlabs.com',
    'www.briefly.rekonnlabs.com'
  ],
  preview: [
    // Vercel preview domains
    'briefly-cloud-nextjs-git-main-rekonnlabs.vercel.app',
    'briefly-cloud-nextjs-rekonnlabs.vercel.app',
    // Add specific preview branches as needed
    /^briefly-cloud-nextjs-.*-rekonnlabs\.vercel\.app$/
  ],
  development: [
    'localhost:3000',
    '127.0.0.1:3000',
    'localhost:3001', // Alternative dev port
    '127.0.0.1:3001'
  ]
} as const

/**
 * Get current environment based on NODE_ENV and VERCEL_ENV
 */
function getCurrentEnvironment(): keyof typeof ALLOWED_DOMAINS {
  // Check if we're in Vercel preview environment
  if (process.env.VERCEL_ENV === 'preview') {
    return 'preview'
  }
  
  // Check if we're in production
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return 'production'
  }
  
  // Default to development
  return 'development'
}

/**
 * Validate if a redirect URI is allowed for the current environment
 * 
 * @param uri - The redirect URI to validate
 * @param provider - OAuth provider name (for logging)
 * @returns true if URI is allowed, false otherwise
 */
export function validateRedirectUri(uri: string, provider?: string): boolean {
  try {
    const url = new URL(uri)
    const environment = getCurrentEnvironment()
    const allowedDomains = ALLOWED_DOMAINS[environment]
    
    // Check against string domains
    const stringDomains = allowedDomains.filter((domain) => 
      typeof domain === 'string'
    ) as string[]
    
    // Check against regex patterns
    const regexDomains = allowedDomains.filter((domain) => 
      domain instanceof RegExp
    ) as RegExp[]
    
    // Validate against string domains
    const isStringMatch = stringDomains.some(domain => {
      // Exact match or subdomain match
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    })
    
    // Validate against regex patterns
    const isRegexMatch = regexDomains.some(pattern => 
      pattern.test(url.hostname)
    )
    
    const isValid = isStringMatch || isRegexMatch
    
    // Log validation result for security monitoring
    console.info('[oauth:redirect-validation]', {
      provider,
      uri,
      hostname: url.hostname,
      environment,
      isValid,
      timestamp: new Date().toISOString()
    })
    
    return isValid
    
  } catch (error) {
    // Invalid URL format
    console.error('[oauth:redirect-validation]', {
      provider,
      uri,
      error: 'invalid_url_format',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    })
    
    return false
  }
}

/**
 * Get allowed domains for the current environment (for documentation/debugging)
 */
export function getAllowedDomains(): string[] {
  const environment = getCurrentEnvironment()
  const allowedDomains = ALLOWED_DOMAINS[environment]
  
  return allowedDomains.map(domain => 
    typeof domain === 'string' ? domain : domain.source
  )
}

/**
 * Validate and construct a redirect URI for OAuth callbacks
 * 
 * @param origin - The request origin
 * @param provider - OAuth provider name
 * @param path - Callback path (e.g., '/api/storage/google/callback')
 * @returns Validated redirect URI
 * @throws Error if origin is not allowed
 */
export function constructRedirectUri(origin: string, provider: string, path: string): string {
  // Validate the origin first
  const testUri = `${origin}${path}`
  
  if (!validateRedirectUri(testUri, provider)) {
    throw new Error(`Redirect URI not allowed for ${provider}: ${testUri}`)
  }
  
  return testUri
}

/**
 * Security error for invalid redirect URIs
 */
export class InvalidRedirectUriError extends Error {
  constructor(
    public readonly uri: string,
    public readonly provider: string,
    public readonly environment: string
  ) {
    super(`Invalid redirect URI for ${provider} in ${environment}: ${uri}`)
    this.name = 'InvalidRedirectUriError'
  }
}

/**
 * Validate redirect URI and throw security error if invalid
 * 
 * @param uri - The redirect URI to validate
 * @param provider - OAuth provider name
 * @throws InvalidRedirectUriError if URI is not allowed
 */
export function validateRedirectUriOrThrow(uri: string, provider: string): void {
  if (!validateRedirectUri(uri, provider)) {
    const environment = getCurrentEnvironment()
    throw new InvalidRedirectUriError(uri, provider, environment)
  }
}

/**
 * Get environment-specific configuration for OAuth provider consoles
 * This helps developers configure the correct redirect URIs in provider consoles
 */
export function getProviderConsoleConfig() {
  const environment = getCurrentEnvironment()
  const allowedDomains = getAllowedDomains()
  
  return {
    environment,
    allowedDomains,
    redirectUris: {
      google: allowedDomains.map(domain => `https://${domain}/api/storage/google/callback`),
      microsoft: allowedDomains.map(domain => `https://${domain}/api/storage/microsoft/callback`)
    },
    instructions: {
      google: 'Add these redirect URIs to your Google Cloud Console OAuth 2.0 Client',
      microsoft: 'Add these redirect URIs to your Azure App Registration'
    }
  }
}