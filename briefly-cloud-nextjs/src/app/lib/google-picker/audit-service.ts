/**
 * Google Picker Audit Service
 * 
 * Implements comprehensive audit logging for Google Picker file access events.
 * Ensures privacy compliance by logging metadata only (no file content).
 */

import { logger } from '@/app/lib/logger'

export interface FileSelectionEvent {
  eventType: 'file_selection_started' | 'file_selection_completed' | 'file_selection_cancelled' | 'file_selection_failed'
  userId: string
  sessionId: string
  tokenId?: string
  timestamp: string
  metadata: {
    pickerVersion?: string
    userAgent?: string
    ipAddress?: string // Anonymized/hashed for privacy
    connectionType?: 'google'
  }
}

export interface FileAccessEvent {
  eventType: 'file_accessed' | 'file_registered' | 'file_processing_queued'
  userId: string
  sessionId: string
  tokenId?: string
  timestamp: string
  fileMetadata: {
    fileId: string // Google Drive file ID
    fileName: string // File name only (no content)
    mimeType: string
    fileSize?: number
    source: 'google_picker'
  }
  securityContext: {
    scopeUsed: string
    permissionLevel: 'file_only' | 'drive_readonly' | 'drive_full'
    accessMethod: 'picker_selection'
  }
}

export interface SecurityEvent {
  eventType: 'token_generated' | 'token_expired' | 'token_revoked' | 'scope_validation_failed' | 'unauthorized_access_attempt'
  userId: string
  sessionId?: string
  tokenId?: string
  timestamp: string
  securityDetails: {
    tokenScope?: string
    tokenLifetime?: number
    failureReason?: string
    riskLevel: 'low' | 'medium' | 'high'
    actionTaken?: string
  }
}

export interface PrivacyEvent {
  eventType: 'data_access' | 'data_processing' | 'data_retention' | 'data_deletion'
  userId: string
  timestamp: string
  privacyDetails: {
    dataType: 'file_metadata' | 'user_selection' | 'access_token'
    processingPurpose: 'file_selection' | 'content_indexing' | 'user_experience'
    retentionPeriod?: string
    anonymized: boolean
  }
}

export type AuditEvent = FileSelectionEvent | FileAccessEvent | SecurityEvent | PrivacyEvent

/**
 * Audit logger with privacy-compliant logging
 */
class PickerAuditLogger {
  private readonly maxLogRetention = 90 * 24 * 60 * 60 * 1000 // 90 days in milliseconds
  private readonly sensitiveFields = ['accessToken', 'refreshToken', 'fileContent', 'personalData']

  /**
   * Log file selection events
   */
  logFileSelection(event: Omit<FileSelectionEvent, 'timestamp'>): void {
    const auditEvent: FileSelectionEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }

    // Sanitize metadata for privacy
    const sanitizedEvent = this.sanitizeEvent(auditEvent)

    logger.info('File selection audit event', {
      audit: true,
      category: 'file_selection',
      ...sanitizedEvent
    })

