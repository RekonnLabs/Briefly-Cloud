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
            // Decode the callback URL and use router for internal navigation
            const decodedUrl = decodeURIComponent(callbackUrl)
            if (decodedUrl.includes('rekonnlabs.com/briefly/app')) {
              // Extract the path and redirect internally
              router.push('/briefly/app/dashboard')
            } else {
              window.location.href = decodedUrl
            }
          } else {
            // Default redirect to the main app dashboard
            router.push('/briefly/app/dashboard')
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
          <AuthForm onLogin={handleLogin} onSignup={handleSignup} />
        </div>
      </div>
    </div>
  )
}