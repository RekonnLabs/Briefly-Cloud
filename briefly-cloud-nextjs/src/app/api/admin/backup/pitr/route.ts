/**
 * PITR (Point-in-Time Recovery) Management API
 * 
 * Provides endpoints for configuring and managing Supabase PITR
 * and automated backup systems.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withRateLimit } from '@/app/lib/usage/usage-middleware'
import { createError } from '@/app/lib/api-errors'
import { logger } from '@/app/lib/logger'
import { getPITRManager, enablePITR, getPITRStatus, createDailyBackupConfig } from '@/app/lib/backup/pitr-manager'
import { z } from 'zod'

// Validation schemas
const PITRConfigSchema = z.object({
  enabled: z.boolean(),
  retentionDays: z.number().min(1).max(365),
  backupWindow: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  alertingEnabled: z.boolean(),
  alertContacts: z.array(z.string().email()),
  monitoringInterval: z.number().min(5).max(1440) // 5 minutes to 24 hours
})

const DailyBackupConfigSchema = z.object({
  retentionDays: z.number().min(1).max(365).optional(),
  backupWindow: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional()
})

/**
 * GET /api/admin/backup/pitr
 * Get current PITR status and configuration
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

        // Get PITR status
        const status = await getPITRStatus()

        logger.info('PITR status retrieved', {
          userId: user.id,
          status: status.status,
          lastBackup: status.lastBackupTime
        })

        return NextResponse.json({
          success: true,
          data: status
        })

      } catch (error) {
        logger.error('Failed to get PITR status', { userId: user.id }, error as Error)
        
        if (error instanceof Error && error.message.includes('database')) {
          return NextResponse.json(
            { error: 'Database error occurred' },
            { status: 500 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to get PITR status' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_pitr_status')
  })(request)
}

/**
 * POST /api/admin/backup/pitr
 * Configure PITR settings
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
        const validationResult = PITRConfigSchema.safeParse(body)
        if (!validationResult.success) {
          return NextResponse.json(
            { 
              error: 'Invalid configuration',
              details: validationResult.error.errors
            },
            { status: 400 }
          )
        }

        const config = validationResult.data

        // Enable PITR with configuration
        await enablePITR(config, user.id)

        logger.info('PITR configuration updated', {
          userId: user.id,
          enabled: config.enabled,
          retentionDays: config.retentionDays,
          backupWindow: config.backupWindow,
          alertingEnabled: config.alertingEnabled
        })

        return NextResponse.json({
          success: true,
          message: 'PITR configuration updated successfully',
          data: {
            enabled: config.enabled,
            retentionDays: config.retentionDays,
            backupWindow: config.backupWindow,
            alertingEnabled: config.alertingEnabled
          }
        })

      } catch (error) {
        logger.error('Failed to configure PITR', { userId: user.id }, error as Error)
        
        if (error instanceof Error) {
          if (error.message.includes('Invalid')) {
            return NextResponse.json(
              { error: error.message },
              { status: 400 }
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
          { error: 'Failed to configure PITR' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_pitr_config')
  })(request)
}

/**
 * PUT /api/admin/backup/pitr
 * Create daily backup configuration
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

        const body = await request.json()
        
        // Validate request body
        const validationResult = DailyBackupConfigSchema.safeParse(body)
        if (!validationResult.success) {
          return NextResponse.json(
            { 
              error: 'Invalid backup configuration',
              details: validationResult.error.errors
            },
            { status: 400 }
          )
        }

        const { retentionDays, backupWindow } = validationResult.data

        // Create daily backup configuration
        const configId = await createDailyBackupConfig(retentionDays, backupWindow)

        logger.info('Daily backup configuration created', {
          userId: user.id,
          configId,
          retentionDays: retentionDays || 30,
          backupWindow: backupWindow || '02:00'
        })

        return NextResponse.json({
          success: true,
          message: 'Daily backup configuration created successfully',
          data: {
            configId,
            retentionDays: retentionDays || 30,
            backupWindow: backupWindow || '02:00'
          }
        })

      } catch (error) {
        logger.error('Failed to create daily backup config', { userId: user.id }, error as Error)
        
        if (error instanceof Error) {
          if (error.message.includes('Invalid')) {
            return NextResponse.json(
              { error: error.message },
              { status: 400 }
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
          { error: 'Failed to create daily backup configuration' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_config')
  })(request)
}