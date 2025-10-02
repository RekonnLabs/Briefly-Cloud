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
    setError(null); setLoading(true)
    try {
      const res = await fetch('/api/integrations/apideck/session')
      if (!res.ok) throw new Error(`session ${res.status}`)
      const session = await res.json()
      const vault = new window.ApideckVault({
        session,
        onConnectionChange: () => { window.location.href = '/api/integrations/apideck/callback' }
      })
      vault.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to open vault')
    } finally {
      setLoading(false)
    }
  }

  return { openVault, isLoading, error, clearError: () => setError(null) }
}