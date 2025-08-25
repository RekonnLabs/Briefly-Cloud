/**
 * Supabase Authentication Provider
 * 
 * This component provides authentication context for the entire application
 * using Supabase Auth instead of NextAuth.
 */

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/app/lib/auth/supabase-browser'
import type { User, Session } from '@supabase/supabase-js'

// Define AuthUser type here since it's client-side
interface AuthUser {
  id: string
  email: string
  full_name?: string
  subscription_tier: 'free' | 'pro' | 'pro_byok'
  role?: string
  features_enabled?: Record<string, boolean>
  permissions?: Record<string, boolean>
}

interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  signIn: (provider: 'google' | 'microsoft') => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within a SupabaseAuthProvider')
  }
  return context
}

interface SupabaseAuthProviderProps {
  children: React.ReactNode
}

export function SupabaseAuthProvider({ children }: SupabaseAuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')

// Create auth user from Supabase user data
  const createAuthUser = (supabaseUser: User): AuthUser => {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '',
      subscription_tier: supabaseUser.app_metadata?.subscription_tier || 'free',
      role: supabaseUser.app_metadata?.role,
      features_enabled: supabaseUser.app_metadata?.features_enabled || {},
      permissions: supabaseUser.app_metadata?.permissions || {}
    }
  }

  // Handle authentication state changes
  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email)
      
      if (!mounted) return
      
      // Handle different auth events with additional validation
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Validate session before setting
        if (session?.user?.email && session.access_token) {
          setSession(session)
          setUser(createAuthUser(session.user))
        } else {
          console.warn('Invalid session data received:', { hasUser: !!session?.user, hasToken: !!session?.access_token })
          setSession(null)
          setUser(null)
        }
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        setLoading(false)
      } else if (event === 'INITIAL_SESSION') {
        // Validate initial session
        if (session?.user?.email && session.access_token) {
          setSession(session)
          setUser(createAuthUser(session.user))
        } else if (session) {
          console.warn('Invalid initial session, signing out')
          await supabase.auth.signOut()
        }
        setLoading(false)
      }
    })

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return
        
        if (error) {
          console.error('Error getting initial session:', error)
        }
        
        setSession(session)
        
        if (session?.user) {
          setUser(createAuthUser(session.user))
        }
        
        setLoading(false)
      } catch (error) {
        console.error('Error in getInitialSession:', error)
        if (mounted) {
          setLoading(false)
        }
      }
    }

    getInitialSession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  // Sign in with OAuth provider - navigate to server-side route
  const signIn = async (provider: 'google' | 'microsoft') => {
    try {
      const next = encodeURIComponent('/briefly/app/dashboard')
      const authProvider = provider === 'microsoft' ? 'azure' : provider
      const startUrl = `/auth/start?provider=${authProvider}&next=${next}`
      
      // Navigate to server-side OAuth start route
      window.location.href = startUrl
    } catch (error) {
      console.error('Sign in error:', error)
      throw error
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }
      
      setUser(null)
      setSession(null)
    } catch (error) {
      console.error('Sign out error:', error)
      throw error
    }
  }

  // Refresh user profile
  const refreshUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(createAuthUser(user))
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signOut,
    refreshUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { user } = useAuth()
  return !!user
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth()
  return !!user?.email.endsWith('@rekonnlabs.com')
}

/**
 * Hook to get user's subscription tier
 */
export function useSubscriptionTier(): string {
  const { user } = useAuth()
  return user?.subscription_tier || 'free'
}

/**
 * Hook to check if user has a specific feature
 */
export function useHasFeature(feature: string): boolean {
  const { user } = useAuth()
  return !!user?.features_enabled?.[feature]
}

/**
 * Hook to check if user has a specific permission
 */
export function useHasPermission(permission: string): boolean {
  const { user } = useAuth()
  return !!user?.permissions?.[permission]
}