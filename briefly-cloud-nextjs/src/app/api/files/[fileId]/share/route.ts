/**
 * File Sharing API Route
 * 
 * This endpoint provides secure file sharing capabilities with
 * time-limited access, permission controls, and audit logging.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withApiControls } from '@/app/lib/usage/usage-middleware'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

interface RouteParams {
  params: {
    fileId: string
  }
}

export interface FileShare {
  id: string
  fileId: string
  sharedBy: string
  shareToken: string
  expiresAt: string
  accessCount: number
  maxAccess?: number
  permissions: {
    canDownload: boolean
    canView: boolean
  }
  createdAt: string
  lastAccessedAt?: string
}

/**
 * POST /api/files/[fileId]/share
 * 
 * Create a secure share link for a file
 */
export const POST = withAuth(
  withApiControls(async (request: NextRequest, context, { params }: RouteParams) => {
    try {
      const { user } = context
      const { fileId } = params
      const body = await request.json()
      
      const {
        expiresIn = 86400, // 24 hours default
        maxAccess = null,
        canDownload = true,
        canView = true,
        description = ''
      } = body

      // Validate expiration (max 30 days)
      const maxExpiresIn = 30 * 24 * 60 * 60 // 30 days
      if (expiresIn > maxExpiresIn) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid expiration',
            message: 'Maximum expiration is 30 days'
          },
          { status: 400 }
        )
      }

      // Verify file ownership
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (fileError || !file) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File not found',
            message: 'File not found or access denied'
          },
          { status: 404 }
        )
      }

      // Generate secure share token
      const shareToken = generateSecureToken()
      const expiresAt = new Date(Date.now() + expiresIn * 1000)

      // Create share record
      const { data: share, error: shareError } = await supabaseAdmin
        .from('file_shares')
        .insert({
          file_id: fileId,
          shared_by: user.id,
          share_token: shareToken,
          expires_at: expiresAt.toISOString(),
          max_access: maxAccess,
          permissions: {
            canDownload,
            canView
          },
          description,
          access_count: 0
        })
        .select()
        .single()

      if (shareError) {
        throw shareError
      }

      // Log share creation
      await getAuditLogger().logAction({
        userId: user.id,
        action: 'DOCUMENT_ACCESSED',
        resourceType: 'document',
        resourceId: fileId,
        metadata: {
          action: 'file_shared',
          fileName: file.name,
          shareToken,
          expiresAt: expiresAt.toISOString(),
          maxAccess,
          permissions: { canDownload, canView }
        },
        severity: 'info',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      })

      // Generate share URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const shareUrl = `${baseUrl}/share/${shareToken}`

      return NextResponse.json({
        success: true,
        message: 'Share link created successfully',
        data: {
          shareId: share.id,
          shareToken,
          shareUrl,
          expiresAt: expiresAt.toISOString(),
          expiresIn,
          maxAccess,
          permissions: { canDownload, canView },
          file: {
            id: file.id,
            name: file.name,
            size: file.file_size,
            contentType: file.content_type
          }
        }
      })

    } catch (error) {
      logger.error('Failed to create file share', {
        userId: context.user.id,
        fileId: params.fileId,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to create share link',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * GET /api/files/[fileId]/share
 * 
 * List active shares for a file
 */
export const GET = withAuth(
  withApiControls(async (request: NextRequest, context, { params }: RouteParams) => {
    try {
      const { user } = context
      const { fileId } = params

      // Verify file ownership
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('id, name')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (fileError || !file) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File not found',
            message: 'File not found or access denied'
          },
          { status: 404 }
        )
      }

      // Get active shares
      const { data: shares, error: sharesError } = await supabaseAdmin
        .from('file_shares')
        .select('*')
        .eq('file_id', fileId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (sharesError) {
        throw sharesError
      }

      const formattedShares = (shares || []).map(share => ({
        id: share.id,
        shareToken: share.share_token,
        shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${share.share_token}`,
        expiresAt: share.expires_at,
        accessCount: share.access_count,
        maxAccess: share.max_access,
        permissions: share.permissions,
        description: share.description,
        createdAt: share.created_at,
        lastAccessedAt: share.last_accessed_at,
        isExpired: new Date(share.expires_at) < new Date(),
        isMaxedOut: share.max_access && share.access_count >= share.max_access
      }))

      return NextResponse.json({
        success: true,
        data: {
          file: {
            id: file.id,
            name: file.name
          },
          shares: formattedShares,
          totalShares: formattedShares.length,
          activeShares: formattedShares.filter(s => !s.isExpired && !s.isMaxedOut).length
        }
      })

    } catch (error) {
      logger.error('Failed to list file shares', {
        userId: context.user.id,
        fileId: params.fileId,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to list shares',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * DELETE /api/files/[fileId]/share
 * 
 * Revoke file shares
 */
export const DELETE = withAuth(
  withApiControls(async (request: NextRequest, context, { params }: RouteParams) => {
    try {
      const { user } = context
      const { fileId } = params
      const { searchParams } = new URL(request.url)
      const shareId = searchParams.get('shareId')

      // Verify file ownership
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('id, name')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (fileError || !file) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File not found',
            message: 'File not found or access denied'
          },
          { status: 404 }
        )
      }

      let query = supabaseAdmin
        .from('file_shares')
        .delete()
        .eq('file_id', fileId)

      if (shareId) {
        // Revoke specific share
        query = query.eq('id', shareId)
      }

      const { error: deleteError, count } = await query

      if (deleteError) {
        throw deleteError
      }

      // Log share revocation
      await getAuditLogger().logAction({
        userId: user.id,
        action: 'DOCUMENT_ACCESSED',
        resourceType: 'document',
        resourceId: fileId,
        metadata: {
          action: 'shares_revoked',
          fileName: file.name,
          shareId: shareId || 'all',
          revokedCount: count || 0
        },
        severity: 'info',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      })

      return NextResponse.json({
        success: true,
        message: shareId 
          ? 'Share link revoked successfully'
          : `${count || 0} share links revoked successfully`,
        data: {
          revokedCount: count || 0,
          shareId: shareId || null
        }
      })

    } catch (error) {
      logger.error('Failed to revoke file shares', {
        userId: context.user.id,
        fileId: params.fileId,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to revoke shares',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * Generate a secure random token for sharing
 */
function generateSecureToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  return result
}