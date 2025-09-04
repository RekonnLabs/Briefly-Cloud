/**
 * Google Picker Permission Validation Service
 * 
 * Implements minimal permission validation to ensure picker only accesses
 * selected files and validates OAuth scope usage matches drive.file requirements.
 */

import { logger } from '@/app/lib/logger'
import { logScopeValidationFailure, logUnauthorizedAccess } from './audit-service'

export interface PermissionValidationResult {
  isValid: boolean
  violations: PermissionViolation[]
  riskLevel: 'low' | 'medium' | 'high'
  actionRequired: string[]
}

export interface PermissionViolation {
  type: 'scope_too_broad' | 'scope_missing' | 'unauthorized_access' | 'file_access_violation'
  severity: 'low' | 'medium' | 'high'
  description: string
  currentValue?: string
  expectedValue?: string
  recommendation: string
}

export interface FileAccessContext {
  userId: string
  tokenId?: string
  requestedFiles: string[] // Google Drive file IDs
  tokenScope: string
  accessMethod: 'picker_selection' | 'direct_api' | 'batch_operation'
}

/**
 * Required OAuth scopes for minimal permissions
 */
export const REQUIRED_SCOPES = {
  MINIMAL: 'https://www.googleapis.com/auth/drive.file',
  ACCEPTABLE: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
  ],
  EXCESSIVE: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.appdata'
  ]
} as const

/**
 * Validate OAuth scope permissions for minimal access
 */
