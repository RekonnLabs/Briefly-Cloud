'use client'
import { useState } from 'react'

declare global {
  interface Window {
    ApideckVault: any
  }
}

export function useVault() {
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

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
        headers: {
          'Content-Type': 'application/json'
        }
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
      console.log('[vault] Session created, opening vault...')
      
      const vault = new window.ApideckVault({
        session,
        onConnectionChange: (connection: any) => {
          console.log('[vault] Connection changed:', connection)
          // Redirect to callback with success indicator
          window.location.href = '/api/integrations/apideck/callback?connected=apideck'
        },
        onError: (error: any) => {
          console.error('[vault] Vault error:', error)
          setError(`Vault error: ${error.message || 'Unknown error'}`)
        },
        onClose: () => {
          console.log('[vault] Vault closed')
          setLoading(false)
        }
      })
      
      vault.open()
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