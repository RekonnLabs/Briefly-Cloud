/**
 * Performance tests for the new schema structure
 * Tests database query performance, RPC functions, concurrent operations, and connection pooling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { supabaseApp, supabasePrivate } from '@/app/lib/supabase-clients'
import { filesRepo } from '@/app/lib/repos/files-repo'
import { oauthTokensRepo } from '@/app/lib/repos/oauth-tokens-repo'
import { usersRepo } from '@/app/lib/repos/users-repo'
import { chunksRepo } from '@/app/lib/repos/chunks-repo'

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  SIMPLE_QUERY: 100,      // Simple SELECT queries should be under 100ms
  COMPLEX_QUERY: 500,     // Complex queries with joins should be under 500ms
  RPC_FUNCTION: 200,      // RPC function calls should be under 200ms
  BULK_OPERATION: 1000,   // Bulk operations should be under 1000ms
  CONCURRENT_OPERATION: 2000, // Concurrent operations should complete under 2000ms
}

// Test data
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const TEST_FILE_ID = '550e8400-e29b-41d4-a716-446655440001'

describe('Schema Performance Tests', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupTestData()
    
    // Create test user
    await usersRepo.create({
      id: TEST_USER_ID,
      email: 'perf-test@example.com',
      subscriptionTier: 'free'
    })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  beforeEach(async () => {
    // Clean up test data between tests
    await cleanupTestFiles()
    await cleanupTestTokens()
  })

  describe('App Schema Query Performance', () => {
    it('should perform user queries efficiently', async () => {
      const startTime = Date.now()
      
      const user = await usersRepo.findById(TEST_USER_ID)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(user).toBeDefined()
      expect(user?.id).toBe(TEST_USER_ID)
    })

    it('should perform file queries efficiently', async () => {
      // Create test files
      const filePromises = Array.from({ length: 10 }, (_, i) => 
        filesRepo.create({
          ownerId: TEST_USER_ID,
          name: `test-file-${i}.pdf`,
          path: `test/path/file-${i}.pdf`,
          sizeBytes: 1024 * (i + 1),
          mimeType: 'application/pdf'
        })
      )
      await Promise.all(filePromises)

      const startTime = Date.now()
      
      const files = await filesRepo.findByUserId(TEST_USER_ID, 50, 0)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(files).toHaveLength(10)
    })

    it('should perform complex queries with joins efficiently', async () => {
      // Create test data
      const file = await filesRepo.create({
        ownerId: TEST_USER_ID,
        name: 'test-complex.pdf',
        path: 'test/complex.pdf',
        sizeBytes: 2048,
        mimeType: 'application/pdf'
      })

      // Create document chunks
      const chunkPromises = Array.from({ length: 5 }, (_, i) =>
        chunksRepo.create({
          userId: TEST_USER_ID,
          fileId: file.id,
          content: `Test chunk content ${i}`,
          chunkIndex: i,
          embedding: Array.from({ length: 1536 }, () => Math.random()),
          metadata: { page: i + 1 }
        })
      )
      await Promise.all(chunkPromises)

      const startTime = Date.now()
      
      // Perform complex query with search
      const results = await chunksRepo.searchSimilar(
        TEST_USER_ID,
        Array.from({ length: 1536 }, () => Math.random()),
        5
      )
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.COMPLEX_QUERY)
      expect(results).toHaveLength(5)
    })

    it('should handle bulk operations efficiently', async () => {
      const startTime = Date.now()
      
      // Create multiple files in bulk
      const filePromises = Array.from({ length: 50 }, (_, i) => 
        filesRepo.create({
          ownerId: TEST_USER_ID,
          name: `bulk-file-${i}.pdf`,
          path: `bulk/file-${i}.pdf`,
          sizeBytes: 1024,
          mimeType: 'application/pdf'
        })
      )
      await Promise.all(filePromises)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION)
    })
  })

  describe('RPC Function Performance', () => {
    it('should perform OAuth token save operations efficiently', async () => {
      const tokenData = {
        accessToken: 'test-access-token-' + Date.now(),
        refreshToken: 'test-refresh-token-' + Date.now(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive.file'
      }

      const startTime = Date.now()
      
      await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RPC_FUNCTION)
    })

    it('should perform OAuth token retrieval efficiently', async () => {
      // First save a token
      const tokenData = {
        accessToken: 'test-access-token-retrieve',
        refreshToken: 'test-refresh-token-retrieve',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive.file'
      }
      await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)

      const startTime = Date.now()
      
      const retrievedToken = await oauthTokensRepo.getToken(TEST_USER_ID, 'google')
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RPC_FUNCTION)
      expect(retrievedToken?.accessToken).toBe(tokenData.accessToken)
    })

    it('should perform OAuth token deletion efficiently', async () => {
      // First save a token
      const tokenData = {
        accessToken: 'test-access-token-delete',
        refreshToken: 'test-refresh-token-delete',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive.file'
      }
      await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)

      const startTime = Date.now()
      
      await oauthTokensRepo.deleteToken(TEST_USER_ID, 'google')
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RPC_FUNCTION)

      // Verify deletion
      const deletedToken = await oauthTokensRepo.getToken(TEST_USER_ID, 'google')
      expect(deletedToken).toBeNull()
    })

    it('should handle multiple RPC operations efficiently', async () => {
      const startTime = Date.now()
      
      // Perform multiple RPC operations concurrently
      const operations = Array.from({ length: 10 }, (_, i) => 
        oauthTokensRepo.saveToken(TEST_USER_ID, 'google', {
          accessToken: `test-token-${i}`,
          refreshToken: `refresh-token-${i}`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          scope: 'https://www.googleapis.com/auth/drive.file'
        })
      )
      
      await Promise.all(operations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent app schema operations without conflicts', async () => {
      const startTime = Date.now()
      
      // Create concurrent operations across different tables
      const operations = [
        // User operations
        ...Array.from({ length: 5 }, (_, i) => 
          usersRepo.updateUsage(TEST_USER_ID, { documentsUploaded: i + 1 })
        ),
        // File operations
        ...Array.from({ length: 5 }, (_, i) => 
          filesRepo.create({
            ownerId: TEST_USER_ID,
            name: `concurrent-file-${i}.pdf`,
            path: `concurrent/file-${i}.pdf`,
            sizeBytes: 1024,
            mimeType: 'application/pdf'
          })
        ),
        // Chunk operations
        ...Array.from({ length: 5 }, (_, i) => 
          chunksRepo.create({
            userId: TEST_USER_ID,
            fileId: TEST_FILE_ID,
            content: `Concurrent chunk ${i}`,
            chunkIndex: i,
            embedding: Array.from({ length: 1536 }, () => Math.random()),
            metadata: { concurrent: true }
          })
        )
      ]
      
      await Promise.all(operations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATION)
    })

    it('should handle concurrent RPC operations without conflicts', async () => {
      const startTime = Date.now()
      
      // Create concurrent RPC operations
      const rpcOperations = [
        // Save operations
        ...Array.from({ length: 5 }, (_, i) => 
          oauthTokensRepo.saveToken(TEST_USER_ID, 'google', {
            accessToken: `concurrent-token-${i}`,
            refreshToken: `concurrent-refresh-${i}`,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            scope: 'https://www.googleapis.com/auth/drive.file'
          })
        ),
        // Retrieval operations (after a short delay)
        ...Array.from({ length: 5 }, () => 
          new Promise(resolve => setTimeout(resolve, 50)).then(() =>
            oauthTokensRepo.getToken(TEST_USER_ID, 'google')
          )
        )
      ]
      
      await Promise.all(rpcOperations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATION)
    })

    it('should handle mixed schema operations concurrently', async () => {
      const startTime = Date.now()
      
      // Mix app schema and RPC operations
      const mixedOperations = [
        // App schema operations
        filesRepo.create({
          ownerId: TEST_USER_ID,
          name: 'mixed-file.pdf',
          path: 'mixed/file.pdf',
          sizeBytes: 1024,
          mimeType: 'application/pdf'
        }),
        usersRepo.updateUsage(TEST_USER_ID, { documentsUploaded: 1 }),
        
        // RPC operations
        oauthTokensRepo.saveToken(TEST_USER_ID, 'google', {
          accessToken: 'mixed-token',
          refreshToken: 'mixed-refresh',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          scope: 'https://www.googleapis.com/auth/drive.file'
        }),
        oauthTokensRepo.getToken(TEST_USER_ID, 'google')
      ]
      
      await Promise.all(mixedOperations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATION)
    })
  })

  describe('Connection Pooling Efficiency', () => {
    it('should efficiently handle multiple schema clients', async () => {
      const startTime = Date.now()
      
      // Test multiple operations using different schema clients
      const operations = [
        // App schema operations
        supabaseApp.from('users').select('id').eq('id', TEST_USER_ID).single(),
        supabaseApp.from('files').select('id').eq('user_id', TEST_USER_ID).limit(1),
        
        // RPC operations (using app client but calling private schema)
        supabaseApp.rpc('get_oauth_token', {
          p_user_id: TEST_USER_ID,
          p_provider: 'google'
        }),
        
        // Multiple concurrent operations
        ...Array.from({ length: 10 }, () => 
          supabaseApp.from('users').select('subscription_tier').eq('id', TEST_USER_ID).single()
        )
      ]
      
      await Promise.all(operations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATION)
    })

    it('should maintain performance under connection pressure', async () => {
      const startTime = Date.now()
      
      // Create many concurrent connections to test pooling
      const connectionOperations = Array.from({ length: 50 }, (_, i) => 
        supabaseApp.from('users')
          .select('id, email, subscription_tier')
          .eq('id', TEST_USER_ID)
          .single()
      )
      
      const results = await Promise.all(connectionOperations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION)
      expect(results).toHaveLength(50)
      results.forEach(result => {
        expect(result.data?.id).toBe(TEST_USER_ID)
      })
    })

    it('should handle schema switching efficiently', async () => {
      const startTime = Date.now()
      
      // Alternate between different schema operations
      const schemaOperations = []
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          // App schema operation
          schemaOperations.push(
            supabaseApp.from('users').select('id').eq('id', TEST_USER_ID).single()
          )
        } else {
          // RPC operation (private schema)
          schemaOperations.push(
            supabaseApp.rpc('get_oauth_token', {
              p_user_id: TEST_USER_ID,
              p_provider: 'google'
            })
          )
        }
      }
      
      await Promise.all(schemaOperations)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATION)
    })
  })

  describe('Performance Monitoring', () => {
    it('should track query execution times', async () => {
      const queryTimes: number[] = []
      
      // Perform multiple queries and track times
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now()
        await usersRepo.findById(TEST_USER_ID)
        const duration = Date.now() - startTime
        queryTimes.push(duration)
      }
      
      // Calculate statistics
      const avgTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length
      const maxTime = Math.max(...queryTimes)
      const minTime = Math.min(...queryTimes)
      
      console.log(`Query Performance Stats:
        Average: ${avgTime.toFixed(2)}ms
        Max: ${maxTime}ms
        Min: ${minTime}ms
        All times: ${queryTimes.join(', ')}ms`)
      
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(maxTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_QUERY * 2)
    })

    it('should track RPC function execution times', async () => {
      const rpcTimes: number[] = []
      
      // Perform multiple RPC calls and track times
      for (let i = 0; i < 10; i++) {
        const tokenData = {
          accessToken: `perf-token-${i}`,
          refreshToken: `perf-refresh-${i}`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          scope: 'https://www.googleapis.com/auth/drive.file'
        }
        
        const startTime = Date.now()
        await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)
        const duration = Date.now() - startTime
        rpcTimes.push(duration)
      }
      
      // Calculate statistics
      const avgTime = rpcTimes.reduce((sum, time) => sum + time, 0) / rpcTimes.length
      const maxTime = Math.max(...rpcTimes)
      const minTime = Math.min(...rpcTimes)
      
      console.log(`RPC Performance Stats:
        Average: ${avgTime.toFixed(2)}ms
        Max: ${maxTime}ms
        Min: ${minTime}ms
        All times: ${rpcTimes.join(', ')}ms`)
      
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RPC_FUNCTION)
      expect(maxTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RPC_FUNCTION * 2)
    })
  })
})

// Helper functions
async function cleanupTestData() {
  try {
    // Clean up in reverse dependency order
    await cleanupTestFiles()
    await cleanupTestTokens()
    
    // Clean up user
    await supabaseApp
      .from('users')
      .delete()
      .eq('id', TEST_USER_ID)
  } catch (error) {
    console.warn('Cleanup warning:', error)
  }
}

async function cleanupTestFiles() {
  try {
    // Delete document chunks first
    await supabaseApp
      .from('document_chunks')
      .delete()
      .eq('user_id', TEST_USER_ID)
    
    // Delete files
    await supabaseApp
      .from('files')
      .delete()
      .eq('user_id', TEST_USER_ID)
  } catch (error) {
    console.warn('File cleanup warning:', error)
  }
}

async function cleanupTestTokens() {
  try {
    await oauthTokensRepo.deleteToken(TEST_USER_ID, 'google')
    await oauthTokensRepo.deleteToken(TEST_USER_ID, 'microsoft')
  } catch (error) {
    console.warn('Token cleanup warning:', error)
  }
}