import { supabaseAdmin } from '@/app/lib/supabase-admin'
import config from '@/app/lib/config'
import type { AppFile } from '@/app/types/rag'
import { createError } from '@/app/lib/api-errors'

export interface FileSearchOptions {
  search?: string
  sortBy?: 'created_at' | 'name' | 'size'
  sortOrder?: 'asc' | 'desc'
  offset?: number
  limit?: number
  filterIds?: string[]
}

export interface FileSearchResult {
  items: AppFile[]
  count: number
}

type CreateFileInput = {
  ownerId: string
  name: string
  path: string
  sizeBytes: number
  mimeType?: string | null
  checksum?: string | null
  createdAt?: string
}

const useAppSchema = config.features.ragAppSchema ?? true

const FILES_TABLE = useAppSchema ? 'app.files' : 'file_metadata'

const columnMap = useAppSchema
  ? {
      ownerId: 'owner_id',
      name: 'name',
      path: 'path',
      sizeBytes: 'size_bytes',
      mimeType: 'mime_type',
      checksum: 'checksum',
      createdAt: 'created_at',
    } as const
  : {
      ownerId: 'user_id',
      name: 'original_name',
      path: 'path',
      sizeBytes: 'size',
      mimeType: 'mime_type',
      checksum: 'checksum',
      createdAt: 'created_at',
    } as const

const mapRecordToAppFile = (record: Record<string, any>): AppFile => ({
  id: record.id,
  owner_id: record[useAppSchema ? 'owner_id' : 'user_id'],
  name: record[useAppSchema ? 'name' : 'original_name'],
  path: record.path,
  size_bytes: Number(record[useAppSchema ? 'size_bytes' : 'size'] ?? 0),
  mime_type: record.mime_type ?? null,
  checksum: record.checksum ?? null,
  created_at: record.created_at ?? new Date().toISOString(),
})

export const filesRepo = {
  async create(input: CreateFileInput): Promise<AppFile> {
    const payload: Record<string, any> = {
      [columnMap.ownerId]: input.ownerId,
      [columnMap.name]: input.name,
      [columnMap.path]: input.path,
      [columnMap.sizeBytes]: input.sizeBytes,
      [columnMap.mimeType]: input.mimeType ?? null,
      [columnMap.checksum]: input.checksum ?? null,
    }

    if (input.createdAt) {
      payload[columnMap.createdAt] = input.createdAt
    }

    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .insert(payload)
      .select('*')
      .single()

    if (error || !data) {
      throw createError.databaseError('Failed to create file record', { error })
    }

    return mapRecordToAppFile(data)
  },

  async getById(ownerId: string, fileId: string): Promise<AppFile | null> {
    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .select('*')
      .eq('id', fileId)
      .eq(columnMap.ownerId, ownerId)
      .maybeSingle()

    if (error) {
      throw createError.databaseError('Failed to fetch file record', { error })
    }

    return data ? mapRecordToAppFile(data) : null
  },

  async listByOwner(ownerId: string): Promise<AppFile[]> {
    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .select('*')
      .eq(columnMap.ownerId, ownerId)
      .order(columnMap.createdAt, { ascending: false })

    if (error) {
      throw createError.databaseError('Failed to list user files', { error })
    }

    return (data ?? []).map(mapRecordToAppFile)
  },

  async search(ownerId: string, options: FileSearchOptions): Promise<FileSearchResult> {
    const { search, sortBy = 'created_at', sortOrder = 'desc', offset = 0, limit = 20, filterIds } = options

    const sortColumnMap = {
      created_at: columnMap.createdAt,
      name: columnMap.name,
      size: columnMap.sizeBytes,
    } as const

    if (filterIds && filterIds.length === 0) {
      return { items: [], count: 0 }
    }

    let query = supabaseAdmin
      .from(FILES_TABLE)
      .select('*', { count: 'exact' })
      .eq(columnMap.ownerId, ownerId)

    if (filterIds && filterIds.length > 0) {
      query = query.in('id', filterIds)
    }

    if (search) {
      query = query.ilike(columnMap.name, `%${search}%`)
    }

    query = query.order(sortColumnMap[sortBy], { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      throw createError.databaseError('Failed to search files', { error })
    }

    return {
      items: (data ?? []).map(mapRecordToAppFile),
      count: count ?? 0,
    }
  },

  async getByIds(ownerId: string, fileIds: string[]): Promise<AppFile[]> {
    if (!fileIds.length) return []

    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .select('*')
      .eq(columnMap.ownerId, ownerId)
      .in('id', fileIds)

    if (error) {
      throw createError.databaseError('Failed to fetch files by ids', { error })
    }

    return (data ?? []).map(mapRecordToAppFile)
  },

  async update(ownerId: string, fileId: string, updates: Partial<{ name: string }>): Promise<void> {
    const payload: Record<string, any> = {}
    if (updates.name !== undefined) {
      payload[columnMap.name] = updates.name
    }
    if (Object.keys(payload).length === 0) return

    const { error } = await supabaseAdmin
      .from(FILES_TABLE)
      .update(payload)
      .eq('id', fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to update file', { error })
    }
  },

  async updateMany(ownerId: string, fileIds: string[], updates: Partial<{ name: string }>): Promise<AppFile[]> {
    if (!fileIds.length) return []

    const payload: Record<string, any> = {}

    if (updates.name !== undefined) {
      payload[columnMap.name] = updates.name
    }

    if (Object.keys(payload).length === 0) {
      return this.getByIds(ownerId, fileIds)
    }

    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .update(payload)
      .eq(columnMap.ownerId, ownerId)
      .in('id', fileIds)
      .select('*')

    if (error) {
      throw createError.databaseError('Failed to bulk update files', { error })
    }

    return (data ?? []).map(mapRecordToAppFile)
  },

  async delete(ownerId: string, fileId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(FILES_TABLE)
      .delete()
      .eq('id', fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to delete file', { error })
    }
  },

  async deleteMany(ownerId: string, fileIds: string[]): Promise<string[]> {
    if (!fileIds.length) return []

    const { data, error } = await supabaseAdmin
      .from(FILES_TABLE)
      .delete()
      .eq(columnMap.ownerId, ownerId)
      .in('id', fileIds)
      .select('id')

    if (error) {
      throw createError.databaseError('Failed to bulk delete files', { error })
    }

    return (data ?? []).map((record: any) => record.id)
  },

  async updateChecksum(ownerId: string, fileId: string, checksum: string | null): Promise<void> {
    const { error } = await supabaseAdmin
      .from(FILES_TABLE)
      .update({ [columnMap.checksum]: checksum })
      .eq('id', fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to update file checksum', { error })
    }
  },
}

