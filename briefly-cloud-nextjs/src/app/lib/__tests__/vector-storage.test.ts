import { VectorStorageService } from '../vector-storage'

// Mock ChromaDB
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn(() => ({
      add: jest.fn(),
      query: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    })),
  })),
}))

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(),
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(),
      })),
    })),
  })),
}))

describe('Vector Storage Service', () => {
  let vectorService: VectorStorageService

  beforeEach(() => {
    jest.clearAllMocks()
    vectorService = new VectorStorageService()
  })

  describe('Initialization', () => {
    it('should initialize with ChromaDB as primary backend', () => {
      expect(vectorService.backend).toBe('chroma')
    })

    it('should fallback to pgvector when ChromaDB is unavailable', () => {
      const originalEnv = process.env
      process.env.VECTOR_BACKEND = 'pgvector'

      jest.resetModules()
      const { VectorStorageService: UpdatedService } = require('../vector-storage')
      const updatedService = new UpdatedService()

      expect(updatedService.backend).toBe('pgvector')

      process.env = originalEnv
    })
  })

  describe('ChromaDB Operations', () => {
    beforeEach(() => {
      // Ensure ChromaDB is the backend
      process.env.VECTOR_BACKEND = 'chroma'
    })

    it('should add documents to ChromaDB', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockAdd = mockCollection.add

      mockAdd.mockResolvedValue({ ids: ['doc1'], embeddings: [[0.1, 0.2, 0.3]] })

      const documents = [
        {
          id: 'doc1',
          content: 'Test document content',
          metadata: { source: 'test.pdf', page: 1 },
        },
      ]

      const result = await vectorService.addDocuments(documents)

      expect(mockAdd).toHaveBeenCalledWith({
        ids: ['doc1'],
        documents: ['Test document content'],
        metadatas: [{ source: 'test.pdf', page: 1 }],
      })
      expect(result).toBeDefined()
    })

    it('should search documents in ChromaDB', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockQuery = mockCollection.query

      mockQuery.mockResolvedValue({
        ids: [['doc1', 'doc2']],
        documents: [['Test content 1', 'Test content 2']],
        metadatas: [[{ source: 'test1.pdf' }, { source: 'test2.pdf' }]],
        distances: [[0.1, 0.3]],
      })

      const query = 'test query'
      const results = await vectorService.searchDocuments(query, 5)

      expect(mockQuery).toHaveBeenCalledWith({
        queryTexts: [query],
        nResults: 5,
      })
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('doc1')
      expect(results[0].content).toBe('Test content 1')
    })

    it('should delete documents from ChromaDB', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockDelete = mockCollection.delete

      mockDelete.mockResolvedValue({})

      await vectorService.deleteDocuments(['doc1', 'doc2'])

      expect(mockDelete).toHaveBeenCalledWith({
        ids: ['doc1', 'doc2'],
      })
    })

    it('should update documents in ChromaDB', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockUpdate = mockCollection.update

      mockUpdate.mockResolvedValue({})

      const documents = [
        {
          id: 'doc1',
          content: 'Updated content',
          metadata: { source: 'updated.pdf' },
        },
      ]

      await vectorService.updateDocuments(documents)

      expect(mockUpdate).toHaveBeenCalledWith({
        ids: ['doc1'],
        documents: ['Updated content'],
        metadatas: [{ source: 'updated.pdf' }],
      })
    })
  })

  describe('pgvector Fallback', () => {
    beforeEach(() => {
      process.env.VECTOR_BACKEND = 'pgvector'
    })

    it('should add documents to pgvector', async () => {
      const mockSupabase = require('@supabase/supabase-js').createClient()
      const mockFrom = mockSupabase.from as jest.Mock
      const mockInsert = mockFrom().insert as jest.Mock

      mockInsert.mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: [{ id: 'doc1' }], error: null }),
      })

      const documents = [
        {
          id: 'doc1',
          content: 'Test document content',
          metadata: { source: 'test.pdf', page: 1 },
          embedding: [0.1, 0.2, 0.3],
        },
      ]

      const result = await vectorService.addDocuments(documents)

      expect(mockInsert).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('should search documents in pgvector', async () => {
      const mockSupabase = require('@supabase/supabase-js').createClient()
      const mockRpc = mockSupabase.rpc as jest.Mock

      mockRpc.mockResolvedValue({
        data: [
          {
            id: 'doc1',
            content: 'Test content 1',
            metadata: { source: 'test1.pdf' },
            similarity: 0.95,
          },
        ],
        error: null,
      })

      const query = 'test query'
      const results = await vectorService.searchDocuments(query, 5)

      expect(mockRpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: expect.any(Array),
        match_threshold: 0.7,
        match_count: 5,
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('doc1')
    })
  })

  describe('Error Handling', () => {
    it('should handle ChromaDB connection errors', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      mockChromaClient.mockImplementation(() => {
        throw new Error('ChromaDB connection failed')
      })

      expect(() => new VectorStorageService()).toThrow('ChromaDB connection failed')
    })

    it('should handle search errors gracefully', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockQuery = mockCollection.query

      mockQuery.mockRejectedValue(new Error('Search failed'))

      await expect(vectorService.searchDocuments('test', 5)).rejects.toThrow('Search failed')
    })

    it('should handle document addition errors', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockAdd = mockCollection.add

      mockAdd.mockRejectedValue(new Error('Add failed'))

      const documents = [
        {
          id: 'doc1',
          content: 'Test content',
          metadata: {},
        },
      ]

      await expect(vectorService.addDocuments(documents)).rejects.toThrow('Add failed')
    })
  })

  describe('Performance and Limits', () => {
    it('should handle large document batches', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockAdd = mockCollection.add

      mockAdd.mockResolvedValue({ ids: ['doc1'], embeddings: [[0.1, 0.2, 0.3]] })

      const documents = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        content: `Content ${i}`,
        metadata: { source: `file${i}.pdf` },
      }))

      const result = await vectorService.addDocuments(documents)

      expect(mockAdd).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('should respect search result limits', async () => {
      const mockChromaClient = require('chromadb').ChromaClient
      const mockCollection = mockChromaClient().getOrCreateCollection()
      const mockQuery = mockCollection.query

      mockQuery.mockResolvedValue({
        ids: [['doc1']],
        documents: [['Test content']],
        metadatas: [[{ source: 'test.pdf' }]],
        distances: [[0.1]],
      })

      await vectorService.searchDocuments('test', 1)

      expect(mockQuery).toHaveBeenCalledWith({
        queryTexts: ['test'],
        nResults: 1,
      })
    })
  })
})
