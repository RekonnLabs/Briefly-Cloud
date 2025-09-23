import { UsersRepository, TIER_LIMITS } from '../users-repo'

// Mock the supabase clients
jest.mock('@/app/lib/supabase-clients', () => ({
  supabaseApp: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(),
          single: jest.fn()
        })),
        in: jest.fn(() => ({}))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({}))
      }))
    }))
  },
  supabasePrivate: {},
  supabasePublic: {}
}))

// Mock api-errors
jest.mock('@/app/lib/api-errors', () => ({
  createError: {
    databaseError: jest.fn((message, error) => new Error(message)),
    validation: jest.fn((message, details) => new Error(message))
  }
}))

describe('UsersRepository', () => {
  let usersRepo: UsersRepository
  let mockSupabaseApp: any

  beforeEach(() => {
    jest.clearAllMocks()
    usersRepo = new UsersRepository()
    
    // Get the mocked supabase client
    const { supabaseApp } = require('@/app/lib/supabase-clients')
    mockSupabaseApp = supabaseApp
  })

  describe('getById', () => {
    it('should fetch user profile by ID successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'pro',
        documents_uploaded: 5,
        documents_limit: 500,
        storage_used_bytes: 1024000,
        storage_limit_bytes: 1073741824,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        metadata: { test: 'data' }
      }

      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockUser, error: null })
          })
        })
      })

      const result = await usersRepo.getById('user-123')

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'pro',
        documents_uploaded: 5,
        documents_limit: 500,
        storage_used_bytes: 1024000,
        storage_limit_bytes: 1073741824,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        last_login_at: null,
        metadata: { test: 'data' }
      })

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('users')
    })

    it('should return null when user not found', async () => {
      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })

      const result = await usersRepo.getById('nonexistent-user')
      expect(result).toBeNull()
    })

    it('should handle database errors', async () => {
      const mockError = { message: 'Database error', code: 'DB_ERROR' }
      
      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: mockError })
          })
        })
      })

      await expect(usersRepo.getById('user-123')).rejects.toThrow()
    })

    it('should validate required fields', async () => {
      await expect(usersRepo.getById('')).rejects.toThrow()
    })
  })

  describe('create', () => {
    it('should create user profile with default tier', async () => {
      const mockCreatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'free',
        documents_uploaded: 0,
        documents_limit: 25,
        storage_used_bytes: 0,
        storage_limit_bytes: 104857600,
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      mockSupabaseApp.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockCreatedUser, error: null })
          })
        })
      })

      const result = await usersRepo.create({
        id: 'user-123',
        email: 'test@example.com'
      })

      expect(result.subscription_tier).toBe('free')
      expect(result.documents_limit).toBe(TIER_LIMITS.free.documents_limit)
      expect(result.storage_limit_bytes).toBe(TIER_LIMITS.free.storage_limit_bytes)
    })

    it('should validate required fields', async () => {
      await expect(usersRepo.create({ id: '', email: 'test@example.com' })).rejects.toThrow()
      await expect(usersRepo.create({ id: 'user-123', email: '' })).rejects.toThrow()
    })
  })

  describe('updateUsage', () => {
    it('should update user usage statistics', async () => {
      mockSupabaseApp.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      })

      await usersRepo.updateUsage('user-123', {
        documents_uploaded: 10,
        storage_used_bytes: 2048000
      })

      expect(mockSupabaseApp.from).toHaveBeenCalledWith('users')
      const updateCall = mockSupabaseApp.from().update
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          documents_uploaded: 10,
          storage_used_bytes: 2048000,
          updated_at: expect.any(String)
        })
      )
    })

    it('should skip update if only updated_at would be changed', async () => {
      mockSupabaseApp.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      })

      await usersRepo.updateUsage('user-123', {})

      expect(mockSupabaseApp.from).not.toHaveBeenCalled()
    })
  })

  describe('updateTier', () => {
    it('should update user tier and limits', async () => {
      mockSupabaseApp.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      })

      await usersRepo.updateTier('user-123', 'pro')

      const updateCall = mockSupabaseApp.from().update
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_tier: 'pro',
          documents_limit: TIER_LIMITS.pro.documents_limit,
          storage_limit_bytes: TIER_LIMITS.pro.storage_limit_bytes,
          updated_at: expect.any(String)
        })
      )
    })
  })

  describe('getUsageStats', () => {
    it('should fetch user usage statistics', async () => {
      const mockStats = {
        documents_uploaded: 10,
        documents_limit: 500,
        storage_used_bytes: 2048000,
        storage_limit_bytes: 1073741824,
        subscription_tier: 'pro'
      }

      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockStats, error: null })
          })
        })
      })

      const result = await usersRepo.getUsageStats('user-123')

      expect(result).toEqual({
        documents_uploaded: 10,
        documents_limit: 500,
        storage_used_bytes: 2048000,
        storage_limit_bytes: 1073741824,
        subscription_tier: 'pro'
      })
    })

    it('should return null when user not found', async () => {
      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })

      const result = await usersRepo.getUsageStats('nonexistent-user')
      expect(result).toBeNull()
    })
  })

  describe('checkUsageLimits', () => {
    it('should check usage limits and return availability', async () => {
      const mockStats = {
        documents_uploaded: 20,
        documents_limit: 25,
        storage_used_bytes: 50 * 1024 * 1024, // 50MB
        storage_limit_bytes: 100 * 1024 * 1024, // 100MB
        subscription_tier: 'free'
      }

      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockStats, error: null })
          })
        })
      })

      const result = await usersRepo.checkUsageLimits('user-123')

      expect(result).toEqual({
        canUploadFiles: true,
        canUseStorage: true,
        documentsRemaining: 5, // 25 - 20
        storageRemaining: 50 * 1024 * 1024 // 100MB - 50MB
      })
    })

    it('should return false when limits are exceeded', async () => {
      const mockStats = {
        documents_uploaded: 25,
        documents_limit: 25,
        storage_used_bytes: 100 * 1024 * 1024, // 100MB
        storage_limit_bytes: 100 * 1024 * 1024, // 100MB
        subscription_tier: 'free'
      }

      mockSupabaseApp.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockStats, error: null })
          })
        })
      })

      const result = await usersRepo.checkUsageLimits('user-123')

      expect(result).toEqual({
        canUploadFiles: false,
        canUseStorage: false,
        documentsRemaining: 0,
        storageRemaining: 0
      })
    })
  })

  describe('TIER_LIMITS', () => {
    it('should have correct tier limits', () => {
      expect(TIER_LIMITS.free).toEqual({
        documents_limit: 25,
        storage_limit_bytes: 100 * 1024 * 1024
      })

      expect(TIER_LIMITS.pro).toEqual({
        documents_limit: 500,
        storage_limit_bytes: 1024 * 1024 * 1024
      })

      expect(TIER_LIMITS.pro_byok).toEqual({
        documents_limit: 5000,
        storage_limit_bytes: 10 * 1024 * 1024 * 1024
      })
    })
  })
})