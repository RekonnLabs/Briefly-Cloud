import { supabaseAdmin } from '@/app/lib/supabase-admin'
import config from '@/app/lib/config'
import { createError } from '@/app/lib/api-errors'
import type { AppChunk } from '@/app/types/rag'

type InsertChunkInput = {
  fileId: string
  ownerId: string
  chunkIndex: number
  content: string
  embedding?: number[] | null
  tokenCount?: number | null
  createdAt?: string
}

const useAppSchema = config.features.ragAppSchema ?? true

const CHUNKS_TABLE = useAppSchema ? 'app.document_chunks' : 'document_chunks'

const columnMap = useAppSchema
  ? {
      id: 'id',
      fileId: 'file_id',
      ownerId: 'owner_id',
      chunkIndex: 'chunk_index',
      content: 'content',
      embedding: 'embedding',
      tokenCount: 'token_count',
      createdAt: 'created_at',
    } as const
  : {
      id: 'id',
      fileId: 'file_id',
      ownerId: 'user_id',
      chunkIndex: 'chunk_index',
      content: 'content',
      embedding: 'embedding',
      tokenCount: 'token_count',
      createdAt: 'created_at',
    } as const

const mapRecord = (record: Record<string, any>): AppChunk => ({
  id: Number(record[columnMap.id]),
  file_id: record[columnMap.fileId],
  owner_id: record[columnMap.ownerId],
  chunk_index: record[columnMap.chunkIndex],
  content: record[columnMap.content],
  embedding: record[columnMap.embedding] ?? null,
  token_count: record[columnMap.tokenCount] ?? null,
  created_at: record[columnMap.createdAt] ?? new Date().toISOString(),
})

export const chunksRepo = {
  async bulkInsert(chunks: InsertChunkInput[]): Promise<void> {
    if (chunks.length === 0) return

    const rows = chunks.map(chunk => ({
      [columnMap.fileId]: chunk.fileId,
      [columnMap.ownerId]: chunk.ownerId,
      [columnMap.chunkIndex]: chunk.chunkIndex,
      [columnMap.content]: chunk.content,
      [columnMap.embedding]: chunk.embedding ?? null,
      [columnMap.tokenCount]: chunk.tokenCount ?? null,
      [columnMap.createdAt]: chunk.createdAt ?? new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from(CHUNKS_TABLE)
      .insert(rows)

    if (error) {
      throw createError.databaseError('Failed to insert document chunks', { error })
    }
  },

  async deleteByFile(ownerId: string, fileId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(CHUNKS_TABLE)
      .delete()
      .eq(columnMap.fileId, fileId)
      .eq(columnMap.ownerId, ownerId)

    if (error) {
      throw createError.databaseError('Failed to delete document chunks', { error })
    }
  },

  async getByFile(ownerId: string, fileId: string): Promise<AppChunk[]> {
    const { data, error } = await supabaseAdmin
      .from(CHUNKS_TABLE)
      .select('*')
      .eq(columnMap.fileId, fileId)
      .eq(columnMap.ownerId, ownerId)
      .order(columnMap.chunkIndex, { ascending: true })

    if (error) {
      throw createError.databaseError('Failed to fetch document chunks', { error })
    }

    return (data ?? []).map(mapRecord)
  },
}

