/**
 * Tests for BaseRepository class
 */

import { BaseRepository } from '../base-repo'
import { supabaseApp, supabasePrivate, supabasePublic } from '@/app/lib/supabase-clients'

// Mock the supabase clients
jest.mock('@/app/lib/supabase-clients', () => ({
  supabaseApp: { from: jest.fn() },
  supabasePrivate: { from: jest.fn() },
  supabasePublic: { from: jest.fn() }
}))

// Test implementation of BaseRepository
class TestRepository extends BaseRepository {
  async testAppOperation() {
    return this.executeWithAppSchema(async (client) => {
      return client.from('test_table').select('*')
    })
  }

  async testPrivateOperation() {
    return this.executeWithPrivateSchema(async (client) => {
      return client.rpc('test_function')
    })
  }

  async testPublicOperation() {
    return this.executeWithPublicSchema(async (client) => {
      return client.from('test_view').select('*')
    })
  }

  async testValidation() {
    this.validateRequiredFields(
      { name: 'test', email: 'test@example.com' },
      ['name', 'email'],
      'test validation'
    )
  }

  async testSanitization() {
    return this.sanitizeInput({
      name: 'test',
      email: 'test@example.com',
      undefined_field: undefined,
      null_field: null,
      empty_field: ''
    })
  }
}

describe('BaseRepository', () => {
  let testRepo: TestRepository

  beforeEach(() => {
    testRepo = new TestRepository()
    jest.clearAllMocks()
  })

  describe('Schema client access', () => {
    it('should provide access to app client', () => {
      expect(testRepo['appClient']).toBe(supabaseApp)
    })

    it('should provide access to private client', () => {
      expect(testRepo['privateClient']).toBe(supabasePrivate)
    })

    it('should provide access to public client', () => {
      expect(testRepo['publicClient']).toBe(supabasePublic)
    })
  })

  describe('Schema operations', () => {
    it('should execute operations with app schema', async () => {
      const mockResult = { data: [{ id: 1 }], error: null }
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockResult)
      })
      ;(supabaseApp as any).from = mockFrom

      const result = await testRepo.testAppOperation()
      
      expect(mockFrom).toHaveBeenCalledWith('test_table')
      expect(result).toEqual(mockResult)
    })

    it('should execute operations with private schema', async () => {
      const mockResult = { data: 'success', error: null }
      const mockRpc = jest.fn().mockResolvedValue(mockResult)
      ;(supabasePrivate as any).rpc = mockRpc

      const result = await testRepo.testPrivateOperation()
      
      expect(mockRpc).toHaveBeenCalledWith('test_function')
      expect(result).toEqual(mockResult)
    })

    it('should execute operations with public schema', async () => {
      const mockResult = { data: [{ id: 1 }], error: null }
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockResult)
      })
      ;(supabasePublic as any).from = mockFrom

      const result = await testRepo.testPublicOperation()
      
      expect(mockFrom).toHaveBeenCalledWith('test_view')
      expect(result).toEqual(mockResult)
    })
  })

  describe('Input validation', () => {
    it('should validate required fields successfully', async () => {
      expect(() => testRepo.testValidation()).not.toThrow()
    })

    it('should throw error for missing required fields', () => {
      expect(() => {
        testRepo['validateRequiredFields'](
          { name: 'test' },
          ['name', 'email'],
          'test validation'
        )
      }).toThrow('Missing required fields in test validation: email')
    })

    it('should throw error for empty required fields', () => {
      expect(() => {
        testRepo['validateRequiredFields'](
          { name: '', email: 'test@example.com' },
          ['name', 'email'],
          'test validation'
        )
      }).toThrow('Missing required fields in test validation: name')
    })
  })

  describe('Input sanitization', () => {
    it('should remove undefined values', async () => {
      const result = testRepo.testSanitization()
      
      expect(result).toEqual({
        name: 'test',
        email: 'test@example.com',
        null_field: null,
        empty_field: ''
      })
      expect(result).not.toHaveProperty('undefined_field')
    })
  })
})