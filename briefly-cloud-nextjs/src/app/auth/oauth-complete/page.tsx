// @ts-nocheck — legacy route pending consolidation
'use client'

/**
 * OAuth completion relay page
 *
 * This page receives the OAuth callback and signals the original Briefly tab
 * via postMessage. The original tab updates its UI automatically.
 *
 * window.close() is attempted but browsers block it when the window wasn't
 * opened directly by a script (Apideck breaks the opener chain via redirects).
 * We show a clear "you're connected, close this tab" message as the fallback.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function OAuthCompleteInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')

  useEffect(() => {
    const provider = searchParams.get('provider') || 'google'
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')

    if (typeof window === 'undefined') return

    const providerName = provider === 'microsoft' ? 'OneDrive' : 'Google Drive'

    if (error) {
      setStatus('error')
      return
    }

    // Signal the original Briefly tab to refresh its connection state
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          { type: 'BRIEFLY_OAUTH_COMPLETE', provider, connected: connected || null, error: null },
          window.location.origin
        )
      } catch (e) {
        console.warn('[oauth-complete] postMessage blocked:', e)
      }
    }

    // Attempt window.close() — works if opened via window.open()
    // Browser will block it if the opener chain was broken by redirects
    setTimeout(() => {
      window.close()
      // If still open, show the success message with close instruction
      setStatus('connected')
    }, 400)

  }, [searchParams])

  const providerName = (searchParams.get('provider') || 'google') === 'microsoft' ? 'OneDrive' : 'Google Drive'

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        {status === 'connecting' && (
          <>
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm">Connecting {providerName}…</p>
          </>
        )}

        {status === 'connected' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white font-semibold text-lg">{providerName} Connected!</p>
              <p className="text-gray-400 text-sm">
                Your Briefly tab has been updated.<br />
                You can close this window.
              </p>
            </div>
            <button
              onClick={() => window.close()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Close Window
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white font-semibold">Connection Failed</p>
              <p className="text-gray-400 text-sm">Something went wrong. Please close this window and try again.</p>
            </div>
            <button
              onClick={() => window.close()}
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Close Window
            </button>
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
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OAuthCompleteInner />
    </Suspense>
  )
}
