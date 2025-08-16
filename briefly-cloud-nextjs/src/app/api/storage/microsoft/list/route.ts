import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

async function listOneDriveFilesHandler(_request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const { data: token } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'microsoft')
    .single()

  if (!token?.access_token) return ApiResponse.badRequest('Microsoft account not connected')

  const resp = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!resp.ok) return ApiResponse.internalError('Failed to list OneDrive files')
  const data = await resp.json()

  const files = (data.value || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.file?.mimeType,
    webUrl: f.webUrl,
  }))

  return ApiResponse.success({ files })
}

export const GET = createProtectedApiHandler(listOneDriveFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



