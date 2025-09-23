/**
 * Unit Tests for Document Chunks Repository
 * 
 * Tests the DocumentChunksRepository class functionality including:
 * - CRUD operations with app schema
 * - User isolation and security
 * - Search functionality (text and vector)
 * - Error handling and validation
 */

import { DocumentChunksRepository } from '../chunks-repo'
import { BaseRepository } from '../base-repo'
import type { InsertChunkInput, SearchChunksInput } from '../chunks-repo'

// Mock the supabase clients
jest.mock('../../supabase-clients', () => ({
  supabaseApp: {
    from: jest.fn(() => ({
      insert: jest.fn(),
      delete: jest.fn(),
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
      range: jest.fn(),
      textSearch: jest.fn(),
      in: jest.fn(),
      limit: jest.fn(),
    })),
    rpc: jest.fn(),
  },
}))

// Mock the createError utility
jest.mock('../../api-errors', () => ({
  createError: {
    databaseError: jest.fn((message, error) => new Error(`DB Error: ${message}`)),
    validation: jest.fn((message, details) => new Error(`Validation Error: ${message}`)),
  },
}))

describe('DocumentChunksRepository', () => {
  let repository: DocumentChunksRepository
  let mockSupabaseApp: any

  beforeEach(() => {
    repository = new DocumentChunksRepository()
    mockSupabaseApp = require('../../supabase-clients').supabaseApp
    jest.clearAllMocks()
  })

  describe('Inheritance and Setup', () => {
    it('should extend BaseRepository', () => {
      expect(repository).toBeInstanceOf(BaseRepository)
    })

    it('should have access to appClient', () => {
      // Access protected property through type assertion for testing
      const appClient = (repository as any).appClient
      expect(appClient).toBeDefined()
    })
  })

  describe('bulkInsert', () => {
    const mockChunks: InsertChunkInput[] = [
      {
        fileId: 'file-1',
        ownerId: 'user-1',
        chunkIndex: 0,
        content: 'First chunk content',
        embedding: [0.1, 0.2, 0.3],
        tokenCount: 10,
      },
      {
        fileId: 'file-1',
        ownerId: 'user-1',
        chunkIndex: 1,
        content: 'Second chunk content',
        tokenCount: 15,
      },
    ]

    beforeEach(() => {
      const mockQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)
    })

    it('should insert chunks successfully', async () => {
      await repository.bulkInsert(mockChunks)

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      
      const insertCall = mockSupabaseApp.from().insert
      expect(insertCall).toHaveBeenCalledWith([
        {
          file_id: 'file-1',
          owner_id: 'user-1',
          chunk_index: 0,
          content: 'First chunk content',
          embedding: [0.1, 0.2, 0.3],
          token_count: 10,
          created_at: expect.any(String),
        },
        {
          file_id: 'file-1',
          owner_id: 'user-1',
          chunk_index: 1,
          content: 'Second chunk content',
          embedding: null,
          token_count: 15,
          created_at: expect.any(String),
        },
      ])
    })

    it('should handle empty chunks array', async () => {
      await repository.bulkInsert([])
      expect(mockSupabaseApp.from).not.toHaveBeenCalled()
    })

    it('should validate required fields', async () => {
      const invalidChunks = [
        {
          fileId: '',
          ownerId: 'user-1',
          chunkIndex: 0,
          content: 'content',
        },
      ] as InsertChunkInput[]

      await expect(repository.bulkInsert(invalidChunks)).rejects.toThrow('Validation Error')
    })

    it('should handle database errors', async () => {
      const mockQuery = {
        insert: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Insert failed', code: 'DB001' } 
        }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      await expect(repository.bulkInsert(mockChunks)).rejects.toThrow('DB Error')
    })
  })

  describe('deleteByFile', () => {
    it('should delete chunks by file ID with user isolation', async () => {
      const mockSupabaseResponse = {
        data: null,
        error: null
      }

      const mockEq2 = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq1 })
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete })
      
      mockSupabaseApp.from.mockImplementation(mockFrom)

      await repository.deleteByFile('user-1', 'file-1')

      expect(mockFrom).toHaveBeenCalledWith('document_chunks')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq1).toHaveBeenCalledWith('file_id', 'file-1')
      expect(mockEq2).toHaveBeenCalledWith('owner_id', 'user-1')
    })

    it('should validate required parameters', async () => {
      await expect(repository.deleteByFile('', 'file-1')).rejects.toThrow('Validation Error')
      await expect(repository.deleteByFile('user-1', '')).rejects.toThrow('Validation Error')
    })

    it('should handle database errors', async () => {
      const mockSupabaseResponse = {
        data: null,
        error: { message: 'Delete failed' }
      }

      const mockEq2 = jest.fn().mockResolvedValue(mockSupabaseResponse)
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq1 })
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete })
      
      mockSupabaseApp.from.mockImplementation(mockFrom)

      await expect(repository.deleteByFile('user-1', 'file-1')).rejects.toThrow('DB Error')
    })
  })

  describe('getByFile', () => {
    const mockChunkData = [
      {
        id: 1,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 0,
        content: 'First chunk',
        embedding: [0.1, 0.2],
        token_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 1,
        content: 'Second chunk',
        embedding: null,
        token_count: 15,
        created_at: '2024-01-01T00:01:00Z',
      },
    ]

    beforeEach(() => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockChunkData, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)
    })

    it('should get chunks by file ID with proper user isolation', async () => {
      const result = await repository.getByFile('user-1', 'file-1')

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      
      const mockQuery = mockSupabaseApp.from()
      expect(mockQuery.select).toHaveBeenCalledWith('*')
      expect(mockQuery.eq).toHaveBeenCalledWith('file_id', 'file-1')
      expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', 'user-1')
      expect(mockQuery.order).toHaveBeenCalledWith('chunk_index', { ascending: true })

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 0,
        content: 'First chunk',
        embedding: [0.1, 0.2],
        token_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      })
    })

    it('should return empty array when no chunks found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      const result = await repository.getByFile('user-1', 'file-1')
      expect(result).toEqual([])
    })

    it('should validate required parameters', async () => {
      await expect(repository.getByFile('', 'file-1')).rejects.toThrow('Validation Error')
      await expect(repository.getByFile('user-1', '')).rejects.toThrow('Validation Error')
    })
  })

  describe('getByUser', () => {
    const mockUserChunks = [
      {
        id: 1,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 0,
        content: 'User chunk 1',
        embedding: null,
        token_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    beforeEach(() => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: mockUserChunks, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)
    })

    it('should get chunks by user ID with pagination', async () => {
      const result = await repository.getByUser('user-1', 50, 10)

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      
      const mockQuery = mockSupabaseApp.from()
      expect(mockQuery.select).toHaveBeenCalledWith('*')
      expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', 'user-1')
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQuery.range).toHaveBeenCalledWith(10, 59) // offset + limit - 1

      expect(result).toHaveLength(1)
    })

    it('should use default pagination values', async () => {
      await repository.getByUser('user-1')

      const mockQuery = mockSupabaseApp.from()
      expect(mockQuery.range).toHaveBeenCalledWith(0, 99) // default limit 100
    })
  })

  describe('searchByText', () => {
    const mockSearchInput: SearchChunksInput = {
      userId: 'user-1',
      query: 'search term',
      limit: 5,
      fileIds: ['file-1', 'file-2'],
    }

    const mockSearchResults = [
      {
        id: 1,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 0,
        content: 'Content with search term',
        embedding: null,
        token_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    beforeEach(() => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: mockSearchResults, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)
    })

    it('should search chunks by text with user filtering', async () => {
      const result = await repository.searchByText(mockSearchInput)

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      
      const mockQuery = mockSupabaseApp.from()
      expect(mockQuery.select).toHaveBeenCalledWith('*')
      expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', 'user-1')
      expect(mockQuery.textSearch).toHaveBeenCalledWith('content', 'search term', { type: 'websearch' })
      expect(mockQuery.in).toHaveBeenCalledWith('file_id', ['file-1', 'file-2'])
      expect(mockQuery.limit).toHaveBeenCalledWith(5)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 1,
        content: 'Content with search term',
        relevanceScore: 1.0,
      })
    })

    it('should search without file ID filtering when not provided', async () => {
      const inputWithoutFiles = { ...mockSearchInput, fileIds: undefined }
      
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockSearchResults, error: null }),
        in: jest.fn().mockReturnThis(), // Add the in method even if not used
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      await repository.searchByText(inputWithoutFiles)

      expect(mockQuery.in).not.toHaveBeenCalled()
    })

    it('should validate required parameters', async () => {
      await expect(repository.searchByText({ userId: '', query: 'test' })).rejects.toThrow('Validation Error')
      await expect(repository.searchByText({ userId: 'user-1', query: '' })).rejects.toThrow('Validation Error')
    })
  })

  describe('searchByVector', () => {
    const mockSearchInput: SearchChunksInput = {
      userId: 'user-1',
      query: 'vector search',
      embedding: [0.1, 0.2, 0.3, 0.4],
      limit: 5,
      similarityThreshold: 0.8,
    }

    const mockVectorResults = [
      {
        id: 1,
        file_id: 'file-1',
        owner_id: 'user-1',
        chunk_index: 0,
        content: 'Vector search result',
        embedding: [0.1, 0.2, 0.3, 0.4],
        token_count: 10,
        created_at: '2024-01-01T00:00:00Z',
        similarity: 0.95,
      },
    ]

    beforeEach(() => {
      mockSupabaseApp.rpc.mockResolvedValue({ data: mockVectorResults, error: null })
    })

    it('should search chunks by vector similarity', async () => {
      const result = await repository.searchByVector(mockSearchInput)

      expect(mockSupabaseApp.rpc).toHaveBeenCalledWith('search_document_chunks_by_similarity', {
        query_embedding: [0.1, 0.2, 0.3, 0.4],
        user_id: 'user-1',
        similarity_threshold: 0.8,
        match_count: 5,
        file_ids: null,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 1,
        content: 'Vector search result',
        similarity: 0.95,
        relevanceScore: 0.95,
      })
    })

    it('should fallback to text search when RPC function is not available', async () => {
      mockSupabaseApp.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Function not found' } 
      })

      // Mock text search fallback
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      const result = await repository.searchByVector(mockSearchInput)

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      expect(result).toEqual([])
    })

    it('should validate required parameters', async () => {
      await expect(repository.searchByVector({ 
        userId: '', 
        query: 'test',
        embedding: [0.1, 0.2] 
      })).rejects.toThrow('Validation Error')

      await expect(repository.searchByVector({ 
        userId: 'user-1', 
        query: 'test',
        embedding: [] 
      })).rejects.toThrow('Embedding vector is required')
    })
  })

  describe('getRelevantContext', () => {
    const mockSearchInput: SearchChunksInput = {
      userId: 'user-1',
      query: 'context search',
      limit: 3,
    }

    it('should use vector search when embedding is provided', async () => {
      const inputWithEmbedding = {
        ...mockSearchInput,
        embedding: [0.1, 0.2, 0.3],
      }

      mockSupabaseApp.rpc.mockResolvedValue({ data: [], error: null })

      await repository.getRelevantContext(inputWithEmbedding)

      expect(mockSupabaseApp.rpc).toHaveBeenCalledWith('search_document_chunks_by_similarity', expect.any(Object))
    })

    it('should use text search when embedding is not provided', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        textSearch: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      await repository.getRelevantContext(mockSearchInput)

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      expect(mockQuery.textSearch).toHaveBeenCalled()
    })
  })

  describe('getChunkStats', () => {
    const mockStatsData = [
      { file_id: 'file-1' },
      { file_id: 'file-1' },
      { file_id: 'file-2' },
    ]

    beforeEach(() => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockStatsData, error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)
    })

    it('should calculate chunk statistics for a user', async () => {
      const result = await repository.getChunkStats('user-1')

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('document_chunks')
      
      const mockQuery = mockSupabaseApp.from()
      expect(mockQuery.select).toHaveBeenCalledWith('file_id')
      expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', 'user-1')

      expect(result).toEqual({
        totalChunks: 3,
        totalFiles: 2,
        avgChunksPerFile: 1.5,
      })
    })

    it('should handle empty results', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabaseApp.from.mockReturnValue(mockQuery)

      const result = await repository.getChunkStats('user-1')

      expect(result).toEqual({
        totalChunks: 0,
        totalFiles: 0,
        avgChunksPerFile: 0,
      })
    })
  })
})