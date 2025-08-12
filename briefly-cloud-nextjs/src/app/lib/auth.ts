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
          scope: 'openid email profile'
        }
      }
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
      authorization: {
        params: {
          scope: 'openid email profile offline_access'
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false
      
      try {
        // Check if user exists in Supabase
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single()
        
        if (!existingUser) {
          // Create new user with free tier active by default
          const newUser = {
            email: user.email,
            full_name: user.name || user.email.split('@')[0],
            subscription_tier: 'free',
            subscription_status: 'active', // Free users are active by default
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
          
          await supabaseAdmin.from('users').insert(newUser)
        }
        
        return true
      } catch (error) {
        console.error('Error in signIn callback:', error)
        return false
      }
    },
    
    async jwt({ token }) {
      if (token?.email) {
        try {
          // Get user data from Supabase and attach to token
          const { data } = await supabaseAdmin
            .from('users')
            .select('id, subscription_tier, subscription_status, chat_messages_count, chat_messages_limit')
            .eq('email', token.email)
            .single()
          
          if (data) {
            token.uid = data.id
            token.subscription_tier = data.subscription_tier
            token.subscription_status = data.subscription_status
            token.usage_count = data.chat_messages_count || 0
            token.usage_limit = data.chat_messages_limit || TIER_LIMITS[data.subscription_tier as keyof typeof TIER_LIMITS]?.max_llm_calls || 100
          }
        } catch (error) {
          console.error('Error in jwt callback:', error)
        }
      }
      return token
    },
    
    async session({ session, token }) {
      if (session.user) {
        // Attach user data from token to session
        session.user.id = token.uid as string
        session.user.subscription_tier = token.subscription_tier as string
        session.user.subscription_status = token.subscription_status as string
        session.user.usage_count = token.usage_count as number
        session.user.usage_limit = token.usage_limit as number
      }
      return session
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
      subscription_tier: string
      subscription_status: string
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
    uid?: string
    accessToken?: string
    refreshToken?: string
    provider?: string
    subscription_tier?: string
    subscription_status?: string
    usage_count?: number
    usage_limit?: number
  }
}