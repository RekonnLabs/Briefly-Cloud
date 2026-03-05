'use client'
import { useState } from 'react'

declare global {
  interface Window {
    ApideckVault: any
  }
}

interface UseVaultOptions {
  /**
   * Called once after the Vault modal closes and the connection has been
   * persisted (or attempted).  Use this to refresh UI state.
   */
  onSuccess?: () => void
}

export function useVault(options: UseVaultOptions = {}) {
  const { onSuccess } = options
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openVault = async () => {
    setError(null)
    setLoading(true)

    try {
      // Check if Apideck Vault script is loaded
      if (typeof window.ApideckVault === 'undefined') {
        throw new Error('Apideck Vault script not loaded. Please refresh the page and try again.')
      }

      console.log('[vault] Creating session...')
      const res = await fetch('/api/integrations/apideck/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[vault] Session creation failed:', {
          status: res.status,
          statusText: res.statusText,
          error: errorData
        })

        if (res.status === 503) {
          throw new Error('Apideck integration is currently disabled')
        } else if (res.status === 401) {
          throw new Error('Please sign in to connect cloud storage')
        } else if (res.status === 500) {
          const message = errorData.message || errorData.error || 'Configuration error'
          throw new Error(`Setup error: ${message}`)
        } else {
          throw new Error(`Session creation failed (${res.status})`)
        }
      }

      const session = await res.json()
      console.log('[vault] Session created successfully')

      const token = session.token
      if (!token) {
        throw new Error('No session token received from Apideck API')
      }

      // Flag to prevent double-calling onSuccess if both onConnectionChange
      // and onClose fire (onConnectionChange is the eager path; onClose is
      // the reliable fallback because the SDK does not always fire the former)
      let connectionChangeFired = false

      window.ApideckVault.open({
        token,
        unifiedApi: 'file-storage',
        serviceId: session.serviceId || 'google-drive',

        onReady: () => {
          console.log('[vault] Vault ready')
        },

        // Eager path: fires when the user connects inside the Vault modal.
        // Not guaranteed by all SDK versions — onClose is the reliable path.
        onConnectionChange: async (connection: any) => {
          console.log('[vault] Connection changed:', connection)
          connectionChangeFired = true

          try {
            // POST to the callback route so we stay on the dashboard.
            // The route persists the connection record and returns JSON.
            const callbackRes = await fetch('/api/integrations/apideck/callback', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connection })
            })

            if (!callbackRes.ok) {
              console.error('[vault] Callback POST failed:', callbackRes.status)
            } else {
              console.log('[vault] Connection persisted via callback POST')
            }
          } catch (err) {
            console.error('[vault] Error calling callback route:', err)
          }

          // Call onSuccess immediately — don't wait for onClose
          onSuccess?.()
        },

        // Reliable path: always fires when the modal closes.
        // Only calls onSuccess if onConnectionChange did not already fire.
        onClose: () => {
          console.log('[vault] Vault closed')
          setLoading(false)

          if (!connectionChangeFired) {
            console.log('[vault] onConnectionChange did not fire — triggering onSuccess via onClose')
            onSuccess?.()
          }
        }
      })

      console.log('[vault] Vault opened successfully')

    } catch (e) {
      console.error('[vault] Error opening vault:', e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to open vault'
      setError(errorMessage)
      setLoading(false)
    }
  }

  return {
    openVault,
    isLoading,
    error,
    clearError: () => setError(null)
  }
}
