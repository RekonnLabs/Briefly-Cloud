import { NextRequest } from 'next/server'
import { POST } from '@/app/api/chat/route'

// Mock dependencies
jest.mock('@/app/lib/auth', () => ({
  getServerSession: jest.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com', subscriptionTier: 'pro' },
  })),
}))

jest.mock('@/app/lib/database', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ data: { id: 'test-conversation-id' }, error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  })),
}))

jest.mock('@/app/lib/vector-storage', () => ({
  VectorStorageService: jest.fn(() => ({
    searchDocuments: jest.fn(() => [
      {
        id: 'chunk-1',
        content: 'Relevant document content about the query.',
        metadata: { fileId: 'file-1', fileName: 'test.pdf' },
        similarity: 0.95,
      },
    ]),
  })),
}))

jest.mock('@/app/lib/openai', () => ({
  generateChatCompletion: jest.fn(() => ({
    content: 'This is a helpful response based on the provided context.',
    usage: { total_tokens: 150 },
  })),
  getChatModelForTier: jest.fn(() => 'gpt-5-mini'),
}))

describe('Chat API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/chat', () => {
    it('should process chat message successfully', async () => {
      const requestBody = {
        message: 'What is the main topic of the document?',
        conversationId: 'test-conversation-id',
        stream: false,
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.response).toBeDefined()
      expect(result.conversationId).toBeDefined()
    })

    it('should handle streaming responses', async () => {
      const mockOpenAI = require('@/app/lib/openai')
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Hello' } }] }
          yield { choices: [{ delta: { content: ' World' } }] }
          yield { choices: [{ delta: { content: '!' } }] }
        },
      }
      mockOpenAI.generateChatCompletion.mockResolvedValue(mockStream)

      const requestBody = {
        message: 'Say hello',
        stream: true,
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    })

    it('should handle authentication errors', async () => {
      const mockAuth = require('@/app/lib/auth')
      mockAuth.getServerSession.mockResolvedValue(null)

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toBe('UNAUTHORIZED')
    })

    it('should handle invalid request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('VALIDATION_ERROR')
    })

    it('should handle vector search errors', async () => {
      const mockVectorStorage = require('@/app/lib/vector-storage')
      mockVectorStorage.VectorStorageService.mockImplementation(() => ({
        searchDocuments: jest.fn(() => {
          throw new Error('Vector search failed')
        }),
      }))

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('VECTOR_SEARCH_ERROR')
    })

    it('should handle OpenAI API errors', async () => {
      const mockOpenAI = require('@/app/lib/openai')
      mockOpenAI.generateChatCompletion.mockRejectedValue(new Error('OpenAI API error'))

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('LLM_ERROR')
    })

    it('should handle database errors', async () => {
      const mockDatabase = require('@/app/lib/database')
      mockDatabase.getSupabaseClient.mockReturnValue({
        from: jest.fn(() => ({
          insert: jest.fn(() => ({ data: null, error: { message: 'Database error' } })),
        })),
      })

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('DATABASE_ERROR')
    })

    it('should use correct model based on subscription tier', async () => {
      const mockAuth = require('@/app/lib/auth')
      mockAuth.getServerSession.mockResolvedValue({
        user: { id: 'test-user-id', subscriptionTier: 'free' },
      })

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      await POST(request)

      const mockOpenAI = require('@/app/lib/openai')
      expect(mockOpenAI.getChatModelForTier).toHaveBeenCalledWith('free')
    })

    it('should handle BYOK model selection', async () => {
      const mockAuth = require('@/app/lib/auth')
      mockAuth.getServerSession.mockResolvedValue({
        user: { 
          id: 'test-user-id', 
          subscriptionTier: 'pro_byok',
          byokProvider: 'openai',
          byokModel: 'gpt-4',
        },
      })

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      await POST(request)

      const mockOpenAI = require('@/app/lib/openai')
      expect(mockOpenAI.generateChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        'gpt-4',
        false,
        expect.objectContaining({
          provider: 'openai',
          apiKey: expect.any(String),
        })
      )
    })

    it('should include relevant context in chat completion', async () => {
      const requestBody = {
        message: 'What does the document say about AI?',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      await POST(request)

      const mockOpenAI = require('@/app/lib/openai')
      expect(mockOpenAI.generateChatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Relevant document content'),
          }),
          expect.objectContaining({
            role: 'user',
            content: 'What does the document say about AI?',
          }),
        ]),
        expect.any(String),
        false
      )
    })

    it('should handle empty search results', async () => {
      const mockVectorStorage = require('@/app/lib/vector-storage')
      mockVectorStorage.VectorStorageService.mockImplementation(() => ({
        searchDocuments: jest.fn(() => []),
      }))

      const requestBody = {
        message: 'Test message with no relevant context',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      // Should still generate a response even without context
    })

    it('should handle rate limiting', async () => {
      const mockDatabase = require('@/app/lib/database')
      mockDatabase.getSupabaseClient.mockReturnValue({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => ({ 
                  data: Array.from({ length: 1000 }, (_, i) => ({ id: `msg-${i}` })), 
                  error: null 
                })),
              })),
            })),
          })),
        })),
      })

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(429)
      expect(result.success).toBe(false)
      expect(result.error).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('should store conversation and message in database', async () => {
      const mockDatabase = require('@/app/lib/database')
      const mockInsert = jest.fn(() => ({ data: { id: 'test-id' }, error: null }))
      mockDatabase.getSupabaseClient.mockReturnValue({
        from: jest.fn(() => ({
          insert: mockInsert,
        })),
      })

      const requestBody = {
        message: 'Test message',
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      await POST(request)

      expect(mockInsert).toHaveBeenCalledTimes(2) // Once for conversation, once for message
    })
  })
})
