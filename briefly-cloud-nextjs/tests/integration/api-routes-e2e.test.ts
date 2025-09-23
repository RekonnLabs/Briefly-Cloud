/**
 * End-to-end tests for API routes with schema fixes
 * Tests actual HTTP endpoints to ensure they work correctly with new schema
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/testing-library/jest-dom'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseApp } from '@/app/lib/supabase-clients'
import { oauthTokensRepo } from '@/app/lib/repos/oauth-tokens-repo'

// Import API route handlers
import { POST as uploadPOST, GET as uploadGET } from '@/app/api/upload/route'
import { POST as chatPOST } from '@/app/api/chat/route'
import { GET as healthGET } from '@/app/api/health/route'

// Test user configuration
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'test-api-routes@example.com'

// Mock authentication context
const mockAuthContext = {
  user: { id: TEST_USER_ID, email: TEST_USER_EMAIL },
  correlationId: 'test-correlation-id',
  requestId: 'test-request-id',
  startTime: Date.now()
}

// Mock API middleware to inject auth context
jest.mock('@/app/lib/api-middleware', () => ({
  createProtectedApiHandler: (handler: any, options?: any) => {
    return async (request: NextRequest) => {
      // Inject mock auth context
      return handler(request, mockAuthContext)
    }
  },
  ApiContext: mockAuthContext
}))

// Mock performance monitoring
jest.mock('@/app/lib/stubs/performance', () => ({
  withPerformanceMonitoring: (handler: any) => handler,
  withApiPerformanceMonitoring: (fn: any) => fn
}))

// Mock document processing to avoid external dependencies
jest.mock('@/app/lib/document-extractor', () => ({
  extractTextFromBuffer: jest.fn().mockResolvedValue({
    text: 'Mock extracted text content',
    metadata: { pages: 1 }
  })
}))

jest.mock('@/app/lib/vector/document-processor', () => ({
  processDocument: jest.fn().mockResolvedValue(true)
}))

// Mock file ingest repository
jest.mock('@/app/lib/repos', () => ({
  ...jest.requireActual('@/app/lib/repos'),
  fileIngestRepo: {
    upsert: jest.fn().mockResolvedValue({ id: 'test-ingest-id' }),
    updateStatus: jest.fn().mockResolvedValue(true)
  }
}))

// Mock Supabase storage
const mockStorageUpload = jest.fn().mockResolvedValue({
  data: { id: 'test-storage-id', path: 'test-path' },
  error: null
})

const mockStorageGetPublicUrl = jest.fn().mockReturnValue({
  data: { publicUrl: 'https://example.com/test-file.pdf' }
})

jest.mock('@/app/lib/supabase-clients', () => ({
  ...jest.requireActual('@/app/lib/supabase-clients'),
  supabaseApp: {
    ...jest.requireActual('@/app/lib/supabase-clients').supabaseApp,
    storage: {
      from: () => ({
        upload: mockStorageUpload,
        getPublicUrl: mockStorageGetPublicUrl,
        remove: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    }
  }
}))

describe('API Routes End-to-End Schema Tests', () => {
  beforeAll(async () => {
    // Create test user in app schema
    const { error } = await supabaseApp
      .from('users')
      .upsert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        subscription_tier: 'free',
        documents_uploaded: 0,
        storage_used_bytes: 0,
        documents_limit: 25,
        storage_limit_bytes: 100 * 1024 * 1024,
        created_at: new Date().toISOString()
      })

    if (error && error.code !== '23505') {
      console.error('Failed to create test user:', error)
    }
  })

  afterAll(async () => {
    // Cleanup test data
    try {
      await supabaseApp.from('chat_messages').delete().eq('user_id', TEST_USER_ID)
      await supabaseApp.from('conversations').delete().eq('user_id', TEST_USER_ID)
      await supabaseApp.from('document_chunks').delete().eq('user_id', TEST_USER_ID)
      await supabaseApp.from('files').delete().eq('user_id', TEST_USER_ID)
      await supabaseApp.from('users').delete().eq('id', TEST_USER_ID)
      
      await oauthTokensRepo.deleteToken(TEST_USER_ID, 'google')
      await oauthTokensRepo.deleteToken(TEST_USER_ID, 'microsoft')
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  })

  describe('Upload API Route Tests', () => {
    it('should handle file upload with app schema correctly', async () => {
      // Create mock file
      const fileContent = 'Test PDF content for schema validation'
      const file = new File([fileContent], 'test-schema.pdf', { type: 'application/pdf' })
      
      // Create FormData
      const formData = new FormData()
      formData.append('file', file)
      formData.append('metadata', JSON.stringify({ test: true }))

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData
      })

      // Call upload handler
      const response = await uploadPOST(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(201)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data.file).toBeDefined()
      expect(responseData.data.file.name).toBe('test-schema.pdf')
      expect(responseData.data.usage).toBeDefined()
    })

    it('should get upload info from app schema correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'GET'
      })

      const response = await uploadGET(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data.supported_types).toBeDefined()
      expect(responseData.data.limits).toBeDefined()
      expect(responseData.data.current_usage).toBeDefined()
      expect(responseData.data.tier).toBe('free')
    })

    it('should handle upload errors with schema context', async () => {
      // Test with invalid file type
      const file = new File(['test'], 'test.invalid', { type: 'application/invalid' })
      const formData = new FormData()
      formData.append('file', file)

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadPOST(request)
      
      expect(response.status).toBe(400)
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('not supported')
    })
  })

  describe('Chat API Route Tests', () => {
    let testConversationId: string

    beforeEach(async () => {
      // Create test conversation
      const { data: conversation } = await supabaseApp
        .from('conversations')
        .insert({
          user_id: TEST_USER_ID,
          title: 'Test Chat Conversation'
        })
        .select()
        .single()

      testConversationId = conversation?.id
    })

    it('should handle chat requests with app schema correctly', async () => {
      const chatRequest = {
        message: 'Test message for schema validation',
        conversationId: testConversationId,
        stream: false
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest)
      })

      const response = await chatPOST(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data.conversation_id).toBe(testConversationId)
      expect(responseData.data.response).toBeDefined()
    })

    it('should create new conversation in app schema when none provided', async () => {
      const chatRequest = {
        message: 'New conversation test message',
        stream: false
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest)
      })

      const response = await chatPOST(request)
      
      expect(response.status).toBe(200)
      const responseData = await response.json()
      expect(responseData.data.conversation_id).toBeDefined()
      expect(responseData.data.conversation_id).not.toBe(testConversationId)

      // Verify conversation was created in app schema
      const { data: conversation } = await supabaseApp
        .from('conversations')
        .select('*')
        .eq('id', responseData.data.conversation_id)
        .eq('user_id', TEST_USER_ID)
        .single()

      expect(conversation).toBeDefined()
      expect(conversation.title).toContain('New conversation test message')
    })

    it('should store messages in app.chat_messages correctly', async () => {
      const chatRequest = {
        message: 'Message storage test',
        conversationId: testConversationId,
        stream: false
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest)
      })

      await chatPOST(request)

      // Verify messages were stored in app schema
      const { data: messages } = await supabaseApp
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', testConversationId)
        .eq('user_id', TEST_USER_ID)
        .order('created_at', { ascending: true })

      expect(messages).toBeDefined()
      expect(messages.length).toBeGreaterThanOrEqual(2) // User + assistant message

      const userMessage = messages.find(m => m.role === 'user')
      const assistantMessage = messages.find(m => m.role === 'assistant')

      expect(userMessage).toBeDefined()
      expect(userMessage.content).toBe('Message storage test')
      expect(assistantMessage).toBeDefined()
      expect(assistantMessage.content).toBeDefined()
    })

    it('should handle chat errors with schema context', async () => {
      const invalidRequest = {
        message: '', // Invalid empty message
        stream: false
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidRequest)
      })

      const response = await chatPOST(request)
      
      expect(response.status).toBe(400)
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error).toBeDefined()
    })
  })

  describe('OAuth Token Storage Integration Tests', () => {
    it('should store and retrieve OAuth tokens via RPC correctly', async () => {
      const tokenData = {
        accessToken: 'test-access-token-e2e',
        refreshToken: 'test-refresh-token-e2e',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive.file'
      }

      // Store token
      await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)

      // Retrieve token
      const retrievedToken = await oauthTokensRepo.getToken(TEST_USER_ID, 'google')
      
      expect(retrievedToken).toBeDefined()
      expect(retrievedToken.accessToken).toBe(tokenData.accessToken)
      expect(retrievedToken.refreshToken).toBe(tokenData.refreshToken)
      expect(retrievedToken.scope).toBe(tokenData.scope)

      // Test Microsoft tokens
      await oauthTokensRepo.saveToken(TEST_USER_ID, 'microsoft', {
        ...tokenData,
        accessToken: 'test-ms-token-e2e',
        scope: 'https://graph.microsoft.com/Files.Read.All'
      })

      const msToken = await oauthTokensRepo.getToken(TEST_USER_ID, 'microsoft')
      expect(msToken).toBeDefined()
      expect(msToken.accessToken).toBe('test-ms-token-e2e')
    })

    it('should handle OAuth token errors with proper schema context', async () => {
      try {
        // Test with invalid provider
        await oauthTokensRepo.saveToken(TEST_USER_ID, 'invalid' as any, {
          accessToken: 'test-token'
        })
        
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        expect(error.message).toContain('Failed to save OAuth token')
      }
    })
  })

  describe('Health Check Schema Tests', () => {
    it('should report schema health correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        method: 'GET'
      })

      const response = await healthGET(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)

      const healthData = await response.json()
      expect(healthData.status).toBeDefined()
      expect(healthData.timestamp).toBeDefined()
      
      // Should include schema information if enhanced health check is implemented
      if (healthData.schemas) {
        expect(healthData.schemas.app).toBeDefined()
        expect(healthData.schemas.private).toBeDefined()
      }
    })
  })

  describe('Error Handling and Schema Context', () => {
    it('should provide proper error context for schema issues', async () => {
      // This test verifies that errors include proper schema context
      // We'll test this by triggering a known error condition
      
      const invalidFormData = new FormData()
      // Don't append a file to trigger validation error
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: invalidFormData
      })

      const response = await uploadPOST(request)
      
      expect(response.status).toBe(400)
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error).toBe('No file provided')
      expect(responseData.correlationId).toBeDefined()
    })

    it('should verify no 500 errors occur due to schema mismatches', async () => {
      // Test multiple API operations to ensure no schema mismatches cause 500 errors
      
      // Test upload info
      const uploadInfoRequest = new NextRequest('http://localhost:3000/api/upload', {
        method: 'GET'
      })
      const uploadInfoResponse = await uploadGET(uploadInfoRequest)
      expect(uploadInfoResponse.status).not.toBe(500)

      // Test chat with valid data
      const chatRequest = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test message',
          stream: false
        })
      })
      const chatResponse = await chatPOST(chatRequest)
      expect(chatResponse.status).not.toBe(500)

      // Test health check
      const healthRequest = new NextRequest('http://localhost:3000/api/health', {
        method: 'GET'
      })
      const healthResponse = await healthGET(healthRequest)
      expect(healthResponse.status).not.toBe(500)

      // All responses should be successful or have proper error codes (not 500)
      expect([200, 201, 400, 401, 403, 404]).toContain(uploadInfoResponse.status)
      expect([200, 201, 400, 401, 403, 404]).toContain(chatResponse.status)
      expect([200, 201, 400, 401, 403, 404]).toContain(healthResponse.status)
    })
  })
})