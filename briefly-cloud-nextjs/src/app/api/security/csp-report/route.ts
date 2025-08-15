/**
 * CSP Violation Report Endpoint
 * 
 * This endpoint receives and processes Content Security Policy violation reports
 * to help monitor and improve security policies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/app/lib/logger'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { handleCSPViolation, type CSPViolationReport } from '@/app/lib/security/csp-nonce'

/**
 * POST /api/security/csp-report
 * 
 * Handle CSP violation reports
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type')
    
    // CSP reports are sent as application/csp-report or application/json
    if (!contentType?.includes('application/csp-report') && !contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Invalid content type' },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    const report = body['csp-report'] || body as CSPViolationReport
    
    // Validate report structure
    if (!report || typeof report !== 'object') {
      return NextResponse.json(
        { error: 'Invalid report format' },
        { status: 400 }
      )
    }
    
    // Extract relevant information
    const violationInfo = {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number'],
      scriptSample: report['script-sample'],
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    }
    
    // Log the violation
    logger.warn('CSP Violation Reported', violationInfo)
    
    // Handle the violation (logging, monitoring, etc.)
    handleCSPViolation(report)
    
    // Log to audit trail for security monitoring
    const auditLogger = getAuditLogger()
    await auditLogger.logSecurityEvent({
      action: 'CSP_VIOLATION',
      resourceType: 'security',
      severity: 'warning',
      metadata: violationInfo,
      ipAddress: violationInfo.ip,
      userAgent: violationInfo.userAgent
    })
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /eval\(/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /<script/i
    ]
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(report['blocked-uri'] || '') ||
      pattern.test(report['script-sample'] || '')
    )
    
    if (isSuspicious) {
      logger.error('Suspicious CSP Violation Detected', {
        ...violationInfo,
        severity: 'high',
        reason: 'Potential XSS attempt'
      })
      
      await auditLogger.logSecurityEvent({
        action: 'SUSPICIOUS_ACTIVITY',
        resourceType: 'security',
        severity: 'error',
        metadata: {
          ...violationInfo,
          reason: 'Potential XSS attempt via CSP violation'
        },
        ipAddress: violationInfo.ip,
        userAgent: violationInfo.userAgent
      })
    }
    
    // In production, you might want to:
    // 1. Send alerts for critical violations
    // 2. Update CSP policies based on legitimate violations
    // 3. Block IPs with repeated suspicious violations
    
    return NextResponse.json({ status: 'received' }, { status: 204 })
    
  } catch (error) {
    logger.error('Error processing CSP report', error as Error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/security/csp-report
 * 
 * Return CSP report configuration (for debugging)
 */
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 404 }
    )
  }
  
  return NextResponse.json({
    endpoint: '/api/security/csp-report',
    method: 'POST',
    contentType: 'application/csp-report',
    description: 'CSP violation report endpoint'
  })
}