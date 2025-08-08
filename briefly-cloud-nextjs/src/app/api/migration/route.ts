import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runMigration, validateMigrationData, MigrationConfig } from '@/app/lib/migration'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'

// Migration request schema
const MigrationRequestSchema = z.object({
  action: z.enum(['run', 'validate', 'status']),
  config: z.object({
    batchSize: z.number().min(1).max(1000).optional(),
    maxRetries: z.number().min(1).max(10).optional(),
    retryDelay: z.number().min(100).max(10000).optional(),
    validateData: z.boolean().optional(),
    createBackup: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
})

// Migration status cache
const migrationStatusCache = new Map<string, any>()

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      // Check authentication and admin privileges
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Only allow admin users to run migrations
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      if (!user?.is_admin) {
        return formatErrorResponse('Admin privileges required', 403)
      }

      const body = await request.json()
      const { action, config } = MigrationRequestSchema.parse(body)

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

      switch (action) {
        case 'run':
          return await handleMigrationRun(supabaseUrl, supabaseKey, config)
        
        case 'validate':
          return await handleMigrationValidate(supabaseUrl, supabaseKey)
        
        case 'status':
          return await handleMigrationStatus()
        
        default:
          return formatErrorResponse('Invalid action', 400)
      }

    } catch (error) {
      logger.error('Migration API error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}

async function handleMigrationRun(
  supabaseUrl: string, 
  supabaseKey: string, 
  config?: Partial<MigrationConfig>
) {
  try {
    logger.info('Starting migration', { config })
    
    const status = await runMigration(supabaseUrl, supabaseKey, config)
    
    // Cache the migration status
    migrationStatusCache.set(status.id, status)
    
    return NextResponse.json({
      success: true,
      data: status,
      message: 'Migration started successfully'
    })

  } catch (error) {
    logger.error('Migration run failed', { error })
    return formatErrorResponse('Migration failed', 500, error.message)
  }
}

async function handleMigrationValidate(supabaseUrl: string, supabaseKey: string) {
  try {
    logger.info('Starting migration validation')
    
    const validation = await validateMigrationData(supabaseUrl, supabaseKey)
    
    return NextResponse.json({
      success: true,
      data: validation,
      message: validation.valid ? 'Data validation passed' : 'Data validation failed'
    })

  } catch (error) {
    logger.error('Migration validation failed', { error })
    return formatErrorResponse('Validation failed', 500, error.message)
  }
}

async function handleMigrationStatus() {
  try {
    // Return all cached migration statuses
    const statuses = Array.from(migrationStatusCache.values())
    
    return NextResponse.json({
      success: true,
      data: {
        migrations: statuses,
        count: statuses.length
      }
    })

  } catch (error) {
    logger.error('Migration status check failed', { error })
    return formatErrorResponse('Status check failed', 500, error.message)
  }
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Get migration status
      const statuses = Array.from(migrationStatusCache.values())
      
      return NextResponse.json({
        success: true,
        data: {
          migrations: statuses,
          count: statuses.length,
          latest: statuses.length > 0 ? statuses[statuses.length - 1] : null
        }
      })

    } catch (error) {
      logger.error('Migration status API error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}
