'use client'

/**
 * OAuth completion relay page
 *
 * Apideck opens the Google OAuth window via window.open() internally.
 * This means window.close() works on the child window regardless of whether
 * window.opener is accessible (browsers sometimes clear opener for security).
 *
 * Strategy:
 *   1. Always try to postMessage the original window if opener is accessible
 *   2. Always try window.close() — works if this window was opened via window.open()
 *   3. If window.close() is blocked (user navigated here directly), fall back
 *      to a dashboard redirect after a short delay so they don't get stuck
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function OAuthCompleteInner() {
  const searchParams = useSearchParams()
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    const provider = searchParams.get('provider') || 'google'
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')

    if (typeof window === 'undefined') return

    // Step 1: postMessage to opener if accessible
    const hasOpener = !!(window.opener && !window.opener.closed)
    if (hasOpener) {
      try {
        window.opener.postMessage(
          {
            type: 'BRIEFLY_OAUTH_COMPLETE',
            provider,
            connected: connected || null,
            error: error || null,
          },
          window.location.origin
        )
      } catch (e) {
        console.warn('[oauth-complete] postMessage blocked:', e)
      }
    }

    // Step 2: Always attempt window.close() — works when opened via window.open()
    // even if window.opener was cleared by the browser for security reasons
    setTimeout(() => {
      window.close()

      // Step 3: If still open after 800ms, the window wasn't opened by a script
      // (user navigated here directly). Redirect to dashboard so they don't get stuck.
      setTimeout(() => {
        setShowFallback(true)
        const params = new URLSearchParams()
        params.set('tab', 'storage')
        if (connected) params.set('connected', connected)
        if (error) params.set('error', error)
        window.location.replace(`/briefly/app/dashboard?${params.toString()}`)
      }, 800)
    }, 300)

  }, [searchParams])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        {!showFallback ? (
          <>
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm">Connected! Closing window…</p>
          </>
        ) : (
          <>
            <p className="text-green-400 text-sm font-medium">✓ Google Drive connected</p>
            <p className="text-gray-500 text-xs">Redirecting back to Briefly…</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OAuthCompleteInner />
    </Suspense>
  )
}
