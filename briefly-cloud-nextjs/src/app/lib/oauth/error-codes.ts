/**
 * OAuth Error Code Standardization
 * 
 * Defines standardized error codes, user-friendly messages, and error categorization
 * for consistent OAuth error handling across all providers and flows.
 */

/**
 * Standardized OAuth error codes
 */
export const OAuthErrorCodes = {
  // Client errors (4xx) - User or client-side issues
  MISSING_CODE: 'missing_code',
  STATE_MISMATCH: 'state_mismatch', 
  AUTH_FAILED: 'auth_failed',
  INVALID_PROVIDER: 'invalid_provider',
  USER_CANCELLED: 'user_cancelled',
  ACCESS_DENIED: 'access_denied',
  INVALID_REQUEST: 'invalid_request',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  INVALID_SCOPE: 'invalid_scope',
  
  // Server errors (5xx) - System or provider issues
  TOKEN_EXCHANGE_FAILED: 'token_exchange_failed',
  TOKEN_STORAGE_FAILED: 'token_storage_failed',
  PROVIDER_ERROR: 'provider_error',
  NETWORK_ERROR: 'network_error',
  UNEXPECTED_ERROR: 'unexpected_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  RATE_LIMITED: 'rate_limited',
  
  // Security errors - High severity security events
  CSRF_ATTACK_DETECTED: 'csrf_attack_detected',
  INVALID_STATE_PARAMETER: 'invalid_state_parameter',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity'
} as const

export type OAuthErrorCode = typeof OAuthErrorCodes[keyof typeof OAuthErrorCodes]

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  CLIENT_ERROR = 'client_error',      // 4xx - User/client issues
  SERVER_ERROR = 'server_error',      // 5xx - System issues  
  SECURITY_ERROR = 'security_error',  // Security violations
  PROVIDER_ERROR = 'provider_error'   // OAuth provider issues
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM', 
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * User-friendly error messages mapping
 */
export const OAuthErrorMessages: Record<OAuthErrorCode, string> = {
  // Client errors
  [OAuthErrorCodes.MISSING_CODE]: 'OAuth authorization was cancelled or failed. Please try again.',
  [OAuthErrorCodes.STATE_MISMATCH]: 'Security verification failed. Please try connecting again.',
  [OAuthErrorCodes.AUTH_FAILED]: 'Authentication failed. Please sign in again and retry.',
  [OAuthErrorCodes.INVALID_PROVIDER]: 'Invalid storage provider. Please contact support.',
  [OAuthErrorCodes.USER_CANCELLED]: 'Authorization was cancelled. You can try connecting again anytime.',
  [OAuthErrorCodes.ACCESS_DENIED]: 'Access was denied by the provider. Please grant the required permissions.',
  [OAuthErrorCodes.INVALID_REQUEST]: 'Invalid authorization request. Please try again.',
  [OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE]: 'Unsupported authorization type. Please contact support.',
  [OAuthErrorCodes.INVALID_SCOPE]: 'Invalid permissions requested. Please contact support.',
  
  // Server errors
  [OAuthErrorCodes.TOKEN_EXCHANGE_FAILED]: 'Failed to complete authorization. Please try again.',
  [OAuthErrorCodes.TOKEN_STORAGE_FAILED]: 'Failed to save connection. Please try again.',
  [OAuthErrorCodes.PROVIDER_ERROR]: 'The storage provider is experiencing issues. Please try again later.',
  [OAuthErrorCodes.NETWORK_ERROR]: 'Network connection failed. Please check your internet and try again.',
  [OAuthErrorCodes.UNEXPECTED_ERROR]: 'An unexpected error occurred. Please try again.',
  [OAuthErrorCodes.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
  [OAuthErrorCodes.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
  
  // Security errors
  [OAuthErrorCodes.CSRF_ATTACK_DETECTED]: 'Security verification failed. Please try again.',
  [OAuthErrorCodes.INVALID_STATE_PARAMETER]: 'Invalid security parameter. Please try again.',
  [OAuthErrorCodes.SUSPICIOUS_ACTIVITY]: 'Suspicious activity detected. Please contact support.'
}

/**
 * Error categorization mapping
 */
export const OAuthErrorCategories: Record<OAuthErrorCode, ErrorCategory> = {
  // Client errors
  [OAuthErrorCodes.MISSING_CODE]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.STATE_MISMATCH]: ErrorCategory.SECURITY_ERROR,
  [OAuthErrorCodes.AUTH_FAILED]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.INVALID_PROVIDER]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.USER_CANCELLED]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.ACCESS_DENIED]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.INVALID_REQUEST]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE]: ErrorCategory.CLIENT_ERROR,
  [OAuthErrorCodes.INVALID_SCOPE]: ErrorCategory.CLIENT_ERROR,
  
  // Server errors
  [OAuthErrorCodes.TOKEN_EXCHANGE_FAILED]: ErrorCategory.SERVER_ERROR,
  [OAuthErrorCodes.TOKEN_STORAGE_FAILED]: ErrorCategory.SERVER_ERROR,
  [OAuthErrorCodes.PROVIDER_ERROR]: ErrorCategory.PROVIDER_ERROR,
  [OAuthErrorCodes.NETWORK_ERROR]: ErrorCategory.SERVER_ERROR,
  [OAuthErrorCodes.UNEXPECTED_ERROR]: ErrorCategory.SERVER_ERROR,
  [OAuthErrorCodes.SERVICE_UNAVAILABLE]: ErrorCategory.SERVER_ERROR,
  [OAuthErrorCodes.RATE_LIMITED]: ErrorCategory.SERVER_ERROR,
  
  // Security errors
  [OAuthErrorCodes.CSRF_ATTACK_DETECTED]: ErrorCategory.SECURITY_ERROR,
  [OAuthErrorCodes.INVALID_STATE_PARAMETER]: ErrorCategory.SECURITY_ERROR,
  [OAuthErrorCodes.SUSPICIOUS_ACTIVITY]: ErrorCategory.SECURITY_ERROR
}

