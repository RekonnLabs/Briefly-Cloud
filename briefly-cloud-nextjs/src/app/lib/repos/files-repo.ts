import { BaseRepository } from './base-repo'
import type { AppFile } from '@/app/types/rag'

// TypeScript interfaces for FileRecord and repository methods
export interface FileRecord {
  id: string
  user_id: string
  name: string
  path: string
  size: number
  mime_type?: string
  source: 'upload' | 'google' | 'microsoft'
  external_id?: string
  external_url?: string
  processed: boolean
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

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

export interface CreateFileInput {
  ownerId: string
  name: string
  path: string
  sizeBytes: number
  mimeType?: string | null
  source?: 'upload' | 'google' | 'microsoft'
  externalId?: string | null
  externalUrl?: string | null
  metadata?: Record<string, any>
  checksum?: string | null
  createdAt?: string
}

export interface UpdateFileInput {
  name?: string
  processed?: boolean
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
  metadata?: Record<string, any>
  checksum?: string | null
}

// Map database record to AppFile format for backward compatibility
const mapRecordToAppFile = (record: Record<string, any>): AppFile => ({
  id: record.id,
  owner_id: record.user_id,
  name: record.name,
  path: record.path,
  size_bytes: Number(record.size ?? 0),
  mime_type: record.mime_type ?? null,
  checksum: record.checksum ?? null,
  created_at: record.created_at ?? new Date().toISOString(),
})

// Map database record to FileRecord format
const mapRecordToFileRecord = (record: Record<string, any>): FileRecord => ({
  id: record.id,
  user_id: record.user_id,
  name: record.name,
  path: record.path,
  size: Number(record.size ?? 0),
  mime_type: record.mime_type ?? null,
  source: record.source ?? 'upload',
  external_id: record.external_id ?? null,
  external_url: record.external_url ?? null,
  processed: record.processed ?? false,
  processing_status: record.processing_status ?? 'pending',
  metadata: record.metadata ?? {},
  checksum: record.checksum ?? null,
  created_at: record.created_at ?? new Date().toISOString(),
  updated_at: record.updated_at ?? new Date().toISOString(),
})

/**
 * Files Repository - App Schema Implementation
 * 
 * This repository handles file operations using the app schema (app.files table).
 * It extends BaseRepository for schema-aware operations and proper error handling.
 */
export class FilesRepository extends BaseRepository {
  private readonly TABLE_NAME = 'files'

  /**
   * Create a new file record in app.files table
   */
  async create(input: CreateFileInput): Promise<FileRecord> {
    this.validateRequiredFields(input, ['ownerId', 'name', 'path', 'sizeBytes'], 'create file')

    const payload = this.sanitizeInput({
      user_id: input.ownerId,
      name: input.name,
      path: input.path,
      size: input.sizeBytes,
      mime_type: input.mimeType,
      source: input.source || 'upload',
      external_id: input.externalId,
      external_url: input.externalUrl,
      metadata: input.metadata || {},
      checksum: input.checksum,
      processed: false,
      processing_status: 'pending',
      created_at: input.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .insert(payload)
        .select('*')
        .single()

      if (error) {
        this.handleDatabaseError(error, 'create file record')
      }

      if (!data) {
        throw new Error('No data returned from file creation')
      }

      return mapRecordToFileRecord(data)
    } catch (error) {
      this.handleDatabaseError(error, 'create file record in app schema')
    }
  }

  /**
   * Get file by ID for a specific user
   */
  async getById(userId: string, fileId: string): Promise<FileRecord | null> {
    this.validateRequiredFields({ userId, fileId }, ['userId', 'fileId'], 'get file by ID')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'fetch file by ID')
      }