    // Log to separate audit trail if configured
    this.writeToAuditTrail(sanitizedEvent)
  }

  /**
   * Log file access events with security context
   */
  logFileAccess(event: Omit<FileAccessEvent, 'timestamp'>): void {
    const auditEvent: FileAccessEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }

    // Ensure no sensitive file content is logged
    const sanitizedEvent = this.sanitizeFileMetadata(auditEvent)

    logger.info('File access audit event', {
      audit: true,
      category: 'file_access',
      ...sanitizedEvent
    })

    this.writeToAuditTrail(sanitizedEvent)

    // Log privacy compliance event
    this.logPrivacyEvent({
      eventType: 'data_access',
      userId: event.userId,
      privacyDetails: {
        dataType: 'file_metadata',
        processingPurpose: 'file_selection',
        anonymized: true
      }
    })
  }

  /**
   * Log security events for monitoring and compliance
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const auditEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }

    const sanitizedEvent = this.sanitizeEvent(auditEvent)

    // Use appropriate log level based on risk
    const logLevel = event.securityDetails.riskLevel === 'high' ? 'error' : 
                    event.securityDetails.riskLevel === 'medium' ? 'warn' : 'info'

    logger[logLevel]('Security audit event', {
      audit: true,
      category: 'security',
      riskLevel: event.securityDetails.riskLevel,
      ...sanitizedEvent
    })

    this.writeToAuditTrail(sanitizedEvent)
  }

  /**
   * Log privacy compliance events
   */
  logPrivacyEvent(event: Omit<PrivacyEvent, 'timestamp'>): void {
    const auditEvent: PrivacyEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }

    logger.info('Privacy compliance audit event', {
      audit: true,
      category: 'privacy',
      ...auditEvent
    })

    this.writeToAuditTrail(auditEvent)
  }

  /**
   * Sanitize event data to remove sensitive information
   */
  private sanitizeEvent(event: AuditEvent): AuditEvent {
    const sanitized = JSON.parse(JSON.stringify(event))

    // Remove or hash sensitive fields
    this.removeSensitiveFields(sanitized)

    // Anonymize IP addresses if present
    if ('metadata' in sanitized && sanitized.metadata?.ipAddress) {
      sanitized.metadata.ipAddress = this.hashSensitiveData(sanitized.metadata.ipAddress)
    }

    return sanitized
  }

  /**
   * Sanitize file metadata to ensure no content is logged
   */
  private sanitizeFileMetadata(event: FileAccessEvent): FileAccessEvent {
    const sanitized = { ...event }

    // Ensure only metadata is logged, never file content
    sanitized.fileMetadata = {
      fileId: event.fileMetadata.fileId,
      fileName: event.fileMetadata.fileName.replace(/[^\w\-_\.]/, '_'), // Sanitize filename
      mimeType: event.fileMetadata.mimeType,
      fileSize: event.fileMetadata.fileSize,
      source: event.fileMetadata.source
    }

    return sanitized
  }

  /**
   * Remove sensitive fields from log data
   */
  private removeSensitiveFields(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return

    for (const key in obj) {
      if (this.sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]'
      } else if (typeof obj[key] === 'object') {
        this.removeSensitiveFields(obj[key])
      }
    }
  }

  /**
   * Hash sensitive data for privacy compliance
   */
  private hashSensitiveData(data: string): string {
    // Simple hash for demonstration - use proper crypto in production
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `hashed_${Math.abs(hash).toString(16)}`
  }

  /**
   * Write to dedicated audit trail (implement based on requirements)
   */
  private writeToAuditTrail(event: AuditEvent): void {
    // In production, this could write to:
    // - Dedicated audit database
    // - Secure log aggregation service
    // - Compliance monitoring system
    
    // For now, use structured logging with audit flag
    logger.info('Audit trail entry', {
      auditTrail: true,
      eventId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      retentionUntil: new Date(Date.now() + this.maxLogRetention).toISOString(),
      ...event
    })
  }

  /**
   * Generate audit report for compliance
   */
  generateAuditReport(userId: string, startDate: Date, endDate: Date): {
    summary: {
      totalEvents: number
      fileSelections: number
      fileAccesses: number
      securityEvents: number
      privacyEvents: number
    }
    complianceStatus: {
      dataRetention: 'compliant' | 'non_compliant'
      privacyProtection: 'compliant' | 'non_compliant'
      securityLogging: 'compliant' | 'non_compliant'
    }
  } {
    // This would query actual audit logs in production
    return {
      summary: {
        totalEvents: 0,
        fileSelections: 0,
        fileAccesses: 0,
        securityEvents: 0,
        privacyEvents: 0
      },
      complianceStatus: {
        dataRetention: 'compliant',
        privacyProtection: 'compliant',
        securityLogging: 'compliant'
      }
    }
  }
}

// Global audit logger instance
const auditLogger = new PickerAuditLogger()

/**
 * Log picker session start
 */
export function logPickerSessionStart(userId: string, sessionId: string, tokenId?: string, metadata?: any): void {
  auditLogger.logFileSelection({
    eventType: 'file_selection_started',
    userId,
    sessionId,
    tokenId,
    metadata: {
      pickerVersion: 'google_picker_api',
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
      connectionType: 'google'
    }
  })
}

/**
 * Log successful file selection
 */
