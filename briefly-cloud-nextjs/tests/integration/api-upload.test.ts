import { NextRequest } from 'next/server'
import { POST } from '@/app/api/upload/route'

// Mock dependencies
jest.mock('@/app/lib/auth', () => ({
  getServerSession: jest.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
  })),
}))

jest.mock('@/app/lib/database', () => ({
  getSupabaseClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => ({ data: { path: 'test-file.pdf' }, error: null })),
      })),
    },
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ data: { id: 'test-file-id' }, error: null })),
    })),
  })),
}))

jest.mock('@/app/lib/document-extractor', () => ({
  extractTextFromFile: jest.fn(() => ({
    text: 'Test document content',
    metadata: { fileType: 'pdf', pages: 1 },
  })),
}))

jest.mock('@/app/lib/document-chunker', () => ({
  chunkText: jest.fn(() => [
    { content: 'Test document content', metadata: { chunkIndex: 0, totalChunks: 1 } },
  ]),
}))

jest.mock('@/app/lib/openai', () => ({
  generateEmbedding: jest.fn(() => [0.1, 0.2, 0.3, 0.4, 0.5]),
}))

jest.mock('@/app/lib/vector-storage', () => ({
  VectorStorageService: jest.fn(() => ({
    addDocuments: jest.fn(() => ({ success: true })),
  })),
}))

describe('Upload API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/upload', () => {
    it('should process file upload successfully', async () => {
      // Create mock form data
      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.fileId).toBeDefined()
    })

    it('should handle file validation errors', async () => {
      // Create mock form data with invalid file
      const formData = new FormData()
      const file = new File(['test content'], 'test.exe', { type: 'application/octet-stream' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_FILE_TYPE')
    })

    it('should handle file size limits', async () => {
      // Create mock form data with large file
      const formData = new FormData()
      const largeContent = 'x'.repeat(100 * 1024 * 1024) // 100MB
      const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('FILE_TOO_LARGE')
    })

    it('should handle storage errors', async () => {
      // Mock storage error
      const mockDatabase = require('@/app/lib/database')
      mockDatabase.getSupabaseClient.mockReturnValue({
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn(() => ({ data: null, error: { message: 'Storage error' } })),
          })),
        },
      })

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('STORAGE_ERROR')
    })

    it('should handle text extraction errors', async () => {
      // Mock extraction error
      const mockExtractor = require('@/app/lib/document-extractor')
      mockExtractor.extractTextFromFile.mockRejectedValue(new Error('Extraction failed'))

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('EXTRACTION_ERROR')
    })

    it('should handle embedding generation errors', async () => {
      // Mock embedding error
      const mockOpenAI = require('@/app/lib/openai')
      mockOpenAI.generateEmbedding.mockRejectedValue(new Error('Embedding failed'))

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('EMBEDDING_ERROR')
    })

    it('should handle vector storage errors', async () => {
      // Mock vector storage error
      const mockVectorStorage = require('@/app/lib/vector-storage')
      mockVectorStorage.VectorStorageService.mockImplementation(() => ({
        addDocuments: jest.fn(() => {
          throw new Error('Vector storage failed')
        }),
      }))

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('VECTOR_STORAGE_ERROR')
    })

    it('should process different file types correctly', async () => {
      const fileTypes = [
        { type: 'application/pdf', name: 'test.pdf' },
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'test.docx' },
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'test.xlsx' },
        { type: 'text/plain', name: 'test.txt' },
        { type: 'text/markdown', name: 'test.md' },
        { type: 'text/csv', name: 'test.csv' },
      ]

      for (const fileType of fileTypes) {
        const formData = new FormData()
        const file = new File(['test content'], fileType.name, { type: fileType.type })
        formData.append('file', file)

        const request = new NextRequest('http://localhost:3000/api/upload', {
          method: 'POST',
          body: formData,
        })

        const response = await POST(request)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.success).toBe(true)
        expect(result.fileId).toBeDefined()
      }
    })

    it('should handle authentication errors', async () => {
      // Mock unauthenticated session
      const mockAuth = require('@/app/lib/auth')
      mockAuth.getServerSession.mockResolvedValue(null)

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toBe('UNAUTHORIZED')
    })

    it('should handle usage limit errors', async () => {
      // Mock usage limit exceeded
      const mockDatabase = require('@/app/lib/database')
      mockDatabase.getSupabaseClient.mockReturnValue({
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn(() => ({ data: { path: 'test-file.pdf' }, error: null })),
          })),
        },
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => ({ data: { document_count: 100 }, error: null })),
            })),
          })),
        })),
      })

      const formData = new FormData()
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(429)
      expect(result.success).toBe(false)
      expect(result.error).toBe('USAGE_LIMIT_EXCEEDED')
    })
  })
})
