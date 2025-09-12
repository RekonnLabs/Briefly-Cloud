import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'
import { getDashboardUser } from '@/app/lib/user-data'
import { DefensiveDashboardWrapper } from './DefensiveDashboardWrapper'
import { Suspense } from 'react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // never cache user-specific page

// Loading component for dashboard
function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
        <p className="text-gray-300">Loading your dashboard...</p>
      </div>
    </div>
  )
}

// Error component for dashboard
function DashboardError({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6">
          <div className="text-red-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Dashboard</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          {retry && (
            <button
              onClick={retry}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Session expired component
function SessionExpired() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
          <div className="text-yellow-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Session Expired</h2>
          <p className="text-gray-300 mb-4">Your session has expired. Please sign in again.</p>
          <a
            href="/auth/signin"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign In Again
          </a>
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = getSupabaseServerReadOnly()

  console.log('[dashboard] Checking user session...')
  const { data: { user }, error } = await supabase.auth.getUser()

  console.log('[dashboard] User check result:', {
    user: user ? user.email : 'null',
    error: error?.message
  })

  // No session? Show session expired UI
  if (!user) {
    console.log('[dashboard] No user found, showing session expired')
    return <SessionExpired />
  }

  console.log('[dashboard] User found, rendering dashboard for:', user.email)

  // Simple dashboard for now - just show welcome message
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8">
          <div className="text-center">
            <div className="mb-6">
              <img
                src="/Briefly_Logo_120px.png"
                alt="Briefly Logo"
                className="w-20 h-20 mx-auto mb-4"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">
              Welcome to Briefly!
            </h1>
            <p className="text-gray-300 mb-4">
              Hello, {user.email}
            </p>
            <p className="text-sm text-gray-400">
              Dashboard is loading successfully! 🎉
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

