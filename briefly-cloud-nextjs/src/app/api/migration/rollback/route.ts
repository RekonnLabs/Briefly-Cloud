import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rollbackMigration } from '@/app/lib/migration'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'

// Rollback request schema
const RollbackRequestSchema = z.object({
  backupId: z.string().min(1),
  confirm: z.boolean().refine(val => val === true, {
    message: 'Must explicitly confirm rollback operation'
  }),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      // Check authentication and admin privileges
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Only allow admin users to run rollbacks
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      if (!user?.is_admin) {
        return formatErrorResponse('Admin privileges required', 403)
      }

      const body = await request.json()
      const { backupId, confirm } = RollbackRequestSchema.parse(body)

      if (!confirm) {
        return formatErrorResponse('Rollback must be explicitly confirmed', 400)
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

      logger.warn('Starting migration rollback', { backupId, userId: session.user.id })
      
      const success = await rollbackMigration(supabaseUrl, supabaseKey, backupId)
      
      if (success) {
        logger.info('Migration rollback completed successfully', { backupId })
        return NextResponse.json({
          success: true,
          data: { backupId },
          message: 'Migration rollback completed successfully'
        })
      } else {
        logger.error('Migration rollback failed', { backupId })
        return formatErrorResponse('Migration rollback failed', 500)
      }

    } catch (error) {
      logger.error('Migration rollback API error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Get available backups from cache
      const { cacheManager } = await import('@/app/lib/cache')
      const availableBackups: string[] = []
      
      // This is a simplified approach - in production you'd want to store backup metadata
      // in a database table for better management
      const cacheKeys = Array.from(cacheManager['cache'].keys())
      for (const key of cacheKeys) {
        if (key.startsWith('backup:')) {
          const backupId = key.replace('backup:', '')
          availableBackups.push(backupId)
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          availableBackups,
          count: availableBackups.length
        }
      })

    } catch (error) {
      logger.error('Migration rollback status API error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}
