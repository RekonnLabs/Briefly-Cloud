'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/app/lib/supabase-browser'
import DashboardClient from './DashboardClient'
import { CompleteUserData } from '@/app/lib/user-data-types'

interface DefensiveDashboardWrapperProps {
  user: CompleteUserData
}

export function DefensiveDashboardWrapper({ user }: DefensiveDashboardWrapperProps) {
  const supabase = getSupabaseBrowser()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    let mounted = true
    
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (mounted) {
        setSession(s)
      }
    })
    
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading session…</p>
        </div>
      </div>
    )
  }

  // From here on, server already gated; this is just belt-and-suspenders
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6">
            <div className="text-red-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Session Expired</h2>
            <p className="text-gray-300 mb-4">Your session has expired. Please sign in again.</p>
            <a
              href="/auth/signin"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Render the real dashboard
  return <DashboardClient user={user} />
}
