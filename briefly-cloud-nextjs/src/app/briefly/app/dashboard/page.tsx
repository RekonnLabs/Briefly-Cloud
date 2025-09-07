import { headers } from 'next/headers'
import { getCurrentUserData } from '@/app/lib/user-data'
import DashboardClient from './DashboardClient'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic' // no static caching for authed pages

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

export default async function DashboardPage() {
  // Optional: cheap check if middleware authenticated this request
  const h = await headers()
  const hasSession = h.get('x-sb-session') === '1'

  // If no session detected by middleware, show error
  if (!hasSession) {
    return (
      <DashboardError 
        error="Authentication session not found. Please sign in again." 
      />
    )
  }

  try {
    // Fetch complete user data including subscription information
    const { user, error } = await getCurrentUserData()

    // Handle user data fetch errors
    if (error) {
      console.error('Dashboard: Failed to fetch user data:', error)
      return (
        <DashboardError 
          error="Failed to load your account information. Please try refreshing the page." 
        />
      )
    }

    // Handle case where user data is not available
    if (!user) {
      console.error('Dashboard: User data not found despite valid session')
      return (
        <DashboardError 
          error="Your account information could not be found. Please contact support if this persists." 
        />
      )
    }

    // Successfully loaded user data, render dashboard
    return (
      <Suspense fallback={<DashboardLoading />}>
        <DashboardClient user={user} />
      </Suspense>
    )
  } catch (error) {
    // Handle unexpected errors during user data fetching
    console.error('Dashboard: Unexpected error fetching user data:', error)
    return (
      <DashboardError 
        error="An unexpected error occurred while loading your dashboard. Please try again." 
      />
    )
  }
}