      return data ? mapRecordToFileRecord(data) : null
    } catch (error) {
      this.handleDatabaseError(error, 'fetch file by ID from app schema')
    }
  }

  /**
   * List all files for a user
   */
  async findByUserId(userId: string, limit = 50, offset = 0): Promise<FileRecord[]> {
    this.validateRequiredFields({ userId }, ['userId'], 'list user files')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        this.handleDatabaseError(error, 'list user files')
      }

      return (data || []).map(mapRecordToFileRecord)
    } catch (error) {
      this.handleDatabaseError(error, 'list user files from app schema')
    }
  }

  /**
   * Search files with various options
   */
  async search(userId: string, options: FileSearchOptions): Promise<FileSearchResult> {
    this.validateRequiredFields({ userId }, ['userId'], 'search files')

    const { search, sortBy = 'created_at', sortOrder = 'desc', offset = 0, limit = 20, filterIds } = options

    const sortColumnMap = {
      created_at: 'created_at',
      name: 'name',
      size: 'size',
    } as const

    if (filterIds && filterIds.length === 0) {
      return { items: [], count: 0 }
    }

    try {
      let query = this.appClient
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)

      if (filterIds && filterIds.length > 0) {
        query = query.in('id', filterIds)
      }

      if (search) {
        query = query.ilike('name', `%${search}%`)
      }

      query = query.order(sortColumnMap[sortBy], { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) {
        this.handleDatabaseError(error, 'search files')
      }

      return {
        items: (data || []).map(mapRecordToAppFile),
        count: count || 0,
      }
    } catch (error) {
      this.handleDatabaseError(error, 'search files in app schema')
    }
  }

  /**
   * Get multiple files by IDs
   */
  async getByIds(userId: string, fileIds: string[]): Promise<AppFile[]> {
    if (!fileIds.length) return []

    this.validateRequiredFields({ userId }, ['userId'], 'get files by IDs')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .in('id', fileIds)

      if (error) {
        this.handleDatabaseError(error, 'fetch files by IDs')
      }

      return (data || []).map(mapRecordToAppFile)
    } catch (error) {
      this.handleDatabaseError(error, 'fetch files by IDs from app schema')
    }
  }

  /**
   * Update file processing status
   */
  async updateProcessingStatus(
    userId: string,
    fileId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    this.validateRequiredFields({ userId, fileId, status }, ['userId', 'fileId', 'status'], 'update processing status')

    const payload = {
      processing_status: status,
      processed: status === 'completed',
      updated_at: new Date().toISOString()
    }

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('id', fileId)
        .eq('user_id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update file processing status')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update file processing status in app schema')
    }
  }

  /**
   * Update file record
   */
  async update(userId: string, fileId: string, updates: UpdateFileInput): Promise<void> {
    this.validateRequiredFields({ userId, fileId }, ['userId', 'fileId'], 'update file')

    const payload = this.sanitizeInput({
      ...updates,
      updated_at: new Date().toISOString()
    })

    if (Object.keys(payload).length <= 1) return // Only updated_at

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('id', fileId)
        .eq('user_id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update file')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update file in app schema')
    }
  }

  /**
   * Update multiple files
   */
  async updateMany(userId: string, fileIds: string[], updates: UpdateFileInput): Promise<AppFile[]> {
    if (!fileIds.length) return []

    this.validateRequiredFields({ userId }, ['userId'], 'bulk update files')

    const payload = this.sanitizeInput({
      ...updates,
      updated_at: new Date().toISOString()
    })

    if (Object.keys(payload).length <= 1) {
      return this.getByIds(userId, fileIds)
    }

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('user_id', userId)
        .in('id', fileIds)
        .select('*')

      if (error) {
        this.handleDatabaseError(error, 'bulk update files')
      }

      return (data || []).map(mapRecordToAppFile)
    } catch (error) {
      this.handleDatabaseError(error, 'bulk update files in app schema')
    }
  }

  /**
   * Delete a file
   */
  async delete(userId: string, fileId: string): Promise<void> {
    this.validateRequiredFields({ userId, fileId }, ['userId', 'fileId'], 'delete file')

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId)

      if (error) {
        this.handleDatabaseError(error, 'delete file')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete file from app schema')
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMany(userId: string, fileIds: string[]): Promise<string[]> {
    if (!fileIds.length) return []

    this.validateRequiredFields({ userId }, ['userId'], 'bulk delete files')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .delete()
        .eq('user_id', userId)
        .in('id', fileIds)
        .select('id')

      if (error) {
        this.handleDatabaseError(error, 'bulk delete files')
      }

      return (data || []).map((record: any) => record.id)
    } catch (error) {
      this.handleDatabaseError(error, 'bulk delete files from app schema')
    }
  }

  /**
   * Update file checksum
   */
  async updateChecksum(userId: string, fileId: string, checksum: string | null): Promise<void> {
    this.validateRequiredFields({ userId, fileId }, ['userId', 'fileId'], 'update file checksum')

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update({ 
          checksum,
          updated_at: new Date().toISOString()
        })
        .eq('id', fileId)
        .eq('user_id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update file checksum')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update file checksum in app schema')
    }
  }

  // Backward compatibility methods that return AppFile format
  async listByOwner(ownerId: string): Promise<AppFile[]> {
    const files = await this.findByUserId(ownerId)
    return files.map(file => mapRecordToAppFile({
      id: file.id,
      user_id: file.user_id,
      name: file.name,
      path: file.path,
      size: file.size,
      mime_type: file.mime_type,
      checksum: file.checksum,
      created_at: file.created_at
    }))
  }
}

// Export singleton instance for backward compatibility
export const filesRepo = new FilesRepository()

