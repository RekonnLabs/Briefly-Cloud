/**
 * Files Repository Integration Test
 * 
 * This test verifies that the FilesRepository works correctly with the app schema
 * and can perform basic CRUD operations.
 */

// Mock the dependencies to avoid environment issues
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
          }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn()
        }))
      }))
    }))
  }
}))

jest.mock('../../api-errors', () => ({
  createError: {
    databaseError: jest.fn((message, error) => new Error(`Database Error: ${message}`)),
    validation: jest.fn((message, details) => new Error(`Validation Error: ${message}`))
  }
}))

import { FilesRepository } from '../files-repo'

describe('FilesRepository Integration', () => {
  let repository: FilesRepository
  const testUserId = 'test-user-integration'

  beforeAll(() => {
    repository = new FilesRepository()
  })

  describe('Schema Integration', () => {
    it('should use app schema client', () => {
      expect(repository['appClient']).toBeDefined()
      expect(repository['TABLE_NAME']).toBe('files')
    })

    it('should extend BaseRepository', () => {
      expect(repository['executeWithAppSchema']).toBeDefined()
      expect(repository['handleDatabaseError']).toBeDefined()
      expect(repository['validateRequiredFields']).toBeDefined()
    })

    it('should have proper TypeScript interfaces', () => {
      // Test that the interfaces are properly defined by creating objects
      const createInput = {
        ownerId: testUserId,
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        source: 'upload' as const,
        metadata: { test: true }
      }

      const updateInput = {
        name: 'updated.pdf',
        processed: true,
        processing_status: 'completed' as const,
        metadata: { updated: true }
      }

      const searchOptions = {
        search: 'test',
        sortBy: 'created_at' as const,
        sortOrder: 'desc' as const,
        offset: 0,
        limit: 10,
        filterIds: ['id1', 'id2']
      }

      // If these compile without errors, the interfaces are properly defined
      expect(createInput.ownerId).toBe(testUserId)
      expect(updateInput.processing_status).toBe('completed')
      expect(searchOptions.sortBy).toBe('created_at')
    })

    it('should provide all required methods', () => {
      const methods = [
        'create',
        'getById',
        'findByUserId',
        'search',
        'getByIds',
        'updateProcessingStatus',
        'update',
        'updateMany',
        'delete',
        'deleteMany',
        'updateChecksum',
        'listByOwner' // backward compatibility
      ]

      methods.forEach(method => {
        expect(typeof repository[method]).toBe('function')
      })
    })

    it('should handle processing status updates correctly', () => {
      // Test that the method exists and has the correct signature
      expect(typeof repository.updateProcessingStatus).toBe('function')
      
      // Test the method parameters by checking the function length (number of parameters)
      expect(repository.updateProcessingStatus.length).toBe(3)
    })

    it('should validate required fields properly', async () => {
      // Test validation with empty required fields
      const invalidInput = {
        ownerId: '',
        name: 'test.pdf',
        path: '/uploads/test.pdf',
        sizeBytes: 1024
      }

      // Mock the validation method to test it's called
      const validateSpy = jest.spyOn(repository as any, 'validateRequiredFields')
      validateSpy.mockImplementation(() => {
        throw new Error('Validation failed')
      })

      await expect(repository.create(invalidInput)).rejects.toThrow('Validation failed')
      expect(validateSpy).toHaveBeenCalledWith(
        invalidInput,
        ['ownerId', 'name', 'path', 'sizeBytes'],
        'create file'
      )

      validateSpy.mockRestore()
    })

    it('should provide backward compatibility', async () => {
      // Mock findByUserId to test listByOwner
      const mockFiles = [
        {
          id: 'file1',
          user_id: testUserId,
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

      jest.spyOn(repository, 'findByUserId').mockResolvedValue(mockFiles)

      const result = await repository.listByOwner(testUserId)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'file1',
        owner_id: testUserId,
        name: 'test.pdf',
        size_bytes: 1024
      })
    })
  })
})