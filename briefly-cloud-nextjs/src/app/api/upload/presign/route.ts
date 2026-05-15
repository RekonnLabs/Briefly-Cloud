/**
 * POST /api/upload/presign
 *
 * Spec 10 — Presigned Upload Flow (Step 1 of 2)
 *
 * Generates a Supabase Storage presigned upload URL so the browser can PUT
 * the file directly to Supabase, bypassing the Vercel 4.5 MB body limit.
 *
 * Request body (JSON):
 *   { fileName: string, mimeType: string, fileSize: number }
 *
 * Response (data):
 *   { signedUrl: string, storagePath: string, token: string }
 *
 * The browser then:
 *   1. PUT <signedUrl>  with the raw file body + Content-Type header
 *   2. POST /api/upload/process  with { storagePath, fileName, mimeType, fileSize }
 */

export const runtime = 'nodejs'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { checkUploadQuota, getUserLimits } from '@/app/lib/usage/quota-enforcement'
import { logReq, logErr } from '@/app/lib/server/log'
import { withPerformanceMonitoring } from '@/app/lib/stubs/performance'

// ─── Supported MIME types (mirrors /api/upload/route.ts) ─────────────────────
const SUPPORTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
}

// Tier-based per-file size limits (bytes) — mirrors /api/upload/route.ts
const TIER_MAX_FILE_SIZE: Record<string, number> = {
  free: 10 * 1024 * 1024,       // 10 MB
  pro: 50 * 1024 * 1024,        // 50 MB
  pro_byok: 100 * 1024 * 1024,  // 100 MB
}

const presignSchema = z.object({
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
})

async function presignHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  const rid = logReq({ route: '/api/upload/presign', method: 'POST', userId: user?.id })

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ApiResponse.badRequest('Invalid JSON payload')
  }

  const parsed = presignSchema.safeParse(body)
  if (!parsed.success) {
    return ApiResponse.badRequest('Invalid request: fileName, mimeType, and fileSize are required')
  }

  const { fileName, mimeType, fileSize } = parsed.data

  // ── Validate MIME type ────────────────────────────────────────────────────
  const ext = SUPPORTED_MIME_TYPES[mimeType]
  if (!ext) {
    return ApiResponse.badRequest(
      `Unsupported file type: ${mimeType}. Supported types: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`
    )
  }

  try {
    // ── Fetch quota + limits in parallel ─────────────────────────────────────
    const [quota, limits] = await Promise.all([
      checkUploadQuota(user.id, fileSize),
      getUserLimits(user.id),
    ])

    if (!quota.allowed) {
      return NextResponse.json(
        { success: false, error: quota.reason, code: 'QUOTA_EXCEEDED' },
        { status: 429 }
      )
    }

    // ── Per-file size limit (tier-based) ──────────────────────────────────────
    const tier = limits?.subscription_tier ?? 'free'
    const maxFileSize = TIER_MAX_FILE_SIZE[tier] ?? TIER_MAX_FILE_SIZE.free
    if (fileSize > maxFileSize) {
      return ApiResponse.badRequest(
        `File size ${(fileSize / 1024 / 1024).toFixed(1)} MB exceeds the ${(maxFileSize / 1024 / 1024).toFixed(0)} MB limit for your plan`
      )
    }

    // ── Generate unique storage path ──────────────────────────────────────────
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const storagePath = `${user.id}/${timestamp}_${randomId}.${ext}`

    // ── Create Supabase Storage presigned upload URL (service role) ───────────
    // supabase-js 2.x: storage.from(bucket).createSignedUploadUrl(path)
    // Returns { data: { signedUrl, token, path }, error }
    const { data: signedData, error: signError } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUploadUrl(storagePath)

    if (signError || !signedData) {
      logErr(rid, 'presign:createSignedUploadUrl', signError, { userId: user.id, storagePath })
      return ApiResponse.serverError('Failed to generate upload URL', 'PRESIGN_ERROR', rid)
    }

    console.log('[presign:ok]', {
      userId: user.id,
      storagePath,
      fileSize,
      mimeType,
      rid,
    })

    return ApiResponse.success({
      signedUrl: signedData.signedUrl,
      storagePath,
      token: signedData.token,
    })
  } catch (error) {
    logErr(rid, 'presign-handler', error, { userId: user?.id })
    return ApiResponse.serverError('Failed to generate presigned URL', 'PRESIGN_ERROR', rid)
  }
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(presignHandler, {
    rateLimit: rateLimitConfigs.upload,
    logging: { enabled: true, includeBody: false },
  })
)
