import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { supabaseAdmin } from './supabase'

// Subscription tier definitions (migrated from existing Python code)
export const TIER_LIMITS = {
  free: {
    tier: 'free',
    max_files: 25,
    max_llm_calls: 100,
    max_storage_bytes: 104857600, // 100MB
    features: ['basic_chat', 'google_drive', 'gpt_3_5_turbo']
  },
  pro: {
    tier: 'pro', 
    max_files: 500,
    max_llm_calls: 400,
    max_storage_bytes: 1073741824, // 1GB
    features: ['advanced_chat', 'google_drive', 'onedrive', 'priority_support', 'gpt_4_turbo']
  },
  pro_byok: {
    tier: 'pro_byok',
    max_files: 5000, 
    max_llm_calls: 2000,
    max_storage_bytes: 10737418240, // 10GB
    features: ['byok', 'advanced_chat', 'google_drive', 'onedrive', 'priority_support', 'gpt_4_turbo']
  }
} as const

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly'
        }
      }
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
      authorization: {
        params: {
          // Files.Read.All for OneDrive listing/downloads
          scope: 'openid email profile offline_access Files.Read.All'
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false
      
      try {
        // Check if user exists in Supabase
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('email', user.email)
          .single()
        
        if (!existingUser) {
          // Create new user
          const newUser = {
            id: user.id,
            email: user.email,
            full_name: user.name || user.email.split('@')[0],
            plan: 'free', // Legacy column
            subscription_tier: 'free',
            subscription_status: 'active',
            chat_messages_count: 0,
            chat_messages_limit: TIER_LIMITS.free.max_llm_calls,
            documents_uploaded: 0,
            documents_limit: TIER_LIMITS.free.max_files,
            api_calls_count: 0,
            api_calls_limit: 1000,
            storage_used_bytes: 0,
            storage_limit_bytes: TIER_LIMITS.free.max_storage_bytes,
            usage_stats: {},
            preferences: {},
            features_enabled: {
              cloud_storage: true,
              ai_chat: true,
              document_upload: true
            },
            permissions: {
              can_upload: true,
              can_chat: true,
              can_export: false
            },
            usage_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }
          
          await supabaseAdmin.from('users').upsert(newUser)
        }
        
        // Store OAuth tokens if available
        if (account && account.access_token) {
          const tokenData = {
            user_id: user.id,
            provider: account.provider,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at ? new Date(account.expires_at * 1000).toISOString() : null,
            scope: account.scope,
            token_type: account.token_type
          }
          
          await supabaseAdmin
            .from('oauth_tokens')
            .upsert(tokenData, { onConflict: 'user_id,provider' })
        }
        
        return true
      } catch (error) {
        console.error('Error in signIn callback:', error)
        return false
      }
    },
    
    async session({ session }) {
      if (session.user?.email) {
        try {
          // Get user data from Supabase
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single()
          
          if (userData) {
            session.user.id = userData.id
            session.user.subscription_tier = userData.subscription_tier
            session.user.usage_count = userData.chat_messages_count || 0
            session.user.usage_limit = userData.chat_messages_limit || TIER_LIMITS[userData.subscription_tier as keyof typeof TIER_LIMITS]?.max_llm_calls || 100
          }
        } catch (error) {
          console.error('Error in session callback:', error)
        }
      }
      
      return session
    },
    
    async jwt({ token, account, user }) {
      // Store account info in token on first sign in
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.provider = account.provider
      }
      
      if (user) {
        token.id = user.id
      }
      
      return token
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string
      image?: string
      subscription_tier: 'free' | 'pro' | 'pro_byok'
      usage_count: number
      usage_limit: number
    }
  }
  
  interface User {
    id: string
    email: string
    name?: string
    image?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    accessToken?: string
    refreshToken?: string
    provider?: string
  }
}