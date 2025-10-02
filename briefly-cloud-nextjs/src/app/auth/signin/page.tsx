'use client'

import { useState, useEffect } from 'react'
import { OAUTH_ERROR_MESSAGES, DEFAULT_POST_LOGIN_PATH } from '@/app/lib/auth/constants'

type MessageType = 'signout_success' | 'signout_error' | null

export default function SignInPage() {
  const [busy, setBusy] = useState<'google' | 'azure' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [correlationId, setCorrelationId] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<MessageType>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  useEffect(() => {
    // Check for error parameters in URL
    const urlParams = new URLSearchParams(window.location.search)
    const error = urlParams.get('error')
    const corrId = urlParams.get('correlationId')
    const message = urlParams.get('message') as MessageType
    const feedbackErr = urlParams.get('feedbackError')
    
    // Handle OAuth errors
    if (error && error in OAUTH_ERROR_MESSAGES) {
      setErrorMessage(OAUTH_ERROR_MESSAGES[error as keyof typeof OAUTH_ERROR_MESSAGES])
      setCorrelationId(corrId)
    }
    
    // Handle feedback messages (signout success/error)
    if (message === 'signout_success' || message === 'signout_error') {
      setFeedbackMessage(message)
      if (message === 'signout_error' && feedbackErr) {
        setFeedbackError(feedbackErr)
      }
    }
    
    // Clear parameters from URL without page reload
    if (error || message) {
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('error')
      newUrl.searchParams.delete('correlationId')
      newUrl.searchParams.delete('message')
      newUrl.searchParams.delete('feedbackError')
      window.history.replaceState({}, '', newUrl.toString())
    }
  }, [])

  // Auto-dismiss success messages after 5 seconds
  useEffect(() => {
    if (feedbackMessage === 'signout_success') {
      const timer = setTimeout(() => {
        setFeedbackMessage(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [feedbackMessage])

  const go = (provider: 'google' | 'azure') => {
    setBusy(provider)
    setErrorMessage(null) // Clear any previous errors
    setFeedbackMessage(null) // Clear any feedback messages
    setFeedbackError(null)
    const next = new URLSearchParams(window.location.search).get('next') || DEFAULT_POST_LOGIN_PATH
    window.location.href = `/auth/start?provider=${provider}&next=${encodeURIComponent(next)}`
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

            {/* Success Message Display */}
            {feedbackMessage === 'signout_success' && (
              <div className="bg-green-900/50 border border-green-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-green-300 mb-1">
                      Successfully Signed Out
                    </h3>
                    <p className="text-sm text-green-200">
                      You have been securely signed out of your account.
                    </p>
                  </div>
                  <button
                    onClick={() => setFeedbackMessage(null)}
                    className="flex-shrink-0 text-green-400 hover:text-green-300 transition-colors"
                    aria-label="Dismiss message"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Signout Error Message Display */}
            {feedbackMessage === 'signout_error' && (
              <div className="bg-red-900/50 border border-red-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-300 mb-1">
                      Signout Error
                    </h3>
                    <p className="text-sm text-red-200">
                      {feedbackError || 'There was an issue signing you out. You have been logged out locally for security.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setFeedbackMessage(null)}
                    className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors"
                    aria-label="Dismiss message"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* OAuth Error Message Display */}
            {errorMessage && (
              <div className="bg-red-900/50 border border-red-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-300 mb-1">
                      Sign-in Error
                    </h3>
                    <p className="text-sm text-red-200">
                      {errorMessage}
                    </p>
                    {correlationId && (
                      <p className="text-xs text-red-400 mt-2 font-mono">
                        Reference ID: {correlationId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* OAuth Providers */}
            <div className="space-y-4">
              <button
                onClick={() => go('google')}
                disabled={busy !== null}
                data-provider="google"
                className="w-full flex items-center justify-center px-6 py-3.5 border border-gray-600 rounded-xl text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {busy === 'google' ? 'Signing in...' : 'Continue with Google'}
              </button>

              <button
                onClick={() => go('azure')}
                disabled={busy !== null}
                data-provider="azure-ad"
                className="w-full flex items-center justify-center px-6 py-3.5 border border-gray-600 rounded-xl text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H1z"/>
                  <path fill="#7fba00" d="M1 13h10v10H1z"/>
                  <path fill="#ffb900" d="M13 13h10v10H13z"/>
                </svg>
                {busy === 'azure' ? 'Signing in...' : 'Continue with Microsoft'}
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
