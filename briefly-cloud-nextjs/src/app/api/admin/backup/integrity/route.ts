/**
 * Backup Integrity Verification API
 * 
 * Provides endpoints for verifying backup integrity and
 * running validation procedures.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withRateLimit } from '@/app/lib/usage/usage-middleware'
import { createError } from '@/app/lib/api-errors'
import { logger } from '@/app/lib/logger'
import { verifyBackupIntegrity } from '@/app/lib/backup/pitr-manager'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { z } from 'zod'

// Validation schemas
const IntegrityCheckSchema = z.object({
  backupId: z.string().uuid().optional()
})

/**
 * GET /api/admin/backup/integrity
 * Get backup integrity status for recent backups
 */
export async function GET(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        // Get recent backup validations
        const { data: validations, error } = await supabaseAdmin
          .from('private.backup_validations')
          .select(`
            *,
            backup_jobs:backup_id (
              id,
              backup_type,
              started_at,
              size,
              status
            )
          `)
          .order('validated_at', { ascending: false })
          .limit(10)

        if (error) {
          throw error
        }

        const integrityReport = {
          totalValidations: validations?.length || 0,
          validBackups: validations?.filter(v => v.is_valid).length || 0,
          invalidBackups: validations?.filter(v => !v.is_valid).length || 0,
          lastValidation: validations?.[0]?.validated_at || null,
          validations: validations?.map(validation => ({
            backupId: validation.backup_id,
            isValid: validation.is_valid,
            validatedAt: validation.validated_at,
            checks: {
              integrity: validation.integrity_check,
              completeness: validation.completeness_check,
              restoration: validation.restoration_check
            },
            issues: validation.issues || [],
            validationTime: validation.validation_time_ms,
            backup: validation.backup_jobs ? {
              type: validation.backup_jobs.backup_type,
              startedAt: validation.backup_jobs.started_at,
              size: validation.backup_jobs.size,
              status: validation.backup_jobs.status
            } : null
          })) || []
        }

        logger.info('Backup integrity report retrieved', {
          userId: user.id,
          totalValidations: integrityReport.totalValidations,
          validBackups: integrityReport.validBackups,
          invalidBackups: integrityReport.invalidBackups
        })

        return NextResponse.json({
          success: true,
          data: integrityReport
        })

      } catch (error) {
        logger.error('Failed to get backup integrity report', { userId: user.id }, error as Error)
        
        if (error instanceof Error && error.message.includes('database')) {
          return NextResponse.json(
            { error: 'Database error occurred' },
            { status: 500 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to get backup integrity report' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_integrity')
  })(request)
}

/**
 * POST /api/admin/backup/integrity
 * Verify backup integrity for a specific backup or latest backup
 */
export async function POST(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        const body = await request.json()
        
        // Validate request body
        const validationResult = IntegrityCheckSchema.safeParse(body)
        if (!validationResult.success) {
          return NextResponse.json(
            { 
              error: 'Invalid request',
              details: validationResult.error.errors
            },
            { status: 400 }
          )
        }

        const { backupId } = validationResult.data

        // Verify backup integrity
        const integrityResult = await verifyBackupIntegrity(backupId)

        logger.info('Backup integrity verification completed', {
          userId: user.id,
          backupId: backupId || 'latest',
          isValid: integrityResult.isValid,
          issues: integrityResult.issues
        })

        return NextResponse.json({
          success: true,
          message: 'Backup integrity verification completed',
          data: {
            backupId: backupId || 'latest',
            isValid: integrityResult.isValid,
            checks: integrityResult.checks,
            issues: integrityResult.issues,
            verifiedAt: new Date().toISOString()
          }
        })

      } catch (error) {
        logger.error('Failed to verify backup integrity', { userId: user.id }, error as Error)
        
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return NextResponse.json(
              { error: 'Backup not found' },
              { status: 404 }
            )
          }
          
          if (error.message.includes('database')) {
            return NextResponse.json(
              { error: 'Database error occurred' },
              { status: 500 }
            )
          }
        }

        return NextResponse.json(
          { error: 'Failed to verify backup integrity' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_verify')
  })(request)
}

/**
 * PUT /api/admin/backup/integrity
 * Run integrity verification on all recent backups
 */
export async function PUT(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        // Get recent completed backups that haven't been validated
        const { data: backups, error } = await supabaseAdmin
          .from('private.backup_jobs')
          .select('id, backup_type, started_at')
          .eq('status', 'completed')
          .not('id', 'in', `(
            SELECT backup_id 
            FROM private.backup_validations 
            WHERE validated_at > NOW() - INTERVAL '24 hours'
          )`)
          .order('started_at', { ascending: false })
          .limit(5)

        if (error) {
          throw error
        }

        const verificationResults = []
        let successCount = 0
        let failureCount = 0

        // Verify each backup
        for (const backup of backups || []) {
          try {
            const result = await verifyBackupIntegrity(backup.id)
            verificationResults.push({
              backupId: backup.id,
              backupType: backup.backup_type,
              startedAt: backup.started_at,
              isValid: result.isValid,
              issues: result.issues
            })

            if (result.isValid) {
              successCount++
            } else {
              failureCount++
            }
          } catch (verifyError) {
            logger.warn('Failed to verify backup', { backupId: backup.id }, verifyError as Error)
            verificationResults.push({
              backupId: backup.id,
              backupType: backup.backup_type,
              startedAt: backup.started_at,
              isValid: false,
              issues: [`Verification failed: ${(verifyError as Error).message}`]
            })
            failureCount++
          }
        }

        logger.info('Bulk backup integrity verification completed', {
          userId: user.id,
          totalBackups: verificationResults.length,
          successCount,
          failureCount
        })

        return NextResponse.json({
          success: true,
          message: 'Bulk integrity verification completed',
          data: {
            totalBackups: verificationResults.length,
            successCount,
            failureCount,
            results: verificationResults,
            verifiedAt: new Date().toISOString()
          }
        })

      } catch (error) {
        logger.error('Failed to perform bulk integrity verification', { userId: user.id }, error as Error)
        
        if (error instanceof Error && error.message.includes('database')) {
          return NextResponse.json(
            { error: 'Database error occurred' },
            { status: 500 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to perform bulk integrity verification' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_bulk_verify')
  })(request)
}