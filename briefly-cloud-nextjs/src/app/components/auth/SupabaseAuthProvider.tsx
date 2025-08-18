/**
 * Supabase Authentication Provider
 * 
 * This component provides authentication context for the entire application
 * using Supabase Auth instead of NextAuth.
 */

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/app/lib/auth/supabase-client'
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
  const supabase = createSupabaseBrowserClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  // Fetch full user profile from our app.users table
  const fetchUserProfile = async (supabaseUser: User): Promise<AuthUser | null> => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'GET',
        credentials: 'same-origin', // explicit same-origin (same-origin is default, but be safe)
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.error(`Profile fetch failed: ${response.status} ${response.statusText}`)
        throw new Error(`Failed to fetch user profile: ${response.status}`)
      }
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch user profile')
      }
      
      return result.user
    } catch (error) {
      console.error('Error fetching user profile:', error)
      
      // Return basic user info if profile fetch fails but we have user data
      if (supabaseUser) {
        return {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '',
          subscription_tier: 'free',
          features_enabled: {},
          permissions: {}
        }
      }
      
      return null
    }
  }

  // Handle authentication state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email)
      
      setSession(session)
      
      if (session?.user) {
        // Fetch full user profile
        const userProfile = await fetchUserProfile(session.user)
        setUser(userProfile)
      } else {
        setUser(null)
      }
      
      setLoading(false)
    })

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      
      if (session?.user) {
        fetchUserProfile(session.user).then(setUser)
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // Sign in with OAuth provider
  const signIn = async (provider: 'google' | 'microsoft') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'microsoft' ? 'azure' : provider,
        options: {
          redirectTo: `${siteUrl}/auth/callback`,
          scopes: provider === 'google' 
            ? 'openid email profile'
            : 'openid email profile'
        }
      })
      
      if (error) {
        throw error
      }
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
    if (session?.user) {
      const userProfile = await fetchUserProfile(session.user)
      setUser(userProfile)
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