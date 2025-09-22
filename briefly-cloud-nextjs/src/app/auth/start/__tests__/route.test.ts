/**
 * Tests for auth start route - server-side PKCE initiation
 * Verifies the fix for PKCE verifier cookie issues
 */

// Mock Next.js modules
jest.mock('next/headers', () => ({
  cookies: jest.fn()
}))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn(),
    json: jest.fn()
  }
}))

// Mock Supabase
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn()
}))

// Mock Request constructor for Node.js environment
global.Request = jest.fn().mockImplementation((url: string, options?: any) => ({
  url,
  method: options?.method || 'GET',
  headers: {
    get: jest.fn().mockReturnValue('application/json')
  },
  ...options
}))

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { GET } from '../route'

const mockCookies = cookies as jest.MockedFunction<typeof cookies>
const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>
const mockRedirect = NextResponse.redirect as jest.MockedFunction<typeof NextResponse.redirect>
const mockJson = NextResponse.json as jest.MockedFunction<typeof NextResponse.json>

describe('Auth Start Route - Server-side PKCE Initiation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock cookies
    mockCookies.mockReturnValue({
      get: jest.fn().mockReturnValue({ value: 'test-cookie' }),
      set: jest.fn(),
      getAll: jest.fn().mockReturnValue([])
    } as any)
  })

  it('should initiate OAuth with Google provider', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/oauth/authorize?...' },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/start?provider=google')
    
    await GET(request)

    // Verify OAuth initiation with correct parameters
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost/auth/callback'
      }
    })

    // Verify redirect to OAuth provider
    expect(mockRedirect).toHaveBeenCalledWith(
      'https://accounts.google.com/oauth/authorize?...',
      302
    )
  })

  it('should initiate OAuth with Azure provider', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: 'https://login.microsoftonline.com/oauth/authorize?...' },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/start?provider=azure')
    
    await GET(request)

    // Verify OAuth initiation with Azure provider
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'azure',
      options: {
        redirectTo: 'http://localhost/auth/callback'
      }
    })

    // Verify redirect to OAuth provider
    expect(mockRedirect).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/oauth/authorize?...',
      302
    )
  })

  it('should return error for missing provider', async () => {
    const request = new Request('http://localhost/auth/start')
    
    await GET(request)

    // Verify error response
    expect(mockJson).toHaveBeenCalledWith(
      { error: 'missing provider' },
      { status: 400 }
    )
  })

  it('should handle OAuth initiation error', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'OAuth configuration error' }
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/start?provider=google')
    
    await GET(request)

    // Verify error redirect
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=start', 'http://localhost/auth/start?provider=google')
    )
  })

  it('should handle missing OAuth URL in response', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: null },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/start?provider=google')
    
    await GET(request)

    // Verify error redirect when URL is missing
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=start', 'http://localhost/auth/start?provider=google')
    )
  })

  it('should use server-side cookie configuration', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/oauth/authorize?...' },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/start?provider=google')
    
    await GET(request)

    // Verify Supabase client was created with server-side cookie configuration
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

  it('should handle invalid provider gracefully', async () => {
    const request = new Request('http://localhost/auth/start?provider=invalid')
    
    await GET(request)

    // Should still attempt OAuth (Supabase will handle invalid provider)
    // Or we could add validation - for now, let Supabase handle it
    expect(mockCreateServerClient).toHaveBeenCalled()
  })

  it('should preserve origin in redirect URL', async () => {
    const mockAuth = {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/oauth/authorize?...' },
        error: null
      })
    }

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('https://briefly.rekonnlabs.com/auth/start?provider=google')
    
    await GET(request)

    // Verify redirect URL uses correct origin
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://briefly.rekonnlabs.com/auth/callback'
      }
    })
  })
})
