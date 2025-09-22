/**
 * OAuth Security Configuration
 * 
 * Defines minimal required scopes and security settings for OAuth providers.
 * This configuration follows security best practices by requesting only
 * the minimum permissions needed for functionality.
 */

export interface OAuthProviderConfig {
  /** Minimal required scopes for the provider */
  scopes: string[]
  /** OAuth-specific security settings */
  settings: Record<string, string>
  /** Human-readable description of what each scope provides */
  scopeDescriptions: Record<string, string>
}

/**
 * OAuth Security Configuration for all supported providers
 * 
 * Security Principles:
 * 1. Minimal Scope Principle - Request only necessary permissions
 * 2. Offline Access - Enable refresh tokens for persistent access
 * 3. User Consent - Always prompt for explicit user consent
 * 4. File-Specific Access - Only access files explicitly selected by user
 */
export const OAuthSecurityConfig: Record<string, OAuthProviderConfig> = {
  google: {
    scopes: [
      'openid',                                              // Required for OAuth 2.0 identity
      'email',                                               // User email for account linking
      'profile',                                             // Basic profile info
      'https://www.googleapis.com/auth/drive.file'           // Access to files opened/created by app
    ],
    settings: {
      access_type: 'offline',                                // Enable refresh tokens
      prompt: 'consent',                                     // Always show consent screen
      include_granted_scopes: 'true',                        // Incremental authorization
      response_type: 'code'                                  // Authorization code flow
    },
    scopeDescriptions: {
      'openid': 'Basic identity verification',
      'email': 'Access to your email address for account linking',
      'profile': 'Access to basic profile information (name, picture)',
      'https://www.googleapis.com/auth/drive.file': 'Access to files you select or create with this app'
    }
  },

  microsoft: {
    scopes: [
      'offline_access',                                      // Enable refresh tokens
      'Files.Read',                                          // Read-only OneDrive access
      'User.Read',                                           // Basic user profile
      'openid',                                              // Required for OAuth 2.0 identity
      'profile',                                             // Basic profile info
      'email'                                                // User email for account linking
    ],
    settings: {
      response_type: 'code',                                 // Authorization code flow
      tenant: process.env.MS_DRIVE_TENANT_ID || 'common'     // Multi-tenant or specific tenant
    },
    scopeDescriptions: {
      'offline_access': 'Maintain access when you are not actively using the app',
      'Files.Read': 'Read-only access to your OneDrive files',
      'User.Read': 'Access to basic user profile information',
      'openid': 'Basic identity verification',
      'profile': 'Access to basic profile information (name, picture)',
      'email': 'Access to your email address for account linking'
    }
  }
}

/**
 * Get OAuth scopes for a provider as a space-separated string
 */
export function getOAuthScopes(provider: keyof typeof OAuthSecurityConfig): string {
  const config = OAuthSecurityConfig[provider]
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${provider}`)
  }
  return config.scopes.join(' ')
}

/**
 * Get OAuth settings for a provider
 */
export function getOAuthSettings(provider: keyof typeof OAuthSecurityConfig): Record<string, string> {
  const config = OAuthSecurityConfig[provider]
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${provider}`)
  }
  return { ...config.settings }
}

/**
 * Get scope descriptions for documentation and user consent
 */
export function getScopeDescriptions(provider: keyof typeof OAuthSecurityConfig): Record<string, string> {
  const config = OAuthSecurityConfig[provider]
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${provider}`)
  }
  return { ...config.scopeDescriptions }
}

/**
 * Validate that requested scopes are within allowed minimal set
 */
export function validateScopes(provider: keyof typeof OAuthSecurityConfig, requestedScopes: string[]): boolean {
  const config = OAuthSecurityConfig[provider]
  if (!config) {
    return false
  }
  
  // All requested scopes must be in the allowed minimal set
  return requestedScopes.every(scope => config.scopes.includes(scope))
}

/**
 * Security implications documentation for each provider
 */
export const SecurityImplications = {
  google: {
    dataAccess: 'Access only to files you select or create with this app',
    retention: 'Tokens stored securely with encryption, refresh tokens enable persistent access',
    revocation: 'Users can revoke access at https://myaccount.google.com/permissions',
    compliance: 'GDPR compliant, follows Google OAuth 2.0 security best practices'
  },
  
  microsoft: {
    dataAccess: 'Read-only access to OneDrive files and basic user profile',
    retention: 'Tokens stored securely with encryption, offline_access enables persistent access',
    revocation: 'Users can revoke access at https://account.microsoft.com/privacy/app-access',
    compliance: 'GDPR compliant, follows Microsoft identity platform security guidelines'
  }
} as const

/**
 * Get security implications for a provider
 */
export function getSecurityImplications(provider: keyof typeof SecurityImplications) {
  return SecurityImplications[provider]
}
