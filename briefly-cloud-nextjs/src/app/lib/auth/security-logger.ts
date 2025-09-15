import { OAuthErrorCode, ErrorSeverity, ERROR_SEVERITY_MAP } from './constants'

/**
 * Generate a correlation ID for tracking OAuth flows
 */
export function generateCorrelationId(): string {
  return `oauth_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Extract IP address from request headers
 */
export function extractIpAddress(headers: Headers): string | undefined {
  // Check common headers for IP address (in order of preference)
  const ipHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip', // Cloudflare
    'x-client-ip',
    'x-cluster-client-ip'
  ]
  
  for (const header of ipHeaders) {
    const value = headers.get(header)
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      return value.split(',')[0].trim()
    }
  }
  
  return undefined
}

/**
 * Security event types for OAuth flows
 */
export const SECURITY_EVENT_TYPES = {
  OAUTH_START: 'oauth_start',
  OAUTH_CALLBACK: 'oauth_callback', 
  OAUTH_SUCCESS: 'oauth_success',
  OAUTH_ERROR: 'oauth_error',
  SESSION_CREATED: 'session_created',
  SESSION_FAILED: 'session_failed',
  REDIRECT_ATTEMPT: 'redirect_attempt',
  SECURITY_VIOLATION: 'security_violation'
} as const

export type SecurityEventType = typeof SECURITY_EVENT_TYPES[keyof typeof SECURITY_EVENT_TYPES]

/**
 * Security event data structure
 */
export interface SecurityEvent {
  correlationId: string
  eventType: SecurityEventType
  timestamp: string
  severity: ErrorSeverity
  provider?: string
  errorCode?: OAuthErrorCode
  errorMessage?: string
  userAgent?: string
  ipAddress?: string
  redirectUrl?: string
  metadata?: Record<string, any>
}

/**
 * Log OAuth security events with structured data
 */
export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp' | 'severity'> & { severity?: ErrorSeverity }) {
  const severity = event.severity || (event.errorCode ? ERROR_SEVERITY_MAP[event.errorCode] : 'medium')
  
  const securityEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    severity
  }

  // In production, this would go to a proper logging service
  // For now, we'll use structured console logging
  const logLevel = getLogLevel(severity)
  
  console[logLevel]('[OAUTH_SECURITY]', {
    ...securityEvent,
    // Sanitize sensitive data
    metadata: sanitizeMetadata(securityEvent.metadata)
  })
}

/**
 * Log OAuth start event
 */
export function logOAuthStart(correlationId: string, provider: string, redirectUrl: string, userAgent?: string) {
  logSecurityEvent({
    correlationId,
    eventType: SECURITY_EVENT_TYPES.OAUTH_START,
    provider,
    redirectUrl,
    userAgent,
    metadata: { action: 'oauth_initiation' }
  })
}

/**
 * Log OAuth callback event
 */
export function logOAuthCallback(correlationId: string, provider: string, success: boolean, errorCode?: OAuthErrorCode) {
  logSecurityEvent({
    correlationId,
    eventType: success ? SECURITY_EVENT_TYPES.OAUTH_SUCCESS : SECURITY_EVENT_TYPES.OAUTH_ERROR,
    provider,
    errorCode,
    metadata: { 
      action: 'oauth_callback',
      success,
      hasAuthCode: success
    }
  })
}

/**
 * Log session creation events
 */
export function logSessionEvent(correlationId: string, success: boolean, errorCode?: OAuthErrorCode) {
  logSecurityEvent({
    correlationId,
    eventType: success ? SECURITY_EVENT_TYPES.SESSION_CREATED : SECURITY_EVENT_TYPES.SESSION_FAILED,
    errorCode,
    metadata: {
      action: 'session_management',
      success
    }
  })
}

/**
 * Log security violations (e.g., open redirect attempts)
 */
export function logSecurityViolation(correlationId: string, violationType: string, details: Record<string, any>) {
  logSecurityEvent({
    correlationId,
    eventType: SECURITY_EVENT_TYPES.SECURITY_VIOLATION,
    severity: 'high',
    metadata: {
      violationType,
      ...sanitizeMetadata(details)
    }
  })
}

/**
 * Get appropriate console log level based on severity
 */
function getLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
  switch (severity) {
    case 'low':
      return 'log'
    case 'medium':
      return 'log'
    case 'high':
      return 'warn'
    case 'critical':
      return 'error'
    default:
      return 'log'
  }
}

/**
 * Sanitize metadata to prevent information leakage
 */
function sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata) return undefined
  
  const sanitized = { ...metadata }
  
  // Remove or mask sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization']
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]'
    }
  }
  
  // Truncate long strings to prevent log bloat
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + '...[TRUNCATED]'
    }
  }
  
  return sanitized
}
/**

 * Comprehensive audit trail for OAuth authentication attempts
 */
export function logOAuthAuditTrail(
  correlationId: string,
  eventType: 'attempt' | 'success' | 'failure',
  details: {
    provider: string
    userId?: string
    userEmail?: string
    ipAddress?: string
    userAgent?: string
    errorCode?: OAuthErrorCode
    errorMessage?: string
    redirectUrl?: string
    sessionDuration?: number
    metadata?: Record<string, any>
  }
) {
  const auditEvent = {
    correlationId,
    eventType: eventType === 'attempt' ? SECURITY_EVENT_TYPES.OAUTH_START :
               eventType === 'success' ? SECURITY_EVENT_TYPES.OAUTH_SUCCESS :
               SECURITY_EVENT_TYPES.OAUTH_ERROR,
    provider: details.provider,
    userAgent: details.userAgent,
    ipAddress: details.ipAddress,
    redirectUrl: details.redirectUrl,
    errorCode: details.errorCode,
    errorMessage: details.errorMessage,
    metadata: {
      auditTrail: true,
      userId: details.userId,
      userEmail: details.userEmail ? `${details.userEmail.substring(0, 3)}***@${details.userEmail.split('@')[1]}` : undefined,
      sessionDuration: details.sessionDuration,
      ...details.metadata
    }
  }

  logSecurityEvent(auditEvent)
}

/**
 * Log missing provider attempts (potential security probing)
 */
export function logMissingProviderAttempt(correlationId: string, ipAddress?: string, userAgent?: string) {
  logSecurityEvent({
    correlationId,
    eventType: SECURITY_EVENT_TYPES.SECURITY_VIOLATION,
    severity: 'medium',
    ipAddress,
    userAgent,
    metadata: {
      violationType: 'missing_provider_parameter',
      description: 'OAuth start attempted without provider parameter',
      potentialProbing: true
    }
  })
}

/**
 * Log OAuth exchange failures with detailed context
 */
export function logOAuthExchangeFailure(
  correlationId: string,
  provider: string,
  errorDetails: {
    hasCode: boolean
    supabaseError?: string
    ipAddress?: string
    userAgent?: string
  }
) {
  logSecurityEvent({
    correlationId,
    eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
    errorCode: OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED,
    provider,
    ipAddress: errorDetails.ipAddress,
    userAgent: errorDetails.userAgent,
    errorMessage: errorDetails.supabaseError,
    metadata: {
      hasAuthCode: errorDetails.hasCode,
      exchangeFailureReason: errorDetails.supabaseError,
      securityImplication: 'potential_token_manipulation'
    }
  })
}