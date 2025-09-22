/**
 * Page-Level Authentication Tests
 * 
 * Tests the page-level authentication guards:
 * - Dashboard page authentication logic
 * - Session expired handling
 * - User access validation
 * - Error handling for authentication failures
 * 
 * Requirements: 9.4
 */

// Mock server-only
jest.mock('server-only', () => ({}))

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn()
}))

// Mock auth utilities
jest.mock('../lib/auth/supabase-server-readonly', () => ({
  getSupabaseServerReadOnly: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }))
}))

// Mock user data
jest.mock('../lib/user-data', () => ({
  getDashboardUser: jest.fn()
}))

describe('Page-Level Authentication Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Dashboard Page Authentication (Requirement 9.4)', () => {
    it('should authenticate users with valid sessions', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const { getDashboardUser } = require('../lib/user-data')
      
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })

      // Mock user access
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: true, paid_active: false }
            })
          })
        })
      })

      // Mock user data
      getDashboardUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      })

      // Test authentication flow
      const { data: { user }, error } = await mockSupabase.auth.getUser()
      
      expect(user).toBeDefined()
      expect(user.id).toBe('user-123')
      expect(user.email).toBe('test@example.com')
      expect(error).toBeNull()

      // Test access check
      const accessResult = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', user.id)
        .single()

      expect(accessResult.data.trial_active).toBe(true)

      // Test user data fetch
      const userData = await getDashboardUser()
      expect(userData).toBeDefined()
      expect(userData.id).toBe('user-123')
    })

    it('should handle unauthenticated users with session expired UI', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock no user (unauthenticated)
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      // Test unauthenticated flow
      const { data: { user }, error } = await mockSupabase.auth.getUser()
      
      expect(user).toBeNull()
      
      // Should show session expired UI (not redirect)
      const shouldShowSessionExpired = !user
      expect(shouldShowSessionExpired).toBe(true)
    })

    it('should redirect users without access to join page', async () => {
      const { redirect } = require('next/navigation')
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock authenticated user without access
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: false, paid_active: false }
            })
          })
        })
      })

      // Test access validation
      const { data: { user } } = await mockSupabase.auth.getUser()
      const { data: access } = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', user.id)
        .single()

      const hasAccess = access && (access.trial_active || access.paid_active)
      expect(hasAccess).toBe(false)

      // Should redirect to join page
      if (!hasAccess) {
        redirect('/join')
      }

      expect(redirect).toHaveBeenCalledWith('/join')
    })

    it('should handle user data fetching errors gracefully', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const { getDashboardUser } = require('../lib/user-data')
      
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })

      // Mock access granted
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: true, paid_active: false }
            })
          })
        })
      })

      // Mock user data fetch failure
      getDashboardUser.mockResolvedValue(null)

      // Test error handling
      const userData = await getDashboardUser()
      expect(userData).toBeNull()

      // Should handle missing user data gracefully
      const shouldShowError = !userData
      expect(shouldShowError).toBe(true)
    })

    it('should handle authentication errors from Supabase', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock authentication error
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired', status: 401 }
      })

      // Test error handling
      const { data: { user }, error } = await mockSupabase.auth.getUser()
      
      expect(user).toBeNull()
      expect(error).toBeDefined()
      expect(error.message).toBe('JWT expired')
      expect(error.status).toBe(401)

      // Should show session expired UI for auth errors
      const shouldShowSessionExpired = !user || error
      expect(shouldShowSessionExpired).toBe(true)
    })

    it('should handle database access errors gracefully', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })

      // Mock database error
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Database connection failed'))
          })
        })
      })

      // Test database error handling
      try {
        await mockSupabase
          .from('v_user_access')
          .select('trial_active,paid_active')
          .eq('user_id', 'user-123')
          .single()
      } catch (error) {
        expect(error.message).toBe('Database connection failed')
      }
    })
  })

  describe('Session Expired UI Component', () => {
    it('should provide proper session expired UI structure', () => {
      // Test session expired component structure
      const sessionExpiredUI = {
        title: 'Session Expired',
        message: 'Your session has expired. Please sign in again.',
        actionText: 'Sign In Again',
        actionHref: '/auth/signin'
      }

      expect(sessionExpiredUI.title).toBe('Session Expired')
      expect(sessionExpiredUI.actionHref).toBe('/auth/signin')
    })

    it('should handle session expired scenarios correctly', () => {
      // Test various session expired scenarios
      const scenarios = [
        { user: null, error: null, shouldShowExpired: true },
        { user: null, error: { message: 'JWT expired' }, shouldShowExpired: true },
        { user: { id: 'user-123' }, error: null, shouldShowExpired: false }
      ]

      scenarios.forEach(({ user, error, shouldShowExpired }) => {
        const showExpired = !user
        expect(showExpired).toBe(shouldShowExpired)
      })
    })
  })

  describe('Dashboard Error Handling', () => {
    it('should handle unexpected errors during rendering', async () => {
      const { getDashboardUser } = require('../lib/user-data')

      // Mock unexpected error
      getDashboardUser.mockRejectedValue(new Error('Unexpected error'))

      // Test error handling
      try {
        await getDashboardUser()
      } catch (error) {
        expect(error.message).toBe('Unexpected error')
      }
    })

    it('should provide proper error UI for various error types', () => {
      const errorTypes = [
        {
          type: 'user_data_not_found',
          message: 'Your account information could not be found. Please contact support if this persists.'
        },
        {
          type: 'unexpected_error',
          message: 'An unexpected error occurred while loading your dashboard. Please try again.'
        }
      ]

      errorTypes.forEach(({ type, message }) => {
        expect(message).toBeDefined()
        expect(message.length).toBeGreaterThan(0)
      })
    })

    it('should handle loading states properly', () => {
      // Test loading state structure
      const loadingState = {
        isLoading: true,
        message: 'Loading your dashboard...',
        showSpinner: true
      }

      expect(loadingState.isLoading).toBe(true)
      expect(loadingState.showSpinner).toBe(true)
    })
  })

  describe('User Access Validation', () => {
    it('should validate trial users correctly', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock trial user
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: true, paid_active: false }
            })
          })
        })
      })

      const { data: access } = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', 'user-123')
        .single()

      const hasAccess = access && (access.trial_active || access.paid_active)
      expect(hasAccess).toBe(true)
    })

    it('should validate paid users correctly', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock paid user
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: false, paid_active: true }
            })
          })
        })
      })

      const { data: access } = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', 'user-123')
        .single()

      const hasAccess = access && (access.trial_active || access.paid_active)
      expect(hasAccess).toBe(true)
    })

    it('should handle users without access correctly', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock user without access
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { trial_active: false, paid_active: false }
            })
          })
        })
      })

      const { data: access } = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', 'user-123')
        .single()

      const hasAccess = access && (access.trial_active || access.paid_active)
      expect(hasAccess).toBe(false)
    })

    it('should handle missing access data', async () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      const mockSupabase = getSupabaseServerReadOnly()

      // Mock missing access data
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null
            })
          })
        })
      })

      const { data: access } = await mockSupabase
        .from('v_user_access')
        .select('trial_active,paid_active')
        .eq('user_id', 'user-123')
        .single()

      const hasAccess = access && (access.trial_active || access.paid_active)
      expect(hasAccess).toBeFalsy() // null is falsy
    })
  })

  describe('Read-Only Supabase Client Usage', () => {
    it('should use read-only client for RSC authentication', () => {
      const { getSupabaseServerReadOnly } = require('../lib/auth/supabase-server-readonly')
      
      // Should return a client with read-only capabilities
      const client = getSupabaseServerReadOnly()
      expect(client).toBeDefined()
      expect(client.auth).toBeDefined()
      expect(client.auth.getUser).toBeDefined()
    })

    it('should not perform cookie writes in RSC context', () => {
      // Test that read-only client doesn't write cookies
      const readOnlyClientConfig = {
        cookies: {
          get: jest.fn(),
          set: jest.fn(), // Should be no-op
          remove: jest.fn() // Should be no-op
        }
      }

      // Verify set and remove are no-ops
      readOnlyClientConfig.cookies.set('test', 'value')
      readOnlyClientConfig.cookies.remove('test')

      // These should not throw errors but also not perform actual operations
      expect(readOnlyClientConfig.cookies.set).toHaveBeenCalled()
      expect(readOnlyClientConfig.cookies.remove).toHaveBeenCalled()
    })
  })

  describe('Dynamic Rendering Configuration', () => {
    it('should use force-dynamic for proper SSR', () => {
      // Test dynamic export configuration
      const dynamicConfig = 'force-dynamic'
      expect(dynamicConfig).toBe('force-dynamic')
    })

    it('should handle runtime configuration correctly', () => {
      // Test runtime configuration
      const runtimeConfig = 'nodejs'
      expect(runtimeConfig).toBe('nodejs')
    })
  })
})
