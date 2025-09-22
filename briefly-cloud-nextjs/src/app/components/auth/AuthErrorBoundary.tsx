/**
 * Auth Error Boundary
 * 
 * Catches authentication errors and provides fallback UI
 * to prevent auth failures from breaking the entire app.
 */

'use client'

import { Component, ReactNode } from 'react'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Auth Error Boundary caught an error:', error, errorInfo)
    
    // Log to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      // Could integrate with Sentry or other monitoring here
    }
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return this.props.fallback || (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
              <div className="text-center space-y-4">
                <div className="mb-6">
                  <img 
                    src="/Briefly_Logo_120px.png" 
                    alt="Briefly Logo" 
                    className="w-20 h-20 mx-auto mb-4"
                  />
                </div>
                
                <div className="text-red-400 mb-4">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                
                <h2 className="text-xl font-semibold text-white mb-2">
                  Authentication Error
                </h2>
                
                <p className="text-gray-300 text-sm mb-6">
                  Something went wrong with authentication. Please try refreshing the page.
                </p>
                
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Refresh Page
                </button>
                
                <a
                  href="/auth/signin"
                  className="block w-full px-4 py-2 mt-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-center"
                >
                  Go to Sign In
                </a>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
