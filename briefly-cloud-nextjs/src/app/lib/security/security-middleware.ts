/**
 * Security Middleware
 * 
 * This middleware provides real-time security monitoring and threat detection
 * for all API requests, integrating with the audit logging and monitoring systems.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSecurityMonitor, type AnomalyDetectionResult } from './security-monitor'
import { getAuditLogger } from '@/app/lib/stubs/audit/audit-logger'
import { logger } from '@/app/lib/logger'
import type { AuthContext } from '@/app/lib/auth/auth-middleware'

export interface SecurityMiddlewareConfig {
  enableAnomalyDetection?: boolean
  enableThreatDetection?: boolean
  blockSuspiciousIPs?: boolean
  logAllRequests?: boolean
  requireSecureHeaders?: boolean
  enableRealTimeMonitoring?: boolean
}

export interface SecurityContext extends AuthContext {
  securityAnalysis?: AnomalyDetectionResult
  threatLevel: 'low' | 'medium' | 'high' | 'critical'
  ipAddress: string
  userAgent: string
  requestFingerprint: string
}

/**
 * Security monitoring middleware
 */
export function withSecurityMonitoring(
  config: SecurityMiddlewareConfig = {},
  handler: (request: NextRequest, context: SecurityContext) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: AuthContext): Promise<NextResponse> => {
    const startTime = Date.now()
    const securityMonitor = getSecurityMonitor()
    const auditLogger = getAuditLogger()

    try {
      // Extract request metadata
      const ipAddress = getClientIP(request)
      const userAgent = request.headers.get('user-agent') || 'unknown'
      const requestFingerprint = generateRequestFingerprint(request)

      // Initialize security context
      const securityContext: SecurityContext = {
        ...context,
        threatLevel: 'low',
        ipAddress,
        userAgent,
        requestFingerprint
      }

      // Check for suspicious IPs if enabled
      if (config.blockSuspiciousIPs) {
        const suspiciousIPs = await securityMonitor.monitorSuspiciousIPs()
        if (suspiciousIPs.includes(ipAddress)) {
          await auditLogger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            'error',
            'Request from suspicious IP blocked',
            context.user?.id,
            { blockedIP: ipAddress, endpoint: request.url },
            ipAddress,
            userAgent
          )

          return NextResponse.json(
            { 
              success: false, 
              error: 'Access denied',
              message: 'Your request has been blocked for security reasons'
            },
            { status: 403 }
          )
        }
      }

      // Perform anomaly detection for authenticated users
      if (config.enableAnomalyDetection && context.user) {
        const currentAction = extractActionFromRequest(request)
        const metadata = {
          ipAddress,
          userAgent,
          endpoint: request.url,
          method: request.method
        }

        const anomalyResult = await securityMonitor.analyzeUserBehavior(
          context.user.id,
          currentAction,
          metadata
        )

        securityContext.securityAnalysis = anomalyResult
        securityContext.threatLevel = mapRiskScoreToThreatLevel(anomalyResult.riskScore)

        // Handle high-risk requests
        if (anomalyResult.isAnomalous && anomalyResult.recommendedAction === 'block') {
          await auditLogger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            'critical',
            'Anomalous behavior detected and blocked',
            context.user.id,
            {
              anomalyResult,
              endpoint: request.url,
              method: request.method
            },
            ipAddress,
            userAgent
          )

          return NextResponse.json(
            {
              success: false,
              error: 'Suspicious activity detected',
              message: 'Your request has been blocked for security reasons. Please contact support if you believe this is an error.'
            },
            { status: 403 }
          )
        }

        // Log alerts for investigation
        if (anomalyResult.isAnomalous && anomalyResult.recommendedAction === 'alert') {
          await auditLogger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            'warning',
            'Anomalous behavior detected - monitoring',
            context.user.id,
            {
              anomalyResult,
              endpoint: request.url,
              method: request.method
            },
            ipAddress,
            userAgent
          )
        }
      }

      // Check for data exfiltration attempts
      if (config.enableThreatDetection && context.user) {
        const isExfiltrationAttempt = await securityMonitor.detectDataExfiltration(context.user.id)
        if (isExfiltrationAttempt) {
          securityContext.threatLevel = 'critical'
          
          await auditLogger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            'critical',
            'Potential data exfiltration detected',
            context.user.id,
            {
              endpoint: request.url,
              method: request.method,
              detectionType: 'data_exfiltration'
            },
            ipAddress,
            userAgent
          )
        }
      }

      // Validate security headers if required
      if (config.requireSecureHeaders) {
        const headerValidation = validateSecurityHeaders(request)
        if (!headerValidation.valid) {
          await auditLogger.logSecurityEvent(
            'SECURITY_VIOLATION',
            'warning',
            'Missing or invalid security headers',
            context.user?.id,
            {
              missingHeaders: headerValidation.missingHeaders,
              endpoint: request.url
            },
            ipAddress,
            userAgent
          )

          return NextResponse.json(
            {
              success: false,
              error: 'Security headers required',
              message: 'Request must include proper security headers'
            },
            { status: 400 }
          )
        }
      }

      // Execute the handler
      const response = await handler(request, securityContext)

      // Log successful request if enabled
      if (config.logAllRequests) {
        await auditLogger.logAction({
          userId: context.user?.id,
          action: 'API_CALL',
          resourceType: 'api',
          metadata: {
            endpoint: request.url,
            method: request.method,
            statusCode: response.status,
            processingTime: Date.now() - startTime,
            threatLevel: securityContext.threatLevel,
            anomalyDetected: securityContext.securityAnalysis?.isAnomalous || false
          },
          severity: 'info',
          ipAddress,
          userAgent
        })
      }

      // Add security headers to response
      addSecurityHeaders(response)

      return response

    } catch (error) {
      // Log security middleware errors
      logger.error('Security middleware error', {
        url: request.url,
        method: request.method,
        userId: context.user?.id,
        error: (error as Error).message
      })

      // Don't block requests due to security middleware errors
      // Execute handler with basic security context
      const fallbackContext: SecurityContext = {
        ...context,
        threatLevel: 'low',
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestFingerprint: generateRequestFingerprint(request)
      }

      return handler(request, fallbackContext)
    }
  }
}

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  if (realIP) {
    return realIP
  }

  if (cfConnectingIP) {
    return cfConnectingIP
  }

  return 'unknown'
}

