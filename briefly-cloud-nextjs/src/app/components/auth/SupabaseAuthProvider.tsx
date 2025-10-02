/**
 * Supabase Authentication Provider - Main User Authentication
 * 
 * This component provides authentication context for the entire application
 * using Supabase Auth for user login/signup flows.
 * 
 * OAUTH FLOW SEPARATION:
 * - Main Authentication: Uses `/auth/start?provider=...` routes (handled by Supabase Auth)
 * - Storage Connection: Uses `/api/storage/{provider}/start` routes (custom OAuth implementation)
 * 
 * IMPORTANT: This component should ONLY handle main authentication flows:
 * - User Login/Signup: `/auth/start?provider=google` or `/auth/start?provider=azure`
 * 
 * DO NOT use `/api/storage/google/start` or `/api/storage/microsoft/start` here.
 * Those routes are reserved for cloud storage connections after users are authenticated.
 */

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/app/lib/auth/supabase-browser'
import type { User, Session } from '@supabase/supabase-js'
import { logMainAuthRoute, logOAuthFlowCompletion } from '@/app/lib/oauth-flow-monitoring'
import { signoutService, type SignoutOptions, type SignoutResult } from '@/app/lib/auth/signout-service'

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
  signOut: (options?: SignoutOptions) => Promise<SignoutResult>
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
          
          // Log successful authentication for monitoring
          if (event === 'SIGNED_IN') {
            // Determine provider from user metadata
            const provider = session.user.app_metadata?.provider || 'unknown'
            const mappedProvider = provider === 'azure' ? 'azure' : provider === 'google' ? 'google' : 'microsoft'
            logOAuthFlowCompletion('main_auth', mappedProvider as any, true, session.user.id)
          }
        } else {
          console.warn('Invalid session data received:', { hasUser: !!session?.user, hasToken: !!session?.access_token })
          setSession(null)
          setUser(null)
          
          // Log authentication failure for monitoring
          logOAuthFlowCompletion('main_auth', 'unknown', false, undefined, undefined, 'Invalid session data')
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
          
          // Log authentication failure for monitoring
          logOAuthFlowCompletion('main_auth', 'unknown', false, undefined, undefined, 'Invalid initial session')
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

  /**
   * Sign in with OAuth provider using main authentication routes
   * 
   * OAUTH FLOW SEPARATION: This function uses main authentication routes:
   * - Google: /auth/start?provider=google
   * - Microsoft: /auth/start?provider=azure
   * 
   * These routes are DIFFERENT from storage OAuth routes (/api/storage/{provider}/start)
   * which are used for connecting cloud storage accounts after authentication.
   */
  const signIn = async (provider: 'google' | 'microsoft') => {
    try {
      const next = encodeURIComponent('/briefly/app/dashboard')
      const authProvider = provider === 'microsoft' ? 'azure' : provider
      
      // Use main authentication routes (NOT storage OAuth routes)
      const startUrl = `/auth/start?provider=${authProvider}&next=${next}`
      
      // Log OAuth route usage for monitoring
      logMainAuthRoute(provider, 'SupabaseAuthProvider')
      
      // Navigate to server-side OAuth start route for user authentication
      window.location.href = startUrl
    } catch (error) {
      console.error('Sign in error:', error)
      throw error
    }
  }

  /**
   * Enhanced signout method using centralized SignoutService
   * 
   * Integrates with the new SignoutService for consistent signout behavior
   * while maintaining backward compatibility with existing code.
   * 
   * @param options - Optional signout configuration
   * @returns Promise<SignoutResult> - Result of signout operation
   */
  const signOut = async (options?: SignoutOptions): Promise<SignoutResult> => {
    try {
      // Use the centralized SignoutService for consistent behavior
      const result = await signoutService.signOut({
        showLoading: true,
        forceRedirect: false,
        ...options // Allow caller to override defaults
      })

      // Update local state based on signout result
      if (result.success || result.cleanup.sessionData) {
        // Clear local state if signout was successful or session was cleared
        setUser(null)
        setSession(null)
      }

      return result
    } catch (error) {
      console.error('SupabaseAuthProvider signout error:', error)
      
      // Fallback to direct Supabase signout for backward compatibility
      try {
        const { error: supabaseError } = await supabase.auth.signOut()
        if (supabaseError) {
          throw supabaseError
        }
        
        // Clear local state on successful fallback
        setUser(null)
        setSession(null)
        
        // Return a basic success result for backward compatibility
        return {
          success: true,
          redirectUrl: '/auth/signin',
          cleanup: {
            pickerTokens: false,
            storageCredentials: false,
            sessionData: true,
            errors: []
          }
        }
      } catch (fallbackError) {
        // If both SignoutService and fallback fail, still clear local state
        // to prevent users from being stuck in a logged-in state
        setUser(null)
        setSession(null)
        
        const errorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown signout error'
        
        return {
          success: false,
          error: errorMessage,
          redirectUrl: '/auth/signin',
          cleanup: {
            pickerTokens: false,
            storageCredentials: false,
            sessionData: true, // We cleared it locally
            errors: [errorMessage]
          }
        }
      }
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
