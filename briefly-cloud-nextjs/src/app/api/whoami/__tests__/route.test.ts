/**
 * Tests for /api/whoami endpoint
 * Verifies server-side auth status checking
 */

// Mock Supabase
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn()
}))

// Mock Request and Response constructors for Node.js environment
global.Request = jest.fn().mockImplementation((url: string, options?: any) => ({
  url,
  method: options?.method || 'GET',
  headers: {
    get: jest.fn().mockImplementation((name: string) => {
      if (name === 'cookie') {
        return 'sb-access-token=test-token; sb-refresh-token=test-refresh'
      }
      return null
    })
  },
  ...options
}))

global.Response = jest.fn().mockImplementation((body?: any, init?: any) => {
  const response = {
    json: jest.fn().mockResolvedValue(JSON.parse(body || '{}')),
    text: jest.fn().mockResolvedValue(body || ''),
    status: init?.status || 200,
    headers: new Map(Object.entries(init?.headers || {}))
  }
  
  // Add get method to headers
  response.headers.get = jest.fn().mockImplementation((name: string) => {
    return init?.headers?.[name] || init?.headers?.[name.toLowerCase()]
  })
  
  return response
})

import { createServerClient } from '@supabase/ssr'
import { GET } from '../route'

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>

describe('/api/whoami endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return user data for authenticated user', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      aud: 'authenticated'
    }

    const mockAuth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/api/whoami')
    const response = await GET(request)
    const data = await response.json()

    expect(data.user).toEqual(mockUser)
    expect(data.error).toBeNull()
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('should return null user for unauthenticated request', async () => {
    const mockAuth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/api/whoami')
    const response = await GET(request)
    const data = await response.json()

    expect(data.user).toBeNull()
    expect(data.error).toBeNull()
  })

  it('should return error message for auth errors', async () => {
    const mockAuth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT token' }
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/api/whoami')
    const response = await GET(request)
    const data = await response.json()

    expect(data.user).toBeNull()
    expect(data.error).toBe('Invalid JWT token')
  })

  it('should parse cookies correctly', async () => {
    const mockAuth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test' } },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/api/whoami')
    await GET(request)

    // Verify Supabase client was created with cookie parser
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({
        cookies: expect.objectContaining({
          get: expect.any(Function),
          set: expect.any(Function),
          remove: expect.any(Function)
        })
      })
    )
  })

  it('should handle missing cookies gracefully', async () => {
    // Mock request with no cookies
    const requestWithNoCookies = {
      url: 'http://localhost/api/whoami',
      method: 'GET',
      headers: {
        get: jest.fn().mockReturnValue(null)
      }
    } as any

    const mockAuth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const response = await GET(requestWithNoCookies)
    const data = await response.json()

    expect(data.user).toBeNull()
    expect(response.status).toBe(200)
  })
})
