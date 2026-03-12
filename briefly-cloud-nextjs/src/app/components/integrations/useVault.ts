'use client'
import { useState, useRef } from 'react'

declare global {
  interface Window {
    ApideckVault: any
  }
}

// Client-side only — cannot import from server-side apideck.ts
const inferProvider = (serviceId: string): 'google' | 'microsoft' => {
  if (serviceId.includes('microsoft') || serviceId.includes('onedrive')) return 'microsoft'
  return 'google'
}

interface UseVaultOptions {
  /**
   * Fires immediately when the modal closes with a completed connection —
   * before any network call. Use this to flip the UI optimistically.
   */
  onOptimisticConnect?: (provider: 'google' | 'microsoft') => void
  /**
   * Fires after the POST to /callback confirms the row was written
   * (server truth). Use this to confirm / sync UI state.
   */
  onSuccess?: () => void
  /**
   * Fires if the background POST fails all retries — use this to roll back
   * the optimistic UI state and surface an error.
   */
  onConnectionError?: (provider: 'google' | 'microsoft', error: string) => void
}

export function useVault(options: UseVaultOptions = {}) {
  const { onOptimisticConnect, onSuccess, onConnectionError } = options
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Provider inferred at session-creation time so both onConnectionChange
  // and onClose have access to it without closure staleness.
  const pendingProviderRef = useRef<'google' | 'microsoft'>('google')

  /** POST to the callback route; returns true on success. */
  const persistConnection = async (
    provider: 'google' | 'microsoft',
    body?: object
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/integrations/apideck/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })

      if (!res.ok) {
        console.error('[vault] Callback POST failed:', res.status)
        return false
      }

      console.log('[vault] Connection persisted via callback POST')
      return true
    } catch (err) {
      console.error('[vault] Error calling callback route:', err)
      return false
    }
  }

  const openVault = async () => {
    setError(null)
    setLoading(true)

    try {
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
        console.error('[vault] Session creation failed:', { status: res.status, error: errorData })
        if (res.status === 503) throw new Error('Apideck integration is currently disabled')
        else if (res.status === 401) throw new Error('Please sign in to connect cloud storage')
        else if (res.status === 500) throw new Error(`Setup error: ${errorData.message || errorData.error || 'Configuration error'}`)
        else throw new Error(`Session creation failed (${res.status})`)
      }

      const session = await res.json()
      const token = session.token
      if (!token) throw new Error('No session token received from Apideck API')

      // Capture provider at session time — available in both SDK callbacks below
      const sessionServiceId: string = session.serviceId || 'google-drive'
      pendingProviderRef.current = inferProvider(sessionServiceId)
      console.log('[vault] Session created, provider:', pendingProviderRef.current)

      // Prevents double-processing when both onConnectionChange and onClose fire
      let connectionChangeFired = false

      window.ApideckVault.open({
        token,
        unifiedApi: 'file-storage',
        serviceId: sessionServiceId,

        onReady: () => console.log('[vault] Vault ready'),

        // Eager path — not guaranteed by all SDK versions; onClose is the reliable fallback
        onConnectionChange: async (connection: any) => {
          console.log('[vault] Connection changed:', connection)
          connectionChangeFired = true

          // Prefer provider from the connection object; fall back to session value
          const provider = connection?.service_id
            ? inferProvider(connection.service_id)
            : pendingProviderRef.current

          // Flip UI immediately — user sees "Connected" before any network round-trip
          onOptimisticConnect?.(provider)

          // Persist in background; roll back on failure
          const ok = await persistConnection(provider, { connection })
          if (ok) {
            onSuccess?.()
          } else {
            onConnectionError?.(provider, 'Failed to save connection. Please try again.')
          }
        },

        // Reliable fallback — always fires on modal close
        onClose: async () => {
          console.log('[vault] Vault closed')
          setLoading(false)

          if (!connectionChangeFired) {
            console.log('[vault] onConnectionChange did not fire — using onClose fallback')
            const provider = pendingProviderRef.current

            // Flip UI immediately
            onOptimisticConnect?.(provider)

            // Persist in background; roll back on failure
            const ok = await persistConnection(provider)
            if (ok) {
              onSuccess?.()
            } else {
              onConnectionError?.(provider, 'Failed to save connection. Please try again.')
            }
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

  return { openVault, isLoading, error, clearError: () => setError(null) }
}
