/**
 * Content Security Policy Nonce Generator
 * 
 * This module provides secure nonce generation for CSP headers
 * to allow specific inline scripts and styles while maintaining security.
 */

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'

/**
 * Generate a cryptographically secure nonce
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * Get or generate nonce for the current request
 */
export function getNonce(): string {
  const headersList = headers()
  const existingNonce = headersList.get('x-nonce')
  
  if (existingNonce) {
    return existingNonce
  }
  
  return generateNonce()
}

/**
 * Create CSP header with nonce
 */
export function createCSPWithNonce(directives: Record<string, string[]>, nonce: string): string {
  const processedDirectives = Object.entries(directives)
    .filter(([, values]) => values && values.length > 0)
    .map(([directive, values]) => {
      // Replace {NONCE} placeholder with actual nonce
      const processedValues = values.map(value => 
        value.replace('{NONCE}', nonce)
      )
      return `${directive} ${processedValues.join(' ')}`
    })
    .join('; ')
  
  return processedDirectives
}

/**
 * Middleware to inject nonce into CSP headers
 */
export function withCSPNonce<T extends (...args: any[]) => any>(handler: T): T {
  return (async (...args: any[]) => {
    const nonce = generateNonce()
    
    // Store nonce in request context (implementation depends on your setup)
    // This is a simplified version - in practice you'd use request context
    process.env.CURRENT_CSP_NONCE = nonce
    
    const result = await handler(...args)
    
    // Clean up
    delete process.env.CURRENT_CSP_NONCE
    
    return result
  }) as T
}

/**
 * Get current CSP nonce from context
 */
export function getCurrentNonce(): string {
  return process.env.CURRENT_CSP_NONCE || generateNonce()
}

/**
 * Helper to create script tag with nonce (for use in JSX components)
 */
export function createNonceScript(children: string, nonce?: string): string {
  const scriptNonce = nonce || getCurrentNonce()
  return `<script nonce="${scriptNonce}">${children}</script>`
}

/**
 * Helper to create style tag with nonce (for use in JSX components)
 */
export function createNonceStyle(children: string, nonce?: string): string {
  const styleNonce = nonce || getCurrentNonce()
  return `<style nonce="${styleNonce}">${children}</style>`
}

/**
 * Validate CSP nonce format
 */
export function isValidNonce(nonce: string): boolean {
  // Base64 format check
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  return base64Regex.test(nonce) && nonce.length >= 16
}

/**
 * CSP violation report handler
 */
export interface CSPViolationReport {
  'document-uri': string
  referrer: string
  'violated-directive': string
  'effective-directive': string
  'original-policy': string
  disposition: string
  'blocked-uri': string
  'line-number': number
  'column-number': number
  'source-file': string
  'status-code': number
  'script-sample': string
}

/**
 * Handle CSP violation reports
 */
export function handleCSPViolation(report: CSPViolationReport): void {
  // Log CSP violations for monitoring
  console.warn('CSP Violation:', {
    directive: report['violated-directive'],
    blockedUri: report['blocked-uri'],
    documentUri: report['document-uri'],
    sourceFile: report['source-file'],
    lineNumber: report['line-number'],
    scriptSample: report['script-sample']
  })
  
  // In production, you might want to send this to a monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Send to monitoring service (Sentry, DataDog, etc.)
    // monitoringService.reportCSPViolation(report)
  }
}

/**
 * Create CSP report endpoint URL
 */
export function getCSPReportEndpoint(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/api/security/csp-report`
}