/**
 * Generate a unique fingerprint for the request
 */
function generateRequestFingerprint(request: NextRequest): string {
  const components = [
    request.headers.get('user-agent') || '',
    request.headers.get('accept-language') || '',
    request.headers.get('accept-encoding') || '',
    getClientIP(request)
  ]

  return Buffer.from(components.join('|')).toString('base64').substring(0, 16)
}

/**
 * Extract action from request for anomaly detection
 */
function extractActionFromRequest(request: NextRequest): string {
  const url = new URL(request.url)
  const path = url.pathname

  // Map common endpoints to actions
  if (path.includes('/chat')) return 'CHAT_MESSAGE'
  if (path.includes('/upload')) return 'DOCUMENT_UPLOAD'
  if (path.includes('/search')) return 'SEARCH_PERFORMED'
  if (path.includes('/download') || path.includes('/export')) return 'DATA_EXPORT'
  if (path.includes('/admin')) return 'ADMIN_ACCESS'

  return 'API_CALL'
}

/**
 * Map risk score to threat level
 */
function mapRiskScoreToThreatLevel(riskScore: number): SecurityContext['threatLevel'] {
  if (riskScore >= 80) return 'critical'
  if (riskScore >= 60) return 'high'
  if (riskScore >= 30) return 'medium'
  return 'low'
}

/**
 * Validate security headers
 */
function validateSecurityHeaders(request: NextRequest): {
  valid: boolean
  missingHeaders: string[]
} {
  const requiredHeaders = [
    'x-requested-with',
    'origin',
    'referer'
  ]

  const missingHeaders = requiredHeaders.filter(header => 
    !request.headers.get(header)
  )

  return {
    valid: missingHeaders.length === 0,
    missingHeaders
  }
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): void {
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // Add custom security headers
  response.headers.set('X-Security-Scan', 'passed')
  response.headers.set('X-Request-ID', `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
}

/**
 * Convenience middleware creators
 */

/**
 * High-security middleware for admin endpoints
 */
export function withHighSecurity(
  handler: (request: NextRequest, context: SecurityContext) => Promise<NextResponse>
) {
  return withSecurityMonitoring({
    enableAnomalyDetection: true,
    enableThreatDetection: true,
    blockSuspiciousIPs: true,
    logAllRequests: true,
    requireSecureHeaders: true,
    enableRealTimeMonitoring: true
  }, handler)
}

/**
 * Standard security middleware for regular endpoints
 */
export function withStandardSecurity(
  handler: (request: NextRequest, context: SecurityContext) => Promise<NextResponse>
) {
  return withSecurityMonitoring({
    enableAnomalyDetection: true,
    enableThreatDetection: false,
    blockSuspiciousIPs: true,
    logAllRequests: false,
    requireSecureHeaders: false,
    enableRealTimeMonitoring: true
  }, handler)
}

/**
 * Basic security middleware for public endpoints
 */
export function withBasicSecurity(
  handler: (request: NextRequest, context: SecurityContext) => Promise<NextResponse>
) {
  return withSecurityMonitoring({
    enableAnomalyDetection: false,
    enableThreatDetection: false,
    blockSuspiciousIPs: true,
    logAllRequests: false,
    requireSecureHeaders: false,
    enableRealTimeMonitoring: false
  }, handler)
}
