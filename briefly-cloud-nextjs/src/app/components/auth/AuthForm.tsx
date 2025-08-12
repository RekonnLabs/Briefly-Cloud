'use client'

import React, { useState } from 'react'

interface AuthFormProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSignup: (email: string, password: string) => Promise<void>
}

export default function AuthForm({ onLogin, onSignup }: AuthFormProps) {
  // Check URL parameters to determine initial mode
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const mode = urlParams?.get('mode')
  const [isLogin, setIsLogin] = useState(mode !== 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleModeSwitch = () => {
    setIsLogin(!isLogin)
    setError('')
    setSuccess('')
    setEmail('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isLogin) {
        await onLogin(email, password)
      } else {
        await onSignup(email, password)
        setSuccess('Account created successfully! Please check your email for a confirmation link, then sign in.')
        setIsLogin(true) // Switch to login mode after successful signup
        setEmail('') // Clear form fields
        setPassword('')
      }
    } catch (err: unknown) {
      let errorMessage = err instanceof Error ? err.message : 'Authentication failed'

      // Provide more user-friendly error messages
      if (errorMessage.includes('Invalid email or password')) {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.'
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and click the confirmation link before signing in.'
      } else if (errorMessage.includes('User already registered')) {
        errorMessage = 'An account with this email already exists. Please sign in instead.'
        setIsLogin(true)
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }



  return (
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
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-gray-300 text-sm">
          {isLogin ? 'Sign in to continue to your documents' : 'Get started with your AI assistant'}
        </p>
      </div>



      {/* Mode indicator tabs */}
      <div className="flex bg-gray-800 rounded-xl p-1.5 border border-gray-700">
        <button
          type="button"
          onClick={() => !isLogin && handleModeSwitch()}
          className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            isLogin
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => isLogin && handleModeSwitch()}
          className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            !isLogin
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {success && (
          <div className="p-4 bg-green-900/20 border border-green-800 rounded-xl">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-green-300 font-medium">{success}</p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-800 text-white placeholder-gray-400"
              placeholder="Enter your email address"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-800 text-white placeholder-gray-400"
              placeholder="Enter your password"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
              {isLogin ? 'Signing in...' : 'Creating account...'}
            </div>
          ) : (
            isLogin ? 'Sign In' : 'Create Account'
          )}
        </button>
      </form>
    </div>
  )
}