'use client'

import { useRouter } from 'next/navigation'
import AuthForm from '@/app/components/auth/AuthForm'

export default function SignInPage() {
  const router = useRouter()

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data.token) {
          // Store token for legacy compatibility
          localStorage.setItem('supabase_token', data.data.token)
          
          // Check if there's a callback URL to redirect to
          const urlParams = new URLSearchParams(window.location.search)
          const callbackUrl = urlParams.get('callbackUrl')
          
          if (callbackUrl) {
            window.location.href = callbackUrl
          } else {
            // Default redirect to the main app
            window.location.href = 'https://rekonnlabs.com/briefly/app'
          }
        } else {
          throw new Error(data.error || 'Login failed')
        }
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Login failed')
      }
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  const handleSignup = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || 'Signup failed')
        }
        // Success message will be shown by the AuthForm component
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Signup failed')
      }
    } catch (error) {
      console.error('Signup failed:', error)
      throw error
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <AuthForm onLogin={handleLogin} onSignup={handleSignup} />
        </div>
      </div>
    </div>
  )
}