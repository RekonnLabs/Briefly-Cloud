// Mock Supabase module for tests
export const createFileMetadata = jest.fn()
export const getFileMetadata = jest.fn()
export const updateFileMetadata = jest.fn()
export const deleteFileMetadata = jest.fn()

export interface FileMetadata {
  id: string
  user_id: string
  name: string
  path: string
  size: number
  mime_type: string
  source: string
  external_id?: string
  external_url?: string
  processed: boolean
  processing_status: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}