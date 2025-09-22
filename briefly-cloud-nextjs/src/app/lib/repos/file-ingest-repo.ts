import { supabaseAdmin } from '@/app/lib/supabase-admin'
import config from '@/app/lib/config'
import { createError } from '@/app/lib/api-errors'

export type FileIngestStatus = 'pending' | 'processing' | 'ready' | 'error' | 'unsupported'

export interface FileIngestRecord {
  file_id: string
  owner_id: string
  status: FileIngestStatus
  source: string | null
  error_msg: string | null
  page_count: number | null
  lang: string | null
  meta: Record<string, unknown> | null
  updated_at: string
}

const useAppSchema = config.features.ragAppSchema ?? true

const INGEST_TABLE = useAppSchema ? 'app.file_ingest' : 'file_ingest'

const columnMap = useAppSchema
  ? {
      fileId: 'file_id',
      ownerId: 'owner_id',
      status: 'status',
      source: 'source',
      error: 'error_msg',
      pageCount: 'page_count',
      lang: 'lang',
      meta: 'meta',
      updatedAt: 'updated_at',
    } as const
  : {
      fileId: 'file_id',
      ownerId: 'user_id',
      status: 'status',
      source: 'source',
      error: 'error_message',
      pageCount: 'page_count',
      lang: 'language',
      meta: 'metadata',
      updatedAt: 'updated_at',
    } as const

const mapRecord = (record: Record<string, any>): FileIngestRecord => ({
  file_id: record[columnMap.fileId],
  owner_id: record[columnMap.ownerId],
  status: record[columnMap.status],
  source: record[columnMap.source] ?? null,
  error_msg: record[columnMap.error] ?? null,
  page_count: record[columnMap.pageCount] ?? null,
  lang: record[columnMap.lang] ?? null,
  meta: record[columnMap.meta] ?? null,
  updated_at: record[columnMap.updatedAt] ?? new Date().toISOString(),
})

export const fileIngestRepo = {
  async upsert(record: Partial<FileIngestRecord> & { file_id: string; owner_id: string }): Promise<FileIngestRecord> {
    const payload: Record<string, any> = {
      [columnMap.fileId]: record.file_id,
      [columnMap.ownerId]: record.owner_id,
    }

    if (record.status) payload[columnMap.status] = record.status
    if (record.source !== undefined) payload[columnMap.source] = record.source
    if (record.error_msg !== undefined) payload[columnMap.error] = record.error_msg
    if (record.page_count !== undefined) payload[columnMap.pageCount] = record.page_count
    if (record.lang !== undefined) payload[columnMap.lang] = record.lang
    if (record.meta !== undefined) payload[columnMap.meta] = record.meta

    const { data, error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .upsert(payload, { onConflict: columnMap.fileId })
      .select('*')
      .single()

    if (error || !data) {
      throw createError.databaseError('Failed to upsert file ingest record', { error })
    }

    return mapRecord(data)
  },

  async updateStatus(ownerId: string, fileId: string, status: FileIngestStatus, errorMsg?: string | null): Promise<void> {
    const updates: Record<string, any> = {
      [columnMap.status]: status,
      [columnMap.updatedAt]: new Date().toISOString(),
    }

    if (errorMsg !== undefined) {
      updates[columnMap.error] = errorMsg
    }

    const { error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .update(updates)
      .eq(columnMap.fileId, fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to update file ingest status', { error })
    }
  },

  async getByFileIds(ownerId: string, fileIds: string[]): Promise<Record<string, FileIngestRecord>> {
    if (!fileIds.length) return {}

    const { data, error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .select('*')
      .eq(columnMap.ownerId, ownerId)
      .in(columnMap.fileId, fileIds)

    if (error) {
      throw createError.databaseError('Failed to fetch ingest records', { error })
    }

    const map: Record<string, FileIngestRecord> = {}
    for (const record of data ?? []) {
      const mapped = mapRecord(record)
      map[mapped.file_id] = mapped
    }
    return map
  },

  async listByOwner(ownerId: string): Promise<FileIngestRecord[]> {
    const { data, error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .select('*')
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to list ingest records', { error })
    }

    return (data ?? []).map(mapRecord)
  },

  async filterFileIds(ownerId: string, filters: { source?: string | null; status?: FileIngestStatus }): Promise<string[]> {
    let query = supabaseAdmin
      .from(INGEST_TABLE)
      .select(columnMap.fileId)
      .eq(columnMap.ownerId, ownerId)

    if (filters.source) {
      query = query.eq(columnMap.source, filters.source)
    }

    if (filters.status) {
      query = query.eq(columnMap.status, filters.status)
    }

    const { data, error } = await query

    if (error) {
      throw createError.databaseError('Failed to filter ingest records', { error })
    }

    return (data ?? []).map((record: any) => record[columnMap.fileId])
  },

  async updateMeta(ownerId: string, fileId: string, meta: Record<string, unknown>): Promise<void> {
    const existing = await this.get(ownerId, fileId)

    await this.upsert({
      file_id: fileId,
      owner_id: ownerId,
      status: existing?.status ?? 'pending',
      source: existing?.source ?? null,
      error_msg: existing?.error_msg ?? null,
      page_count: existing?.page_count ?? null,
      lang: existing?.lang ?? null,
      meta,
    })
  },

  async existsWithContentHash(ownerId: string, contentHash: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .select(columnMap.fileId)
      .eq(columnMap.ownerId, ownerId)
      .contains(columnMap.meta, { content_hash: contentHash })
      .limit(1)

    if (error) {
      throw createError.databaseError('Failed to check ingest records by content hash', { error })
    }

    return !!(data && data.length)
  },

  async deleteByFile(ownerId: string, fileId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .delete()
      .eq(columnMap.fileId, fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to delete ingest record', { error })
    }
  },

  async deleteMany(ownerId: string, fileIds: string[]): Promise<void> {
    if (!fileIds.length) return

    const { error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .delete()
      .eq(columnMap.ownerId, ownerId)
      .in(columnMap.fileId, fileIds)

    if (error) {
      throw createError.databaseError('Failed to bulk delete ingest records', { error })
    }
  },

  async get(ownerId: string, fileId: string): Promise<FileIngestRecord | null> {
    const { data, error } = await supabaseAdmin
      .from(INGEST_TABLE)
      .select('*')
      .eq(columnMap.fileId, fileId)
      .eq(columnMap.ownerId, ownerId)
      .maybeSingle()

    if (error) {
      throw createError.databaseError('Failed to fetch file ingest record', { error })
    }

    return data ? mapRecord(data) : null
  },
}

