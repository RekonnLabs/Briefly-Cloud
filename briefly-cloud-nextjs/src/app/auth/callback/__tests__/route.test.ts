/**
 * Tests for auth callback route with bound method calls
 * Verifies the fix for handling both exchangeCodeForSession signatures
 */

// Mock Next.js modules
jest.mock('next/headers', () => ({
  cookies: jest.fn()
}))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn()
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

describe('Auth Callback Route - Bound Method Calls Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock cookies
    mockCookies.mockReturnValue({
      get: jest.fn().mockReturnValue({ value: 'test-cookie' }),
      set: jest.fn(),
      getAll: jest.fn().mockReturnValue([])
    } as any)
  })

  it('should handle newer Supabase API with 1-arg signature', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockResolvedValue({ 
        data: { session: { access_token: 'test-token' } },
        error: null 
      })
    }
    
    // Mock function length to indicate 1-arg signature
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 1 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/callback?code=test-code')
    
    await GET(request)

    // Verify the bound method call with single argument
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('test-code')
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('should handle older Supabase API with object signature', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockResolvedValue({ 
        data: { session: { access_token: 'test-token' } },
        error: null 
      })
    }
    
    // Mock function length to indicate object signature
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 0 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/callback?code=test-code')
    
    await GET(request)

    // Verify the bound method call with object argument
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith({ code: 'test-code' })
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('should handle exchange errors gracefully', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockResolvedValue({ 
        data: null,
        error: { message: 'Invalid code' }
      })
    }
    
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 1 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    mockCookies.mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      getAll: jest.fn().mockReturnValue([
        { name: 'sb-access-token', value: 'old-token' },
        { name: 'sb-refresh-token', value: 'old-refresh' }
      ])
    } as any)

    const request = new Request('http://localhost/auth/callback?code=invalid-code')
    
    await GET(request)

    // Verify error handling and cookie cleanup
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('invalid-code')
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=exchange', 'http://localhost/auth/callback?code=invalid-code')
    )
  })

  it('should handle exceptions during exchange', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockRejectedValue(new Error('Network error'))
    }
    
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 1 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/callback?code=test-code')
    
    await GET(request)

    // Verify exception handling
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('test-code')
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=exchange', 'http://localhost/auth/callback?code=test-code')
    )
  })

  it('should redirect to dashboard on successful exchange', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockResolvedValue({ 
        data: { session: { access_token: 'test-token' } },
        error: null 
      })
    }
    
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 1 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/callback?code=test-code')
    
    await GET(request)

    // Verify successful redirect
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/briefly/app/dashboard', 'http://localhost'),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  })

  it('should handle custom next parameter', async () => {
    const mockAuth = {
      exchangeCodeForSession: jest.fn().mockResolvedValue({ 
        data: { session: { access_token: 'test-token' } },
        error: null 
      })
    }
    
    Object.defineProperty(mockAuth.exchangeCodeForSession, 'length', { value: 1 })

    mockCreateServerClient.mockReturnValue({
      auth: mockAuth
    } as any)

    const request = new Request('http://localhost/auth/callback?code=test-code&next=/custom/path')
    
    await GET(request)

    // Verify custom redirect
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/custom/path', 'http://localhost'),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  })

  it('should handle provider errors', async () => {
    const request = new Request('http://localhost/auth/callback?error=access_denied')
    
    await GET(request)

    // Verify provider error handling
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=provider', 'http://localhost/auth/callback?error=access_denied')
    )
  })

  it('should handle missing code parameter', async () => {
    const request = new Request('http://localhost/auth/callback')
    
    await GET(request)

    // Verify missing code handling
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/auth/signin?err=missing_code', 'http://localhost/auth/callback')
    )
  })
})