/**
 * Secure File Download API Route
 * 
 * This endpoint provides secure file downloads with proper access controls,
 * audit logging, and signed URL generation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withApiControls } from '@/app/lib/usage/usage-middleware'
import { getSecureStorage } from '@/app/lib/storage/secure-storage'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { logger } from '@/app/lib/logger'

interface RouteParams {
  params: {
    fileId: string
  }
}

/**
 * GET /api/files/[fileId]/download
 * 
 * Generate secure download URL for a file
 */
export const GET = withAuth(
  withApiControls(async (request: NextRequest, context, { params }: RouteParams) => {
    try {
      const { user } = context
      const { fileId } = params
      const { searchParams } = new URL(request.url)
      
      const expiresIn = Math.min(
        parseInt(searchParams.get('expiresIn') || '3600'), 
        86400 // Max 24 hours
      )
      const inline = searchParams.get('inline') === 'true'

      if (!fileId) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File ID required',
            message: 'Please provide a valid file ID'
          },
          { status: 400 }
        )
      }

      const secureStorage = getSecureStorage()
      const result = await secureStorage.getSignedUrl(
        fileId,
        user.id,
        expiresIn,
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown'
      )

      if (result.error) {
        const statusCode = result.error === 'Access denied' ? 403 : 
                          result.error === 'File not found' ? 404 : 500

        return NextResponse.json(
          { 
            success: false, 
            error: result.error,
            message: result.error === 'Access denied' 
              ? 'You do not have permission to access this file'
              : result.error
          },
          { status: statusCode }
        )
      }

      // Get file info for response
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('name, content_type, file_size')
        .eq('id', fileId)
        .single()

      const responseData = {
        success: true,
        data: {
          downloadUrl: result.url,
          expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          fileName: file?.name || 'download',
          contentType: file?.content_type || 'application/octet-stream',
          fileSize: file?.file_size || 0,
          inline
        }
      }

      // If inline viewing is requested, redirect directly
      if (inline && result.url) {
        return NextResponse.redirect(result.url)
      }

      return NextResponse.json(responseData)

    } catch (error) {
      logger.error('Failed to generate download URL', {
        userId: context.user.id,
        fileId: params.fileId,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to generate download URL',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * DELETE /api/files/[fileId]/download
 * 
 * Delete a file securely
 */
export const DELETE = withAuth(
  withApiControls(async (request: NextRequest, context, { params }: RouteParams) => {
    try {
      const { user } = context
      const { fileId } = params

      if (!fileId) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File ID required',
            message: 'Please provide a valid file ID'
          },
          { status: 400 }
        )
      }

      const secureStorage = getSecureStorage()
      const result = await secureStorage.deleteFile(
        fileId,
        user.id,
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown'
      )

      if (!result.success) {
        const statusCode = result.error === 'Access denied' ? 403 : 
                          result.error === 'File not found' ? 404 : 500

        return NextResponse.json(
          { 
            success: false, 
            error: result.error,
            message: result.error === 'Access denied' 
              ? 'You do not have permission to delete this file'
              : result.error
          },
          { status: statusCode }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'File deleted successfully',
        data: {
          fileId,
          deletedAt: new Date().toISOString()
        }
      })

    } catch (error) {
      logger.error('Failed to delete file', {
        userId: context.user.id,
        fileId: params.fileId,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to delete file',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)