export function validateOAuthScope(
  tokenScope: string,
  userId: string,
  tokenId?: string
): PermissionValidationResult {
  const violations: PermissionViolation[] = []
  const scopes = tokenScope.split(' ').map(s => s.trim()).filter(Boolean)
  
  // Check if minimal required scope is present
  const hasMinimalScope = scopes.includes(REQUIRED_SCOPES.MINIMAL)
  
  if (!hasMinimalScope) {
    const hasAcceptableScope = REQUIRED_SCOPES.ACCEPTABLE.some(scope => scopes.includes(scope))
    
    if (!hasAcceptableScope) {
      violations.push({
        type: 'scope_missing',
        severity: 'high',
        description: 'Token does not have required drive.file scope',
        currentValue: tokenScope,
        expectedValue: REQUIRED_SCOPES.MINIMAL,
        recommendation: 'Re-authenticate with drive.file scope'
      })

      // Log security violation
      if (tokenId) {
        logScopeValidationFailure(userId, tokenId, tokenScope, REQUIRED_SCOPES.MINIMAL)
      }
    }
  }

  // Check for excessive permissions
  const excessiveScopes = scopes.filter(scope => REQUIRED_SCOPES.EXCESSIVE.includes(scope as any))
  
  if (excessiveScopes.length > 0) {
    violations.push({
      type: 'scope_too_broad',
      severity: 'medium',
      description: 'Token has broader permissions than necessary',
      currentValue: excessiveScopes.join(', '),
      expectedValue: REQUIRED_SCOPES.MINIMAL,
      recommendation: 'Consider re-authenticating with minimal drive.file scope for better security'
    })

    logger.warn('Token has excessive permissions', {
      userId,
      tokenId,
      currentScopes: scopes,
      excessiveScopes,
      recommendedScope: REQUIRED_SCOPES.MINIMAL
    })
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  const actionRequired: string[] = []

  if (violations.some(v => v.severity === 'high')) {
    riskLevel = 'high'
    actionRequired.push('immediate_reauth_required')
  } else if (violations.some(v => v.severity === 'medium')) {
    riskLevel = 'medium'
    actionRequired.push('recommend_scope_reduction')
  }

  const result: PermissionValidationResult = {
    isValid: violations.filter(v => v.severity === 'high').length === 0,
    violations,
    riskLevel,
    actionRequired
  }

  // Log validation result
  logger.info('OAuth scope validation completed', {
    userId,
    tokenId,
    isValid: result.isValid,
    riskLevel: result.riskLevel,
    violationCount: violations.length,
    scopes
  })

  return result
}

/**
 * Validate file access permissions for picker operations
 */
export function validateFileAccess(context: FileAccessContext): PermissionValidationResult {
  const violations: PermissionViolation[] = []
  
  // First validate OAuth scope
  const scopeValidation = validateOAuthScope(context.tokenScope, context.userId, context.tokenId)
  violations.push(...scopeValidation.violations)

  // Validate access method is appropriate
  if (context.accessMethod !== 'picker_selection') {
    violations.push({
      type: 'unauthorized_access',
      severity: 'high',
      description: 'File access not through picker selection',
      currentValue: context.accessMethod,
      expectedValue: 'picker_selection',
      recommendation: 'Only access files through Google Picker interface'
    })

    logUnauthorizedAccess(
      context.userId,
      `Attempted ${context.accessMethod} access instead of picker_selection`,
      'high'
    )
  }

  // Validate file access is limited to selected files only
  if (context.requestedFiles.length === 0) {
    violations.push({
      type: 'file_access_violation',
      severity: 'medium',
      description: 'No specific files requested for access',
      recommendation: 'Always specify exact files to access'
    })
  }

  // Check for excessive file access patterns
  if (context.requestedFiles.length > 100) {
    violations.push({
      type: 'file_access_violation',
      severity: 'medium',
      description: 'Requesting access to unusually large number of files',
      currentValue: context.requestedFiles.length.toString(),
      expectedValue: '< 50 files per request',
      recommendation: 'Break large file operations into smaller batches'
    })

    logger.warn('Large file access request detected', {
      userId: context.userId,
      tokenId: context.tokenId,
      fileCount: context.requestedFiles.length,
      accessMethod: context.accessMethod
    })
  }

  // Determine overall risk level
  let riskLevel: 'low' | 'medium' | 'high' = scopeValidation.riskLevel
  const actionRequired: string[] = [...scopeValidation.actionRequired]

  const highSeverityViolations = violations.filter(v => v.severity === 'high')
  const mediumSeverityViolations = violations.filter(v => v.severity === 'medium')

  if (highSeverityViolations.length > 0) {
    riskLevel = 'high'
    actionRequired.push('block_access')
  } else if (mediumSeverityViolations.length > 0 && riskLevel === 'low') {
    riskLevel = 'medium'
    actionRequired.push('monitor_access')
  }

  const result: PermissionValidationResult = {
    isValid: highSeverityViolations.length === 0,
    violations,
    riskLevel,
    actionRequired
  }

  // Log file access validation
  logger.info('File access validation completed', {
    userId: context.userId,
    tokenId: context.tokenId,
    isValid: result.isValid,
    riskLevel: result.riskLevel,
    fileCount: context.requestedFiles.length,
    accessMethod: context.accessMethod,
    violationCount: violations.length
  })

  return result
}

/**
 * Validate picker configuration for security compliance
 */
export function validatePickerConfiguration(config: {
  userId: string
  tokenScope: string
  pickerViews: string[]
  allowedMimeTypes?: string[]
  tokenId?: string
}): PermissionValidationResult {
  const violations: PermissionViolation[] = []

  // Validate OAuth scope
  const scopeValidation = validateOAuthScope(config.tokenScope, config.userId, config.tokenId)
  violations.push(...scopeValidation.violations)

  // Validate picker views are appropriate
  const allowedViews = ['DOCS', 'SPREADSHEETS', 'PRESENTATIONS', 'PDFS']
  const unauthorizedViews = config.pickerViews.filter(view => !allowedViews.includes(view))

  if (unauthorizedViews.length > 0) {
    violations.push({
      type: 'unauthorized_access',
      severity: 'medium',
      description: 'Picker configured with unauthorized views',
      currentValue: unauthorizedViews.join(', '),
      expectedValue: allowedViews.join(', '),
      recommendation: 'Only use document-related picker views'
    })
  }

  // Validate MIME type restrictions if specified
  if (config.allowedMimeTypes && config.allowedMimeTypes.length > 0) {
    const safeMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/csv'
    ]

    const unsafeMimeTypes = config.allowedMimeTypes.filter(type => !safeMimeTypes.includes(type))
    
    if (unsafeMimeTypes.length > 0) {
      violations.push({
        type: 'file_access_violation',
        severity: 'low',
        description: 'Picker allows potentially unsafe file types',
        currentValue: unsafeMimeTypes.join(', '),
        recommendation: 'Restrict to document file types only'
      })
    }
  }

  const result: PermissionValidationResult = {
    isValid: violations.filter(v => v.severity === 'high').length === 0,
    violations,
    riskLevel: scopeValidation.riskLevel,
    actionRequired: scopeValidation.actionRequired
  }

  logger.info('Picker configuration validation completed', {
    userId: config.userId,
    tokenId: config.tokenId,
    isValid: result.isValid,
    riskLevel: result.riskLevel,
    pickerViews: config.pickerViews,
    violationCount: violations.length
  })

  return result
}