export function logFileSelectionSuccess(
  userId: string, 
  sessionId: string, 
  selectedFiles: Array<{ fileId: string; fileName: string; mimeType: string; fileSize?: number }>,
  tokenId?: string
): void {
  // Log selection completion
  auditLogger.logFileSelection({
    eventType: 'file_selection_completed',
    userId,
    sessionId,
    tokenId,
    metadata: {
      filesSelected: selectedFiles.length,
      connectionType: 'google'
    }
  })

  // Log each file access
  selectedFiles.forEach(file => {
    auditLogger.logFileAccess({
      eventType: 'file_accessed',
      userId,
      sessionId,
      tokenId,
      fileMetadata: {
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        source: 'google_picker'
      },
      securityContext: {
        scopeUsed: 'https://www.googleapis.com/auth/drive.file',
        permissionLevel: 'file_only',
        accessMethod: 'picker_selection'
      }
    })
  })
}

/**
 * Log file selection cancellation
 */
export function logFileSelectionCancelled(userId: string, sessionId: string, tokenId?: string): void {
  auditLogger.logFileSelection({
    eventType: 'file_selection_cancelled',
    userId,
    sessionId,
    tokenId,
    metadata: {
      connectionType: 'google'
    }
  })
}

/**
 * Log file selection failure
 */
export function logFileSelectionFailure(
  userId: string, 
  sessionId: string, 
  error: string, 
  tokenId?: string
): void {
  auditLogger.logFileSelection({
    eventType: 'file_selection_failed',
    userId,
    sessionId,
    tokenId,
    metadata: {
      errorType: error,
      connectionType: 'google'
    }
  })
}

/**
 * Log file registration for processing
 */
export function logFileRegistration(
  userId: string,
  sessionId: string,
  files: Array<{ fileId: string; fileName: string; mimeType: string; status: string }>,
  tokenId?: string
): void {
  files.forEach(file => {
    auditLogger.logFileAccess({
      eventType: 'file_registered',
      userId,
      sessionId,
      tokenId,
      fileMetadata: {
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        source: 'google_picker'
      },
      securityContext: {
        scopeUsed: 'https://www.googleapis.com/auth/drive.file',
        permissionLevel: 'file_only',
        accessMethod: 'picker_selection'
      }
    })

    // Log processing queue event if file is supported
    if (file.status === 'pending') {
      auditLogger.logFileAccess({
        eventType: 'file_processing_queued',
        userId,
        sessionId,
        tokenId,
        fileMetadata: {
          fileId: file.fileId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          source: 'google_picker'
        },
        securityContext: {
          scopeUsed: 'https://www.googleapis.com/auth/drive.file',
          permissionLevel: 'file_only',
          accessMethod: 'picker_selection'
        }
      })
    }
  })
}

/**
 * Log token security events
 */
export function logTokenSecurityEvent(
  eventType: SecurityEvent['eventType'],
  userId: string,
  tokenId: string,
  details: Partial<SecurityEvent['securityDetails']>
): void {
  auditLogger.logSecurityEvent({
    eventType,
    userId,
    tokenId,
    securityDetails: {
      riskLevel: 'low',
      ...details
    }
  })
}

/**
 * Log scope validation failure
 */
export function logScopeValidationFailure(
  userId: string,
  tokenId: string,
  currentScope: string,
  requiredScope: string
): void {
  auditLogger.logSecurityEvent({
    eventType: 'scope_validation_failed',
    userId,
    tokenId,
    securityDetails: {
      tokenScope: currentScope,
      failureReason: `Missing required scope: ${requiredScope}`,
      riskLevel: 'high',
      actionTaken: 'token_rejected'
    }
  })
}

/**
 * Log unauthorized access attempt
 */
export function logUnauthorizedAccess(
  userId: string,
  attemptDetails: string,
  riskLevel: 'low' | 'medium' | 'high' = 'medium'
): void {
  auditLogger.logSecurityEvent({
    eventType: 'unauthorized_access_attempt',
    userId,
    securityDetails: {
      failureReason: attemptDetails,
      riskLevel,
      actionTaken: 'access_denied'
    }
  })
}

/**
 * Generate compliance audit report
 */
export function generateComplianceReport(userId: string, days: number = 30): ReturnType<PickerAuditLogger['generateAuditReport']> {
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000))
  
  return auditLogger.generateAuditReport(userId, startDate, endDate)
}

// Export audit logger for testing
export { auditLogger }
