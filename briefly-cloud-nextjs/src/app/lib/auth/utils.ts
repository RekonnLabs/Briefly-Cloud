import { DEFAULT_POST_LOGIN_PATH } from './constants'
import { logSecurityViolation, generateCorrelationId } from './security-logger'

/**
 * Clamp the next parameter to prevent open redirects
 * Only allows internal paths starting with /
 */
export function clampNext(next?: string, correlationId?: string): string {
  try {
    if (!next) return DEFAULT_POST_LOGIN_PATH
    
    // First check if it starts with / to avoid relative path issues
    if (!next.startsWith('/')) {
      // Log potential security violation
      if (correlationId) {
        logSecurityViolation(correlationId, 'open_redirect_attempt', {
          attemptedRedirect: next,
          reason: 'non_relative_path'
        })
      }
      return DEFAULT_POST_LOGIN_PATH
    }
    
    // Parse as URL to validate and extract components
    const u = new URL(next, 'http://x') // base avoids throwing
    
    if (u.origin === 'http://x' && u.pathname.startsWith('/')) {
      return u.pathname + u.search
    } else {
      // Log potential security violation
      if (correlationId) {
        logSecurityViolation(correlationId, 'open_redirect_attempt', {
          attemptedRedirect: next,
          reason: 'invalid_origin_or_path'
        })
      }
      return DEFAULT_POST_LOGIN_PATH
    }
  } catch (error) {
    // Log parsing error as potential security issue
    if (correlationId) {
      logSecurityViolation(correlationId, 'redirect_parsing_error', {
        attemptedRedirect: next,
        error: error instanceof Error ? error.message : 'unknown_error'
      })
    }
    return DEFAULT_POST_LOGIN_PATH
  }
}