/**
 * Generate permission compliance report
 */
export function generatePermissionComplianceReport(userId: string): {
  overallCompliance: 'compliant' | 'partial' | 'non_compliant'
  scopeCompliance: boolean
  fileAccessCompliance: boolean
  recommendations: string[]
  lastValidated: string
} {
  // This would analyze historical validation data in production
  return {
    overallCompliance: 'compliant',
    scopeCompliance: true,
    fileAccessCompliance: true,
    recommendations: [
      'Continue using minimal drive.file scope',
      'Maintain file access through picker selection only',
      'Regular permission audits recommended'
    ],
    lastValidated: new Date().toISOString()
  }
}

/**
 * Check if token scope meets minimal permission requirements
 */
export function hasMinimalPermissions(tokenScope: string): boolean {
  const scopes = tokenScope.split(' ').map(s => s.trim()).filter(Boolean)
  return scopes.includes(REQUIRED_SCOPES.MINIMAL) || 
         REQUIRED_SCOPES.ACCEPTABLE.some(scope => scopes.includes(scope))
}

/**
 * Get recommended scope for minimal permissions
 */
export function getRecommendedScope(): string {
  return REQUIRED_SCOPES.MINIMAL
}

/**
 * Validate file registration permissions
 */
export function validateFileRegistrationPermissions(
  userId: string,
  files: Array<{ id: string; name: string; mimeType: string }>,
  tokenScope: string,
  tokenId?: string
): PermissionValidationResult {
  const context: FileAccessContext = {
    userId,
    tokenId,
    requestedFiles: files.map(f => f.id),
    tokenScope,
    accessMethod: 'picker_selection'
  }

  const validation = validateFileAccess(context)

  // Additional validation for file registration
  const violations = [...validation.violations]

  // Check for suspicious file patterns
  const executableMimeTypes = [
    'application/x-executable',
    'application/x-msdownload',
    'application/x-msdos-program'
  ]

  const suspiciousFiles = files.filter(file => 
    executableMimeTypes.includes(file.mimeType) ||
    file.name.match(/\.(exe|bat|cmd|scr|com|pif)$/i)
  )

  if (suspiciousFiles.length > 0) {
    violations.push({
      type: 'file_access_violation',
      severity: 'high',
      description: 'Attempting to register executable or suspicious files',
      currentValue: suspiciousFiles.map(f => f.name).join(', '),
      recommendation: 'Only register document files for processing'
    })

    logUnauthorizedAccess(
      userId,
      `Attempted to register suspicious files: ${suspiciousFiles.map(f => f.name).join(', ')}`,
      'high'
    )
  }

  return {
    ...validation,
    violations,
    isValid: violations.filter(v => v.severity === 'high').length === 0
  }
}