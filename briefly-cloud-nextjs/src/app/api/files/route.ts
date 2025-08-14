/**
 * File Management API Route
 * 
 * This endpoint provides file listing, metadata management,
 * and storage usage information.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withApiControls } from '@/app/lib/usage/usage-middleware'
import { getSecureStorage, type StorageBucket } from '@/app/lib/storage/secure-storage'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/files
 * 
 * List user's files with pagination and filtering
 */
export const GET = withAuth(
  withApiControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      const { searchParams } = new URL(request.url)
      
      const bucket = searchParams.get('bucket') as StorageBucket | undefined
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
      const offset = parseInt(searchParams.get('offset') || '0')
      const includeUsage = searchParams.get('includeUsage') === 'true'

      const secureStorage = getSecureStorage()
      
      // Get files list
      const filesResult = await secureStorage.listUserFiles(user.id, bucket, limit, offset)
      
      // Get storage usage if requested
      let storageUsage = null
      if (includeUsage) {
        storageUsage = await secureStorage.getUserStorageUsage(user.id)
      }

      return NextResponse.json({
        success: true,
        data: {
          files: filesResult.files.map(file => ({
            id: file.id,
            name: file.name,
            bucket: file.bucket,
            size: file.size,
            sizeFormatted: formatFileSize(file.size),
            contentType: file.contentType,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
            metadata: file.metadata
          })),
          pagination: {
            total: filesResult.totalCount,
            limit,
            offset,
            hasMore: filesResult.hasMore
          },
          storageUsage: storageUsage ? {
            totalFiles: storageUsage.totalFiles,
            totalSizeBytes: storageUsage.totalSizeBytes,
            totalSizeFormatted: formatFileSize(storageUsage.totalSizeBytes),
            bucketBreakdown: Object.entries(storageUsage.bucketBreakdown).reduce((acc, [bucket, stats]) => {
              acc[bucket] = {
                fileCount: stats.fileCount,
                totalSize: stats.totalSize,
                totalSizeFormatted: formatFileSize(stats.totalSize),
                avgSize: stats.avgSize,
                avgSizeFormatted: formatFileSize(stats.avgSize)
              }
              return acc
            }, {} as Record<string, any>)
          } : undefined
        }
      })

    } catch (error) {
      logger.error('Failed to list files', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to list files',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * POST /api/files/batch-delete
 * 
 * Delete multiple files in batch
 */
export const POST = withAuth(
  withApiControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      const body = await request.json()
      const { fileIds } = body

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid file IDs',
            message: 'Please provide an array of file IDs'
          },
          { status: 400 }
        )
      }

      if (fileIds.length > 50) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Too many files',
            message: 'Maximum 50 files can be deleted at once'
          },
          { status: 400 }
        )
      }

      const secureStorage = getSecureStorage()
      const results = []
      let successCount = 0
      let errorCount = 0

      // Process deletions
      for (const fileId of fileIds) {
        try {
          const result = await secureStorage.deleteFile(
            fileId,
            user.id,
            request.headers.get('x-forwarded-for') || 'unknown',
            request.headers.get('user-agent') || 'unknown'
          )

          if (result.success) {
            successCount++
            results.push({ fileId, success: true })
          } else {
            errorCount++
            results.push({ fileId, success: false, error: result.error })
          }
        } catch (error) {
          errorCount++
          results.push({ 
            fileId, 
            success: false, 
            error: (error as Error).message 
          })
        }
      }

      return NextResponse.json({
        success: successCount > 0,
        message: `${successCount} files deleted successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        data: {
          results,
          summary: {
            total: fileIds.length,
            successful: successCount,
            failed: errorCount
          }
        }
      })

    } catch (error) {
      logger.error('Failed to batch delete files', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to delete files',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * Format file size for human readability
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}