/**
 * Error severity mapping
 */
export const OAuthErrorSeverities: Record<OAuthErrorCode, ErrorSeverity> = {
  // Client errors - typically low to medium severity
  [OAuthErrorCodes.MISSING_CODE]: ErrorSeverity.LOW,
  [OAuthErrorCodes.STATE_MISMATCH]: ErrorSeverity.HIGH,
  [OAuthErrorCodes.AUTH_FAILED]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.INVALID_PROVIDER]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.USER_CANCELLED]: ErrorSeverity.LOW,
  [OAuthErrorCodes.ACCESS_DENIED]: ErrorSeverity.LOW,
  [OAuthErrorCodes.INVALID_REQUEST]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.INVALID_SCOPE]: ErrorSeverity.MEDIUM,
  
  // Server errors - medium to high severity
  [OAuthErrorCodes.TOKEN_EXCHANGE_FAILED]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.TOKEN_STORAGE_FAILED]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.PROVIDER_ERROR]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.NETWORK_ERROR]: ErrorSeverity.LOW,
  [OAuthErrorCodes.UNEXPECTED_ERROR]: ErrorSeverity.HIGH,
  [OAuthErrorCodes.SERVICE_UNAVAILABLE]: ErrorSeverity.MEDIUM,
  [OAuthErrorCodes.RATE_LIMITED]: ErrorSeverity.LOW,
  
  // Security errors - high to critical severity
  [OAuthErrorCodes.CSRF_ATTACK_DETECTED]: ErrorSeverity.CRITICAL,
  [OAuthErrorCodes.INVALID_STATE_PARAMETER]: ErrorSeverity.HIGH,
  [OAuthErrorCodes.SUSPICIOUS_ACTIVITY]: ErrorSeverity.CRITICAL
}

/**
 * Utility functions for error handling
 */
export class OAuthErrorHandler {
  /**
   * Get user-friendly error message for an error code
   */
  static getMessage(errorCode: OAuthErrorCode): string {
    return OAuthErrorMessages[errorCode] || OAuthErrorMessages[OAuthErrorCodes.UNEXPECTED_ERROR]
  }

  /**
   * Get error category for an error code
   */
  static getCategory(errorCode: OAuthErrorCode): ErrorCategory {
    return OAuthErrorCategories[errorCode] || ErrorCategory.SERVER_ERROR
  }

  /**
   * Get error severity for an error code
   */
  static getSeverity(errorCode: OAuthErrorCode): ErrorSeverity {
    return OAuthErrorSeverities[errorCode] || ErrorSeverity.MEDIUM
  }

  /**
   * Check if error is a client error (4xx)
   */
  static isClientError(errorCode: OAuthErrorCode): boolean {
    return this.getCategory(errorCode) === ErrorCategory.CLIENT_ERROR
  }

  /**
   * Check if error is a server error (5xx)
   */
  static isServerError(errorCode: OAuthErrorCode): boolean {
    return this.getCategory(errorCode) === ErrorCategory.SERVER_ERROR
  }

  /**
   * Check if error is a security error
   */
  static isSecurityError(errorCode: OAuthErrorCode): boolean {
    return this.getCategory(errorCode) === ErrorCategory.SECURITY_ERROR
  }

  /**
   * Check if error should be retried
   */
  static isRetryable(errorCode: OAuthErrorCode): boolean {
    const retryableErrors: OAuthErrorCode[] = [
      OAuthErrorCodes.NETWORK_ERROR,
      OAuthErrorCodes.SERVICE_UNAVAILABLE,
      OAuthErrorCodes.PROVIDER_ERROR,
      OAuthErrorCodes.TOKEN_EXCHANGE_FAILED
    ]
    return retryableErrors.includes(errorCode)
  }

  /**
   * Map provider error to standardized error code
   */
  static mapProviderError(providerError: string): OAuthErrorCode {
    const errorMappings: Record<string, OAuthErrorCode> = {
      'access_denied': OAuthErrorCodes.ACCESS_DENIED,
      'invalid_request': OAuthErrorCodes.INVALID_REQUEST,
      'invalid_grant': OAuthErrorCodes.TOKEN_EXCHANGE_FAILED,
      'invalid_scope': OAuthErrorCodes.INVALID_SCOPE,
      'unsupported_response_type': OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
      'server_error': OAuthErrorCodes.PROVIDER_ERROR,
      'temporarily_unavailable': OAuthErrorCodes.SERVICE_UNAVAILABLE
    }

    return errorMappings[providerError] || OAuthErrorCodes.PROVIDER_ERROR
  }
}