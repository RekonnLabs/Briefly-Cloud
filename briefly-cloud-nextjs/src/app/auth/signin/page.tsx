/**
 * Supabase Auth Sign In Page
 * 
 * This page handles user authentication using Supabase Auth
 * with Google and Microsoft OAuth providers.
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/app/lib/auth/supabase-auth'
import { useAuth } from '@/app/components/auth/SupabaseAuthProvider'

// Force dynamic rendering for pages with search params
export const dynamic = 'force-dynamic'

function SignInContent() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  
  const callbackUrl = searchParams.get('callbackUrl') || '/briefly/app/dashboard'
  const supabase = createSupabaseBrowserClient()

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push(callbackUrl)
    }
  }, [user, loading, router, callbackUrl])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
          scopes: 'openid email profile'
        }
      })
      
      if (error) {
        throw error
      }
    } catch (err: any) {
      console.error('Google sign in error:', err)
      setError('Failed to sign in with Google. Please try again.')
      setIsLoading(false)
    }
  }

  const handleMicrosoftSignIn = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
          scopes: 'openid email profile'
        }
      })
      
      if (error) {
        throw error
      }
    } catch (err: any) {
      console.error('Microsoft sign in error:', err)
      setError('Failed to sign in with Microsoft. Please try again.')
      setIsLoading(false)
    }
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Checking authentication...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
          <div className="space-y-8">
            <div className="text-center">
              <div className="mb-6">
                <img 
                  src="/Briefly_Logo_120px.png" 
                  alt="Briefly Logo" 
                  className="w-20 h-20 mx-auto mb-4"
                />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Welcome to Briefly
              </h1>
              <p className="text-gray-300 text-sm">
                Sign in to continue to your AI document assistant
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-300 font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* OAuth Providers */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center px-6 py-3.5 border border-gray-600 rounded-xl text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Continue with Google'}
              </button>

              <button
                type="button"
                onClick={handleMicrosoftSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center px-6 py-3.5 border border-gray-600 rounded-xl text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                  <path fill="#7fba00" d="M1 13h10v10H1z"/>
                  <path fill="#ffb900" d="M13 13h10v10H13z"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Continue with Microsoft'}
              </button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400">
                By signing in, you agree to our{' '}
                <a href="/terms" className="text-blue-400 hover:text-blue-300 underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy
                </a>
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                🔒 Secure authentication powered by Supabase
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}