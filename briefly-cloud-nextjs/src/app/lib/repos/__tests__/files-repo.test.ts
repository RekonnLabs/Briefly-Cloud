/**
 * Files Repository Tests
 * 
 * Tests for the FilesRepository class to ensure proper app schema operations,
 * error handling, and TypeScript interfaces work correctly.
 */

import { FilesRepository, filesRepo } from '../files-repo'
import { supabaseApp } from '../../supabase-clients'
import { createError } from '../../api-errors'

// Mock the supabase client
jest.mock('../../supabase-clients', () => ({
  supabaseApp: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn()
          })),
          order: jest.fn(() => ({
            range: jest.fn()
          })),
          in: jest.fn()
        })),
        order: jest.fn(() => ({
          range: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn()
        })),
        in: jest.fn(() => ({
          select: jest.fn()
        }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(),
          in: jest.fn(() => ({
            select: jest.fn()
          }))
        }))
      }))
    }))
  }
}))

// Mock the api-errors module
jest.mock('../../api-errors', () => ({
  createError: {
    databaseError: jest.fn((message, error) => new Error(`Database Error: ${message}`)),
    validation: jest.fn((message, details) => new Error(`Validation Error: ${message}`))
  }
}))

describe('FilesRepository', () => {
  let repository: FilesRepository
  const mockUserId = 'test-user-id'
  const mockFileId = 'test-file-id'

  beforeEach(() => {
    repository = new FilesRepository()
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create a file record successfully', async () => {
      const mockFileData = {
        id: mockFileId,
        user_id: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        size: 1024,
        mime_type: 'application/pdf',
        source: 'upload',
        processed: false,
        processing_status: 'pending',
        metadata: {},
        created_at: '2025-01-27T10:00:00Z',
        updated_at: '2025-01-27T10:00:00Z'
      }

      const mockSupabaseResponse = {
        data: mockFileData,
        error: null
      }

      // Mock the chain of Supabase calls
      const mockSingle = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect })
      const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      const input = {
        ownerId: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf'
      }

      const result = await repository.create(input)

      expect(mockFrom).toHaveBeenCalledWith('files')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        size: 1024,
        mime_type: 'application/pdf',
        source: 'upload',
        processed: false,
        processing_status: 'pending'
      }))
      expect(result.id).toBe(mockFileId)
      expect(result.user_id).toBe(mockUserId)
      expect(result.name).toBe('test.pdf')
    })

    it('should handle database errors properly', async () => {
      const mockError = { message: 'Database connection failed', code: 'CONNECTION_ERROR' }
      const mockSupabaseResponse = {
        data: null,
        error: mockError
      }

      const mockSingle = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect })
      const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      const input = {
        ownerId: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        sizeBytes: 1024
      }

      await expect(repository.create(input)).rejects.toThrow('Database Error')
      // The error handler is called twice - once for the initial error, once for the catch block
      expect(createError.databaseError).toHaveBeenCalledWith(
        'Database operation failed: create file record', 
        mockError
      )
    })

    it('should validate required fields', async () => {
      const input = {
        ownerId: '',
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        sizeBytes: 1024
      }

      await expect(repository.create(input)).rejects.toThrow('Validation Error')
      expect(createError.validation).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields'),
        expect.any(Object)
      )
    })
  })

  describe('getById', () => {
    it('should retrieve a file by ID successfully', async () => {
      const mockFileData = {
        id: mockFileId,
        user_id: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        size: 1024,
        mime_type: 'application/pdf',
        source: 'upload',
        processed: false,
        processing_status: 'pending',
        metadata: {},
        created_at: '2025-01-27T10:00:00Z',
        updated_at: '2025-01-27T10:00:00Z'
      }

      const mockSupabaseResponse = {
        data: mockFileData,
        error: null
      }

      const mockMaybeSingle = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockEq2 = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 })
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      const result = await repository.getById(mockUserId, mockFileId)

      expect(mockFrom).toHaveBeenCalledWith('files')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq1).toHaveBeenCalledWith('id', mockFileId)
      expect(mockEq2).toHaveBeenCalledWith('user_id', mockUserId)
      expect(result).toBeTruthy()
      expect(result?.id).toBe(mockFileId)
    })

    it('should return null when file not found', async () => {
      const mockSupabaseResponse = {
        data: null,
        error: null
      }

      const mockMaybeSingle = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockEq2 = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 })
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      const result = await repository.getById(mockUserId, mockFileId)

      expect(result).toBeNull()
    })
  })

  describe('updateProcessingStatus', () => {
    it('should update processing status successfully', async () => {
      const mockSupabaseResponse = {
        data: null,
        error: null
      }

      const mockEq2 = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq1 })
      const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      await repository.updateProcessingStatus(mockUserId, mockFileId, 'completed')

      expect(mockFrom).toHaveBeenCalledWith('files')
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        processing_status: 'completed',
        processed: true,
        updated_at: expect.any(String)
      }))
      expect(mockEq1).toHaveBeenCalledWith('id', mockFileId)
      expect(mockEq2).toHaveBeenCalledWith('user_id', mockUserId)
    })

    it('should validate required fields for status update', async () => {
      await expect(repository.updateProcessingStatus('', mockFileId, 'completed')).rejects.toThrow('Validation Error')
      expect(createError.validation).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields'),
        expect.any(Object)
      )
    })
  })

  describe('findByUserId', () => {
    it('should list files for a user with pagination', async () => {
      const mockFilesData = [
        {
          id: 'file1',
          user_id: mockUserId,
          name: 'test1.pdf',
          path: '/uploads/test1.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          source: 'upload',
          processed: true,
          processing_status: 'completed',
          metadata: {},
          created_at: '2025-01-27T10:00:00Z',
          updated_at: '2025-01-27T10:00:00Z'
        },
        {
          id: 'file2',
          user_id: mockUserId,
          name: 'test2.pdf',
          path: '/uploads/test2.pdf',
          size: 2048,
          mime_type: 'application/pdf',
          source: 'upload',
          processed: false,
          processing_status: 'pending',
          metadata: {},
          created_at: '2025-01-27T09:00:00Z',
          updated_at: '2025-01-27T09:00:00Z'
        }
      ]

      const mockSupabaseResponse = {
        data: mockFilesData,
        error: null
      }

      const mockRange = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockOrder = jest.fn().mockReturnValue({ range: mockRange })
      const mockEq = jest.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
      
      ;(supabaseApp.from as jest.Mock).mockImplementation(mockFrom)

      const result = await repository.findByUserId(mockUserId, 10, 0)

      expect(mockFrom).toHaveBeenCalledWith('files')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId)
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockRange).toHaveBeenCalledWith(0, 9)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('file1')
      expect(result[1].id).toBe('file2')
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(filesRepo).toBeInstanceOf(FilesRepository)
    })

    it('should provide backward compatibility methods', async () => {
      // Mock the findByUserId method
      const mockFiles = [
        {
          id: 'file1',
          user_id: mockUserId,
          name: 'test.pdf',
          path: '/uploads/test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          source: 'upload',
          processed: true,
          processing_status: 'completed',
          metadata: {},
          checksum: null,
          created_at: '2025-01-27T10:00:00Z',
          updated_at: '2025-01-27T10:00:00Z'
        }
      ]

      jest.spyOn(filesRepo, 'findByUserId').mockResolvedValue(mockFiles)

      const result = await filesRepo.listByOwner(mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'file1',
        owner_id: mockUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        size_bytes: 1024,
        mime_type: 'application/pdf',
        checksum: null,
        created_at: '2025-01-27T10:00:00Z'
      })
    })
  })
})