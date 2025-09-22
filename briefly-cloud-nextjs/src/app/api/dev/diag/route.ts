import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export async function GET() {
  const supabase = getSupabaseServerReadOnly()
  
  const [files, chunks, ingest, tokens] = await Promise.all([
    supabase.from('app.files').select('count', { count: 'exact', head: true }),
    supabase.from('app.document_chunks').select('count', { count: 'exact', head: true }),
    supabase.from('app.file_ingest').select('status').then(r => {
      const statusCounts = r.data?.reduce((acc: Record<string, number>, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1
        return acc
      }, {}) || {}
      return statusCounts
    }),
    supabase.from('app.oauth_tokens').select('provider').then(r => {
      const providers = r.data?.reduce((acc: Record<string, boolean>, row) => {
        acc[row.provider] = true
        return acc
      }, { google: false, microsoft: false }) || { google: false, microsoft: false }
      return providers
    })
  ])

  return Response.json({ 
    files: files.count || 0,
    chunks: chunks.count || 0, 
    ingest,
    providers: tokens
  })
}