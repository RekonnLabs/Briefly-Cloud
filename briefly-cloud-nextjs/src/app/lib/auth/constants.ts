/**
 * Authentication constants and error codes
 */

// Default path after successful login
export const DEFAULT_POST_LOGIN_PATH = '/briefly/app/dashboard'

// Standardized OAuth error codes
export const OAUTH_ERROR_CODES = {
  // Provider-related errors
  MISSING_PROVIDER: 'missing_provider',
  INVALID_PROVIDER: 'invalid_provider',
  
  // OAuth flow errors
  OAUTH_START_FAILED: 'oauth_start_failed',
  OAUTH_CALLBACK_FAILED: 'oauth_callback_failed',
  CODE_EXCHANGE_FAILED: 'code_exchange_failed',
  MISSING_AUTH_CODE: 'missing_auth_code',
  
  // Session and token errors
  SESSION_CREATION_FAILED: 'session_creation_failed',
  TOKEN_REFRESH_FAILED: 'token_refresh_failed',
  
  // Network and configuration errors
  NETWORK_ERROR: 'network_error',
  CONFIG_ERROR: 'config_error',
  
  // Generic fallback
  UNKNOWN_ERROR: 'unknown_error'
} as const

export type OAuthErrorCode = typeof OAUTH_ERROR_CODES[keyof typeof OAUTH_ERROR_CODES]

// User-friendly error messages
export const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  [OAUTH_ERROR_CODES.MISSING_PROVIDER]: 'Please select a sign-in provider to continue.',
  [OAUTH_ERROR_CODES.INVALID_PROVIDER]: 'The selected sign-in provider is not supported.',
  [OAUTH_ERROR_CODES.OAUTH_START_FAILED]: 'Failed to start the sign-in process. Please try again.',
  [OAUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED]: 'Sign-in was interrupted. Please try signing in again.',
  [OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED]: 'Failed to complete sign-in. Please try again.',
  [OAUTH_ERROR_CODES.MISSING_AUTH_CODE]: 'Sign-in was incomplete. Please try again.',
  [OAUTH_ERROR_CODES.SESSION_CREATION_FAILED]: 'Failed to create your session. Please try again.',
  [OAUTH_ERROR_CODES.TOKEN_REFRESH_FAILED]: 'Your session has expired. Please sign in again.',
  [OAUTH_ERROR_CODES.NETWORK_ERROR]: 'Network connection issue. Please check your connection and try again.',
  [OAUTH_ERROR_CODES.CONFIG_ERROR]: 'Authentication service is temporarily unavailable. Please try again later.',
  [OAUTH_ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
}

// Error severity levels for logging
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium', 
  HIGH: 'high',
  CRITICAL: 'critical'
} as const

export type ErrorSeverity = typeof ERROR_SEVERITY[keyof typeof ERROR_SEVERITY]

// Map error codes to severity levels
export const ERROR_SEVERITY_MAP: Record<OAuthErrorCode, ErrorSeverity> = {
  [OAUTH_ERROR_CODES.MISSING_PROVIDER]: ERROR_SEVERITY.LOW,
  [OAUTH_ERROR_CODES.INVALID_PROVIDER]: ERROR_SEVERITY.MEDIUM,
  [OAUTH_ERROR_CODES.OAUTH_START_FAILED]: ERROR_SEVERITY.MEDIUM,
  [OAUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED]: ERROR_SEVERITY.MEDIUM,
  [OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED]: ERROR_SEVERITY.HIGH,
  [OAUTH_ERROR_CODES.MISSING_AUTH_CODE]: ERROR_SEVERITY.MEDIUM,
  [OAUTH_ERROR_CODES.SESSION_CREATION_FAILED]: ERROR_SEVERITY.HIGH,
  [OAUTH_ERROR_CODES.TOKEN_REFRESH_FAILED]: ERROR_SEVERITY.MEDIUM,
  [OAUTH_ERROR_CODES.NETWORK_ERROR]: ERROR_SEVERITY.LOW,
  [OAUTH_ERROR_CODES.CONFIG_ERROR]: ERROR_SEVERITY.CRITICAL,
  [OAUTH_ERROR_CODES.UNKNOWN_ERROR]: ERROR_SEVERITY.HIGH
}