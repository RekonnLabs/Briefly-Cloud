/**
 * Integration Tests for Document Chunks Repository
 * 
 * These tests verify the DocumentChunksRepository works correctly with
 * the actual Supabase app schema and database operations.
 */

import { DocumentChunksRepository } from '../chunks-repo'
import type { InsertChunkInput, SearchChunksInput } from '../chunks-repo'

// These tests require a test database connection
// Skip if not in test environment with proper setup
const isTestEnvironment = process.env.NODE_ENV === 'test' && 
                          process.env.NEXT_PUBLIC_SUPABASE_URL &&
                          process.env.SUPABASE_SERVICE_ROLE_KEY

const describeIf = (condition: boolean) => condition ? describe : describe.skip

describeIf(isTestEnvironment)('DocumentChunksRepository Integration Tests', () => {
  let repository: DocumentChunksRepository
  const testUserId = 'test-user-' + Date.now()
  const testFileId = 'test-file-' + Date.now()
  
  beforeAll(() => {
    repository = new DocumentChunksRepository()
  })

  afterAll(async () => {
    // Clean up test data
    try {
      await repository.deleteByFile(testUserId, testFileId)
    } catch (error) {
      console.warn('Cleanup failed:', error)
    }
  })

  describe('Schema Integration', () => {
    it('should connect to app schema successfully', async () => {
      // Test basic connectivity by attempting to get stats
      const stats = await repository.getChunkStats(testUserId)
      expect(stats).toMatchObject({
        totalChunks: expect.any(Number),
        totalFiles: expect.any(Number),
        avgChunksPerFile: expect.any(Number),
      })
    })

    it('should use app.document_chunks table', async () => {
      // This test verifies the repository is using the correct table
      // by attempting an operation that would fail with wrong schema
      const testChunks: InsertChunkInput[] = [
        {
          fileId: testFileId,
          ownerId: testUserId,
          chunkIndex: 0,
          content: 'Integration test chunk',
          tokenCount: 5,
        },
      ]

      await expect(repository.bulkInsert(testChunks)).resolves.not.toThrow()
      
      // Verify the chunk was inserted
      const chunks = await repository.getByFile(testUserId, testFileId)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Integration test chunk')
    })
  })

  describe('User Isolation', () => {
    const user1Id = testUserId + '-user1'
    const user2Id = testUserId + '-user2'
    const sharedFileId = testFileId + '-shared'

    beforeAll(async () => {
      // Insert chunks for both users with same file ID
      const user1Chunks: InsertChunkInput[] = [
        {
          fileId: sharedFileId,
          ownerId: user1Id,
          chunkIndex: 0,
          content: 'User 1 chunk',
          tokenCount: 3,
        },
      ]

      const user2Chunks: InsertChunkInput[] = [
        {
          fileId: sharedFileId,
          ownerId: user2Id,
          chunkIndex: 0,
          content: 'User 2 chunk',
          tokenCount: 3,
        },
      ]

      await repository.bulkInsert(user1Chunks)
      await repository.bulkInsert(user2Chunks)
    })

    afterAll(async () => {
      await repository.deleteByFile(user1Id, sharedFileId)
      await repository.deleteByFile(user2Id, sharedFileId)
    })

    it('should isolate chunks by user ID', async () => {
      const user1Chunks = await repository.getByFile(user1Id, sharedFileId)
      const user2Chunks = await repository.getByFile(user2Id, sharedFileId)

      expect(user1Chunks).toHaveLength(1)
      expect(user2Chunks).toHaveLength(1)
      
      expect(user1Chunks[0].content).toBe('User 1 chunk')
      expect(user1Chunks[0].owner_id).toBe(user1Id)
      
      expect(user2Chunks[0].content).toBe('User 2 chunk')
      expect(user2Chunks[0].owner_id).toBe(user2Id)
    })

    it('should not return other users chunks in search', async () => {
      const user1Search = await repository.searchByText({
        userId: user1Id,
        query: 'chunk',
        limit: 10,
      })

      const user2Search = await repository.searchByText({
        userId: user2Id,
        query: 'chunk',
        limit: 10,
      })

      // Each user should only see their own chunks
      expect(user1Search.every(chunk => chunk.owner_id === user1Id)).toBe(true)
      expect(user2Search.every(chunk => chunk.owner_id === user2Id)).toBe(true)
      
      // Should not see each other's chunks
      expect(user1Search.some(chunk => chunk.content === 'User 2 chunk')).toBe(false)
      expect(user2Search.some(chunk => chunk.content === 'User 1 chunk')).toBe(false)
    })
  })

  describe('CRUD Operations', () => {
    const crudTestFileId = testFileId + '-crud'
    const crudTestUserId = testUserId + '-crud'

    afterEach(async () => {
      await repository.deleteByFile(crudTestUserId, crudTestFileId)
    })

    it('should perform complete CRUD cycle', async () => {
      // Create
      const testChunks: InsertChunkInput[] = [
        {
          fileId: crudTestFileId,
          ownerId: crudTestUserId,
          chunkIndex: 0,
          content: 'First CRUD chunk',
          embedding: [0.1, 0.2, 0.3],
          tokenCount: 4,
        },
        {
          fileId: crudTestFileId,
          ownerId: crudTestUserId,
          chunkIndex: 1,
          content: 'Second CRUD chunk',
          tokenCount: 4,
        },
      ]

      await repository.bulkInsert(testChunks)

      // Read
      const retrievedChunks = await repository.getByFile(crudTestUserId, crudTestFileId)
      expect(retrievedChunks).toHaveLength(2)
      expect(retrievedChunks[0].chunk_index).toBe(0)
      expect(retrievedChunks[1].chunk_index).toBe(1)
      expect(retrievedChunks[0].embedding).toEqual([0.1, 0.2, 0.3])
      expect(retrievedChunks[1].embedding).toBeNull()

      // Update (via delete and re-insert)
      await repository.deleteByFile(crudTestUserId, crudTestFileId)
      
      const updatedChunks: InsertChunkInput[] = [
        {
          fileId: crudTestFileId,
          ownerId: crudTestUserId,
          chunkIndex: 0,
          content: 'Updated CRUD chunk',
          tokenCount: 4,
        },
      ]

      await repository.bulkInsert(updatedChunks)

      const afterUpdate = await repository.getByFile(crudTestUserId, crudTestFileId)
      expect(afterUpdate).toHaveLength(1)
      expect(afterUpdate[0].content).toBe('Updated CRUD chunk')

      // Delete
      await repository.deleteByFile(crudTestUserId, crudTestFileId)
      
      const afterDelete = await repository.getByFile(crudTestUserId, crudTestFileId)
      expect(afterDelete).toHaveLength(0)
    })
  })

  describe('Search Functionality', () => {
    const searchTestFileId = testFileId + '-search'
    const searchTestUserId = testUserId + '-search'

    beforeAll(async () => {
      const searchChunks: InsertChunkInput[] = [
        {
          fileId: searchTestFileId,
          ownerId: searchTestUserId,
          chunkIndex: 0,
          content: 'This chunk contains information about artificial intelligence and machine learning',
          tokenCount: 12,
        },
        {
          fileId: searchTestFileId,
          ownerId: searchTestUserId,
          chunkIndex: 1,
          content: 'Database systems and data storage solutions are important for applications',
          tokenCount: 11,
        },
        {
          fileId: searchTestFileId,
          ownerId: searchTestUserId,
          chunkIndex: 2,
          content: 'Web development frameworks like React and Next.js enable modern applications',
          tokenCount: 11,
        },
      ]

      await repository.bulkInsert(searchChunks)
    })

    afterAll(async () => {
      await repository.deleteByFile(searchTestUserId, searchTestFileId)
    })

    it('should perform text search with user filtering', async () => {
      const searchInput: SearchChunksInput = {
        userId: searchTestUserId,
        query: 'artificial intelligence',
        limit: 5,
      }

      const results = await repository.searchByText(searchInput)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(chunk => chunk.owner_id === searchTestUserId)).toBe(true)
      expect(results[0].relevanceScore).toBe(1.0)
      
      // Should find the chunk containing "artificial intelligence"
      const aiChunk = results.find(chunk => 
        chunk.content.includes('artificial intelligence')
      )
      expect(aiChunk).toBeDefined()
    })

    it('should filter search results by file IDs', async () => {
      const searchInput: SearchChunksInput = {
        userId: searchTestUserId,
        query: 'applications',
        fileIds: [searchTestFileId],
        limit: 5,
      }

      const results = await repository.searchByText(searchInput)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(chunk => chunk.file_id === searchTestFileId)).toBe(true)
    })

    it('should handle vector search gracefully', async () => {
      const searchInput: SearchChunksInput = {
        userId: searchTestUserId,
        query: 'machine learning',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        limit: 3,
        similarityThreshold: 0.7,
      }

      // This should either work with RPC function or fallback to text search
      const results = await repository.searchByVector(searchInput)
      
      expect(Array.isArray(results)).toBe(true)
      expect(results.every(chunk => chunk.owner_id === searchTestUserId)).toBe(true)
    })

    it('should get relevant context for chat', async () => {
      const searchInput: SearchChunksInput = {
        userId: searchTestUserId,
        query: 'web development',
        limit: 2,
      }

      const context = await repository.getRelevantContext(searchInput)
      
      expect(context.length).toBeGreaterThan(0)
      expect(context.length).toBeLessThanOrEqual(2)
      expect(context.every(chunk => chunk.owner_id === searchTestUserId)).toBe(true)
      
      // Should include relevance score
      expect(context[0].relevanceScore).toBeDefined()
    })
  })

  describe('Statistics and Analytics', () => {
    const statsTestFileId1 = testFileId + '-stats1'
    const statsTestFileId2 = testFileId + '-stats2'
    const statsTestUserId = testUserId + '-stats'

    beforeAll(async () => {
      // Create chunks across multiple files
      const file1Chunks: InsertChunkInput[] = [
        {
          fileId: statsTestFileId1,
          ownerId: statsTestUserId,
          chunkIndex: 0,
          content: 'Stats test chunk 1',
          tokenCount: 4,
        },
        {
          fileId: statsTestFileId1,
          ownerId: statsTestUserId,
          chunkIndex: 1,
          content: 'Stats test chunk 2',
          tokenCount: 4,
        },
      ]

      const file2Chunks: InsertChunkInput[] = [
        {
          fileId: statsTestFileId2,
          ownerId: statsTestUserId,
          chunkIndex: 0,
          content: 'Stats test chunk 3',
          tokenCount: 4,
        },
      ]

      await repository.bulkInsert(file1Chunks)
      await repository.bulkInsert(file2Chunks)
    })

    afterAll(async () => {
      await repository.deleteByFile(statsTestUserId, statsTestFileId1)
      await repository.deleteByFile(statsTestUserId, statsTestFileId2)
    })

    it('should calculate accurate chunk statistics', async () => {
      const stats = await repository.getChunkStats(statsTestUserId)
      
      expect(stats.totalChunks).toBeGreaterThanOrEqual(3)
      expect(stats.totalFiles).toBeGreaterThanOrEqual(2)
      expect(stats.avgChunksPerFile).toBeGreaterThan(0)
      
      // Should have reasonable averages
      expect(stats.avgChunksPerFile).toBe(stats.totalChunks / stats.totalFiles)
    })

    it('should get user chunks with pagination', async () => {
      const firstPage = await repository.getByUser(statsTestUserId, 2, 0)
      const secondPage = await repository.getByUser(statsTestUserId, 2, 2)
      
      expect(firstPage.length).toBeLessThanOrEqual(2)
      expect(secondPage.length).toBeGreaterThanOrEqual(0)
      
      // Should not have overlapping results
      const firstPageIds = firstPage.map(chunk => chunk.id)
      const secondPageIds = secondPage.map(chunk => chunk.id)
      const overlap = firstPageIds.filter(id => secondPageIds.includes(id))
      expect(overlap).toHaveLength(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid user IDs gracefully', async () => {
      const result = await repository.getByFile('invalid-user', 'invalid-file')
      expect(result).toEqual([])
    })

    it('should handle empty search queries', async () => {
      const searchInput: SearchChunksInput = {
        userId: testUserId,
        query: '',
        limit: 5,
      }

      // Should not throw, but may return empty results
      await expect(repository.searchByText(searchInput)).rejects.toThrow('Validation Error')
    })

    it('should validate required fields in operations', async () => {
      await expect(repository.bulkInsert([
        {
          fileId: '',
          ownerId: testUserId,
          chunkIndex: 0,
          content: 'test',
        } as InsertChunkInput
      ])).rejects.toThrow()

      await expect(repository.deleteByFile('', 'file-id')).rejects.toThrow()
      await expect(repository.getByFile(testUserId, '')).rejects.toThrow()
    })
  })
})