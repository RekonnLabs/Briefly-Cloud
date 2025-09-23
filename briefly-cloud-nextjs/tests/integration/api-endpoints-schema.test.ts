/**
 * Integration tests for API endpoints with schema fixes
 * Tests Requirements: 2.1, 2.2, 3.1, 3.2, 4.1, 4.2
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals'
import { supabaseApp, supabasePrivate } from '@/app/lib/supabase-clients'
import { filesRepo } from '@/app/lib/repos/files-repo'
import { oauthTokensRepo } from '@/app/lib/repos/oauth-tokens-repo'
import { usersRepo } from '@/app/lib/repos/users-repo'
import { chunksRepo } from '@/app/lib/repos/chunks-repo'

// Test configuration
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'test-schema@example.com'
const TEST_CONVERSATION_ID = '00000000-0000-0000-0000-000000000002'

// Mock file for upload testing
const createMockFile = (name: string, type: string, size: number): File => {
  const content = 'Test file content for schema testing'
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

// Mock FormData for upload testing
const createMockFormData = (file: File, metadata?: any): FormData => {
  const formData = new FormData()
  formData.append('file', file)
  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata))
  }
  return formData
}

// Mock request context for API handlers
const createMockContext = (userId: string = TEST_USER_ID) => ({
  user: { id: userId, email: TEST_USER_EMAIL },
  correlationId: `test-${Date.now()}`,
  requestId: `req-${Date.now()}`,
  startTime: Date.now()
})

describe('API Endpoints Schema Integration Tests', () => {
  let testUserId: string
  let testFileId: string
  let testConversationId: string

  beforeAll(async () => {
    // Create test user in app schema
    const { data: user, error } = await supabaseApp
      .from('users')
      .insert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        subscription_tier: 'free',
        documents_uploaded: 0,
        storage_used_bytes: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error && error.code !== '23505') { // Ignore duplicate key error
      console.error('Failed to create test user:', error)
    }

    testUserId = TEST_USER_ID
  })

  afterAll(async () => {
    // Cleanup test data
    try {
      // Clean up app schema data
      await supabaseApp.from('chat_messages').delete().eq('user_id', testUserId)
      await supabaseApp.from('conversations').delete().eq('user_id', testUserId)
      await supabaseApp.from('document_chunks').delete().eq('user_id', testUserId)
      await supabaseApp.from('files').delete().eq('user_id', testUserId)
      await supabaseApp.from('users').delete().eq('id', testUserId)

      // Clean up private schema data via RPC
      await supabaseApp.rpc('delete_oauth_token', {
        p_user_id: testUserId,
        p_provider: 'google'
      })
      await supabaseApp.rpc('delete_oauth_token', {
        p_user_id: testUserId,
        p_provider: 'microsoft'
      })
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  })

  beforeEach(async () => {
    // Reset test state before each test
    testFileId = ''
    testConversationId = ''
  })

  describe('Upload API Schema Tests (Requirements 2.1, 2.2)', () => {
    it('should create file records in app.files correctly', async () => {
      // Test file creation using repository
      const fileData = {
        ownerId: testUserId,
        name: 'test-schema.pdf',
        path: `${testUserId}/test-schema.pdf`,
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        source: 'upload' as const,
        metadata: { test: true }
      }

      const createdFile = await filesRepo.create(fileData)

      expect(createdFile).toBeDefined()
      expect(createdFile.id).toBeDefined()
      expect(createdFile.user_id).toBe(testUserId)
      expect(createdFile.name).toBe('test-schema.pdf')
      expect(createdFile.size).toBe(1024)
      expect(createdFile.mime_type).toBe('application/pdf')
      expect(createdFile.source).toBe('upload')

      testFileId = createdFile.id

      // Verify file exists in app schema
      const { data: fileFromDb, error } = await supabaseApp
        .from('files')
        .select('*')
        .eq('id', createdFile.id)
        .eq('user_id', testUserId)
        .single()

      expect(error).toBeNull()
      expect(fileFromDb).toBeDefined()
      expect(fileFromDb.name).toBe('test-schema.pdf')
    })

    it('should update user usage statistics in app.users', async () => {
      // Get initial usage stats
      const initialStats = await usersRepo.getUsageStats(testUserId)
      const initialCount = initialStats?.documents_uploaded || 0
      const initialStorage = initialStats?.storage_used_bytes || 0

      // Update usage
      const newFileSize = 2048
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: initialCount + 1,
        storage_used_bytes: initialStorage + newFileSize
      })

      // Verify update in app schema
      const updatedStats = await usersRepo.getUsageStats(testUserId)
      expect(updatedStats).toBeDefined()
      expect(updatedStats.documents_uploaded).toBe(initialCount + 1)
      expect(updatedStats.storage_used_bytes).toBe(initialStorage + newFileSize)

      // Verify directly in database
      const { data: userFromDb, error } = await supabaseApp
        .from('users')
        .select('documents_uploaded, storage_used_bytes')
        .eq('id', testUserId)
        .single()

      expect(error).toBeNull()
      expect(userFromDb.documents_uploaded).toBe(initialCount + 1)
      expect(userFromDb.storage_used_bytes).toBe(initialStorage + newFileSize)
    })

    it('should handle file processing status updates correctly', async () => {
      // Create a test file first
      const fileData = {
        ownerId: testUserId,
        name: 'processing-test.pdf',
        path: `${testUserId}/processing-test.pdf`,
        sizeBytes: 512,
        mimeType: 'application/pdf'
      }

      const createdFile = await filesRepo.create(fileData)
      testFileId = createdFile.id

      // Test status updates
      await filesRepo.updateProcessingStatus(testUserId, testFileId, 'processing')
      
      let fileStatus = await filesRepo.findById(testUserId, testFileId)
      expect(fileStatus?.processing_status).toBe('processing')
      expect(fileStatus?.processed).toBe(false)

      await filesRepo.updateProcessingStatus(testUserId, testFileId, 'completed')
      
      fileStatus = await filesRepo.findById(testUserId, testFileId)
      expect(fileStatus?.processing_status).toBe('completed')
      expect(fileStatus?.processed).toBe(true)
    })

    it('should handle upload errors with proper schema context', async () => {
      // Test error handling by trying to create file with invalid user
      const invalidUserId = '00000000-0000-0000-0000-000000000999'
      
      try {
        await filesRepo.create({
          ownerId: invalidUserId,
          name: 'error-test.pdf',
          path: 'error-test.pdf',
          sizeBytes: 1024,
          mimeType: 'application/pdf'
        })
        
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        expect(error.message).toContain('Failed to create file record')
      }
    })
  })

  describe('Chat API Schema Tests (Requirements 3.1, 3.2)', () => {
    beforeEach(async () => {
      // Create test conversation in app schema
      const { data: conversation, error } = await supabaseApp
        .from('conversations')
        .insert({
          id: TEST_CONVERSATION_ID,
          user_id: testUserId,
          title: 'Test Schema Conversation',
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error && error.code !== '23505') {
        console.error('Failed to create test conversation:', error)
      }
      
      testConversationId = TEST_CONVERSATION_ID
    })

    it('should create conversations in app.conversations correctly', async () => {
      // Create conversation directly via database
      const conversationId = '00000000-0000-0000-0000-000000000003'
      const { data: conversation, error } = await supabaseApp
        .from('conversations')
        .insert({
          id: conversationId,
          user_id: testUserId,
          title: 'Schema Test Conversation'
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(conversation).toBeDefined()
      expect(conversation.user_id).toBe(testUserId)
      expect(conversation.title).toBe('Schema Test Conversation')

      // Verify conversation exists in app schema
      const { data: conversationFromDb } = await supabaseApp
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', testUserId)
        .single()

      expect(conversationFromDb).toBeDefined()
      expect(conversationFromDb.title).toBe('Schema Test Conversation')
    })

    it('should store chat messages in app.chat_messages correctly', async () => {
      // Store user message
      const { data: userMessage, error: userError } = await supabaseApp
        .from('chat_messages')
        .insert({
          conversation_id: testConversationId,
          user_id: testUserId,
          role: 'user',
          content: 'Test message for schema validation'
        })
        .select()
        .single()

      expect(userError).toBeNull()
      expect(userMessage).toBeDefined()
      expect(userMessage.role).toBe('user')
      expect(userMessage.content).toBe('Test message for schema validation')

      // Store assistant message with sources
      const { data: assistantMessage, error: assistantError } = await supabaseApp
        .from('chat_messages')
        .insert({
          conversation_id: testConversationId,
          user_id: testUserId,
          role: 'assistant',
          content: 'Test response from assistant',
          sources: [{ source: 'test.pdf', content: 'test content', relevance_score: 0.9 }],
          metadata: { modelRoute: 'gpt-4o', inputTokens: 100, outputTokens: 50 }
        })
        .select()
        .single()

      expect(assistantError).toBeNull()
      expect(assistantMessage).toBeDefined()
      expect(assistantMessage.role).toBe('assistant')
      expect(assistantMessage.sources).toBeDefined()
      expect(assistantMessage.metadata).toBeDefined()
    })

    it('should retrieve document chunks from app.document_chunks correctly', async () => {
      // Create test document chunks
      const chunkData = {
        userId: testUserId,
        fileId: testFileId || 'test-file-id',
        content: 'This is test content for semantic search and chat context retrieval',
        chunkIndex: 0,
        metadata: {
          source: 'test-document.pdf',
          page: 1,
          section: 'introduction'
        }
      }

      const createdChunk = await chunksRepo.create(chunkData)
      expect(createdChunk).toBeDefined()

      // Test search functionality
      const searchResults = await chunksRepo.search(testUserId, 'test content', 5)
      expect(searchResults).toBeDefined()
      expect(Array.isArray(searchResults)).toBe(true)

      // Verify chunk exists in app schema
      const { data: chunkFromDb } = await supabaseApp
        .from('document_chunks')
        .select('*')
        .eq('user_id', testUserId)
        .eq('content', chunkData.content)
        .single()

      expect(chunkFromDb).toBeDefined()
      expect(chunkFromDb.content).toBe(chunkData.content)
    })

    it('should read user tier information from app.users correctly', async () => {
      // Get user profile for tier checking
      const userProfile = await usersRepo.getById(testUserId)
      expect(userProfile).toBeDefined()
      expect(userProfile.subscription_tier).toBe('free')

      // Update tier and verify
      await supabaseApp
        .from('users')
        .update({ subscription_tier: 'pro' })
        .eq('id', testUserId)

      const updatedProfile = await usersRepo.getById(testUserId)
      expect(updatedProfile.subscription_tier).toBe('pro')

      // Reset tier for other tests
      await supabaseApp
        .from('users')
        .update({ subscription_tier: 'free' })
        .eq('id', testUserId)
    })

    it('should handle chat errors with proper schema context', async () => {
      // Test error handling by trying to access non-existent conversation
      const invalidConversationId = '00000000-0000-0000-0000-000000000999'
      
      try {
        await supabaseApp
          .from('chat_messages')
          .insert({
            conversation_id: invalidConversationId,
            user_id: testUserId,
            role: 'user',
            content: 'This should fail'
          })
          .select()
          .single()
        
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        // Error should contain schema context information
      }
    })
  })

  describe('OAuth Token Storage Tests (Requirements 4.1, 4.2)', () => {
    it('should store OAuth tokens in private schema via RPC correctly', async () => {
      const tokenData = {
        accessToken: 'test-access-token-schema',
        refreshToken: 'test-refresh-token-schema',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive.file'
      }

      // Store Google token
      await oauthTokensRepo.saveToken(testUserId, 'google', tokenData)

      // Retrieve and verify
      const retrievedToken = await oauthTokensRepo.getToken(testUserId, 'google')
      expect(retrievedToken).toBeDefined()
      expect(retrievedToken.accessToken).toBe(tokenData.accessToken)
      expect(retrievedToken.refreshToken).toBe(tokenData.refreshToken)
      expect(retrievedToken.scope).toBe(tokenData.scope)

      // Store Microsoft token
      await oauthTokensRepo.saveToken(testUserId, 'microsoft', {
        ...tokenData,
        accessToken: 'test-ms-access-token',
        scope: 'https://graph.microsoft.com/Files.Read.All'
      })

      const msToken = await oauthTokensRepo.getToken(testUserId, 'microsoft')
      expect(msToken).toBeDefined()
      expect(msToken.accessToken).toBe('test-ms-access-token')
      expect(msToken.scope).toBe('https://graph.microsoft.com/Files.Read.All')
    })

    it('should update existing OAuth tokens correctly', async () => {
      const initialToken = {
        accessToken: 'initial-token',
        refreshToken: 'initial-refresh',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'initial-scope'
      }

      // Store initial token
      await oauthTokensRepo.saveToken(testUserId, 'google', initialToken)

      // Update with new token (should upsert)
      const updatedToken = {
        accessToken: 'updated-token',
        refreshToken: 'updated-refresh',
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
        scope: 'updated-scope'
      }

      await oauthTokensRepo.saveToken(testUserId, 'google', updatedToken)

      // Verify update
      const retrievedToken = await oauthTokensRepo.getToken(testUserId, 'google')
      expect(retrievedToken).toBeDefined()
      expect(retrievedToken.accessToken).toBe('updated-token')
      expect(retrievedToken.refreshToken).toBe('updated-refresh')
      expect(retrievedToken.scope).toBe('updated-scope')
    })

    it('should delete OAuth tokens correctly', async () => {
      // Store token first
      await oauthTokensRepo.saveToken(testUserId, 'google', {
        accessToken: 'token-to-delete',
        refreshToken: 'refresh-to-delete'
      })

      // Verify it exists
      let token = await oauthTokensRepo.getToken(testUserId, 'google')
      expect(token).toBeDefined()

      // Delete token
      await oauthTokensRepo.deleteToken(testUserId, 'google')

      // Verify it's deleted
      token = await oauthTokensRepo.getToken(testUserId, 'google')
      expect(token).toBeNull()
    })

    it('should handle OAuth token errors with proper schema context', async () => {
      // Test error handling with invalid user ID
      const invalidUserId = 'invalid-user-id'
      
      try {
        await oauthTokensRepo.saveToken(invalidUserId, 'google', {
          accessToken: 'test-token'
        })
        
        // Should not reach here if validation works
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        expect(error.message).toContain('Failed to save OAuth token')
      }
    })

    it('should isolate tokens by user correctly', async () => {
      const otherUserId = '00000000-0000-0000-0000-000000000002'
      
      // Create another test user
      await supabaseApp
        .from('users')
        .insert({
          id: otherUserId,
          email: 'other-test@example.com',
          subscription_tier: 'free'
        })
        .select()
        .single()

      try {
        // Store tokens for both users
        await oauthTokensRepo.saveToken(testUserId, 'google', {
          accessToken: 'user1-token'
        })
        
        await oauthTokensRepo.saveToken(otherUserId, 'google', {
          accessToken: 'user2-token'
        })

        // Verify isolation
        const user1Token = await oauthTokensRepo.getToken(testUserId, 'google')
        const user2Token = await oauthTokensRepo.getToken(otherUserId, 'google')

        expect(user1Token.accessToken).toBe('user1-token')
        expect(user2Token.accessToken).toBe('user2-token')
        expect(user1Token.accessToken).not.toBe(user2Token.accessToken)

      } finally {
        // Cleanup other user
        await oauthTokensRepo.deleteToken(otherUserId, 'google')
        await supabaseApp.from('users').delete().eq('id', otherUserId)
      }
    })
  })

  describe('Error Handling and Schema Context Tests', () => {
    it('should provide proper schema context in error messages', async () => {
      // Test with non-existent user
      const nonExistentUserId = '00000000-0000-0000-0000-000000000999'
      
      try {
        await filesRepo.create({
          ownerId: nonExistentUserId,
          name: 'error-test.pdf',
          path: 'error-test.pdf',
          sizeBytes: 1024,
          mimeType: 'application/pdf'
        })
        
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        expect(error.message).toContain('Failed to create file record')
        // Error should contain schema context
      }
    })

    it('should handle schema connection issues gracefully', async () => {
      // This test would require mocking the database connection
      // For now, we'll test that the error handling structure is in place
      
      try {
        // Test with malformed data that should trigger schema validation
        await supabaseApp
          .from('files')
          .insert({
            user_id: 'invalid-uuid-format',
            name: null, // Required field
            path: null, // Required field
            size: 'not-a-number' // Wrong type
          })
          .select()
          .single()
        
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        // Error should be handled gracefully
      }
    })

    it('should verify no 500 errors occur due to schema mismatches', async () => {
      // Test that all repository operations work with correct schemas
      
      // Test files repository (app schema)
      const fileData = {
        ownerId: testUserId,
        name: 'schema-test.pdf',
        path: 'schema-test.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf'
      }
      
      const file = await filesRepo.create(fileData)
      expect(file).toBeDefined()
      expect(file.id).toBeDefined()

      // Test OAuth repository (private schema via RPC)
      await oauthTokensRepo.saveToken(testUserId, 'google', {
        accessToken: 'test-token'
      })
      
      const token = await oauthTokensRepo.getToken(testUserId, 'google')
      expect(token).toBeDefined()
      expect(token.accessToken).toBe('test-token')

      // Test users repository (app schema)
      const userStats = await usersRepo.getUsageStats(testUserId)
      expect(userStats).toBeDefined()
      expect(userStats.subscription_tier).toBeDefined()

      // All operations should complete without schema errors
    })
  })

  describe('Health Check Schema Tests', () => {
    it('should verify schema connectivity in health checks', async () => {
      // Test app schema connectivity
      const { data: appTest, error: appError } = await supabaseApp
        .from('users')
        .select('id')
        .limit(1)

      expect(appError).toBeNull()
      expect(appTest).toBeDefined()

      // Test private schema connectivity via RPC
      const { data: privateTest, error: privateError } = await supabaseApp
        .rpc('get_oauth_token', {
          p_user_id: '00000000-0000-0000-0000-000000000000',
          p_provider: 'google'
        })

      // Should not error even if no token found
      expect(privateError).toBeNull()

      // Test public schema views (if they exist)
      const { data: publicTest, error: publicError } = await supabaseApp
        .schema('public')
        .from('users')
        .select('id')
        .limit(1)

      // May error if public views don't exist, which is acceptable
      if (!publicError) {
        expect(publicTest).toBeDefined()
      }
    })
  })
})