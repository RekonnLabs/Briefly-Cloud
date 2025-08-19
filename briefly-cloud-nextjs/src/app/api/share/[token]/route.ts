/**
 * Public File Share Access API Route
 * 
 * This endpoint provides public access to shared files with
 * proper validation, access tracking, and security controls.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { logger } from '@/app/lib/logger'

interface RouteParams {
  params: {
    token: string
  }
}

/**
 * GET /api/share/[token]
 * 
 * Access a shared file via public token
 */
export const GET = async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { token } = params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'info' // info, download, view

    if (!token || token.length !== 32) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid share token',
          message: 'The share link is invalid or malformed'
        },
        { status: 400 }
      )
    }

    // Get share info with file details
    const { data: share, error: shareError } = await supabaseAdmin
      .from('file_shares')
      .select(`
        *,
        file:app.files(
          id,
          name,
          file_path,
          file_size,
          content_type,
          bucket,
          user_id
        )
      `)
      .eq('share_token', token)
      .single()

    if (shareError || !share || !share.file) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Share not found',
          message: 'The share link is invalid or has been removed'
        },
        { status: 404 }
      )
    }

    // Check if share has expired
    if (new Date(share.expires_at) < new Date()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Share expired',
          message: 'This share link has expired'
        },
        { status: 410 }
      )
    }

    // Check access limits
    if (share.max_access && share.access_count >= share.max_access) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Access limit exceeded',
          message: 'This share link has reached its access limit'
        },
        { status: 429 }
      )
    }

    // Check permissions
    const permissions = share.permissions || { canView: true, canDownload: true }
    
    if (action === 'download' && !permissions.canDownload) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Download not allowed',
          message: 'Download is not permitted for this share'
        },
        { status: 403 }
      )
    }

    if (action === 'view' && !permissions.canView) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'View not allowed',
          message: 'Viewing is not permitted for this share'
        },
        { status: 403 }
      )
    }

    // Get client info for logging
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Handle different actions
    if (action === 'download' || action === 'view') {
      // Generate signed URL for file access
      const expiresIn = 3600 // 1 hour
      const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
        .from(share.file.bucket)
        .createSignedUrl(share.file.file_path, expiresIn)

      if (urlError || !signedUrlData) {
        throw new Error('Failed to generate access URL')
      }

      // Update access count and last accessed time
      await supabaseAdmin
        .from('file_shares')
        .update({
          access_count: share.access_count + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq('id', share.id)

      // Log access
      await getAuditLogger().logAction({
        userId: share.file.user_id, // Log against file owner
        action: 'DOCUMENT_ACCESSED',
        resourceType: 'document',
        resourceId: share.file.id,
        metadata: {
          accessType: 'public_share',
          shareToken: token,
          action,
          fileName: share.file.name,
          accessCount: share.access_count + 1,
          publicAccess: true
        },
        severity: 'info',
        ipAddress,
        userAgent
      })

      if (action === 'download') {
        // Return download URL
        return NextResponse.json({
          success: true,
          data: {
            downloadUrl: signedUrlData.signedUrl,
            fileName: share.file.name,
            fileSize: share.file.file_size,
            contentType: share.file.content_type,
            expiresIn
          }
        })
      } else {
        // Redirect to view URL
        return NextResponse.redirect(signedUrlData.signedUrl)
      }
    }

    // Default action: return share info
    return NextResponse.json({
      success: true,
      data: {
        shareInfo: {
          token,
          expiresAt: share.expires_at,
          accessCount: share.access_count,
          maxAccess: share.max_access,
          permissions,
          description: share.description
        },
        file: {
          name: share.file.name,
          size: share.file.file_size,
          sizeFormatted: formatFileSize(share.file.file_size),
          contentType: share.file.content_type,
          isImage: share.file.content_type?.startsWith('image/'),
          isPdf: share.file.content_type === 'application/pdf',
          isDocument: [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'text/markdown'
          ].includes(share.file.content_type || '')
        },
        actions: {
          canView: permissions.canView,
          canDownload: permissions.canDownload,
          viewUrl: permissions.canView ? `/api/share/${token}?action=view` : null,
          downloadUrl: permissions.canDownload ? `/api/share/${token}?action=download` : null
        }
      }
    })

  } catch (error) {
    logger.error('Failed to access shared file', {
      token: params.token,
      error: (error as Error).message
    })

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to access shared file',
        message: 'Please try again later'
      },
      { status: 500 }
    )
  }
}

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