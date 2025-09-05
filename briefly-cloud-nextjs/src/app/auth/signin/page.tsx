'use client'

import { useMemo, useState } from 'react'
import { getSupabaseBrowser } from '@/app/lib/supabase-browser'

export default function SignInPage() {
  const [busy, setBusy] = useState<'google' | 'azure' | null>(null)

  // One browser client instance per mount
  const supabase = useMemo(() => getSupabaseBrowser(), [])

  async function signIn(provider: 'google' | 'azure') {
    try {
      setBusy(provider)
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        console.error('[signin] oauth error', error)
        setBusy(null)
      }
    } catch (e) {
      console.error('[signin] unexpected', e)
      setBusy(null)
    }
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

            {/* OAuth Providers */}
            <div className="space-y-4">
              <button
                onClick={() => signIn('google')}
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
                onClick={() => signIn('azure')}
                disabled={busy !== null}
                data-provider="azure-ad"
                className="w-full flex items-center justify-center px-6 py-3.5 border border-gray-600 rounded-xl text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H13z"/>
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