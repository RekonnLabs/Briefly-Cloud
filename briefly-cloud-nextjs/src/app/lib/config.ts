/**
 * Centralized configuration management with security validation
 * Loads and validates all environment variables with secure defaults
 */

import { z } from 'zod'

// Environment schema for validation
const envSchema = z.object({
  // Security
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Authentication
  // Legacy OAuth variables - no longer used (Supabase handles auth)
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32, 'Secret must be at least 32 characters').optional(),
  
  // Google Drive OAuth (for storage integration)
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  
  // Microsoft Drive OAuth (for storage integration)
  MS_DRIVE_CLIENT_ID: z.string().optional(),
  MS_DRIVE_CLIENT_SECRET: z.string().optional(),
  MS_DRIVE_TENANT_ID: z.string().optional(),
  
  // AI/LLM
  OPENAI_API_KEY: z.string(),
  CHAT_MODEL_FREE: z.string().default('gpt-5-nano'),
  CHAT_MODEL_PRO: z.string().default('gpt-5-mini'),
  CHAT_MODEL_BYOK: z.string().default('gpt-5-mini'),
  FEATURE_GPT5: z.string().transform(val => val === 'true').default('true'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.string().transform(Number).default('1536'),
  
  // Vector Storage
  VECTOR_BACKEND: z.enum(['chroma', 'pgvector']).default('chroma'),
  CHROMA_API_KEY: z.string(),
  CHROMA_TENANT_ID: z.string(),
  CHROMA_DB_NAME: z.string().default('Briefly Cloud'),
  
  // Database
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_MAX_CONNECTIONS: z.string().transform(Number).default('10'),
  SUPABASE_CONNECTION_TIMEOUT: z.string().transform(Number).default('30000'),
  SUPABASE_QUERY_TIMEOUT: z.string().transform(Number).default('30000'),
  
  // Payments
  STRIPE_SECRET_KEY: z.string(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_PRICE_PRO: z.string(),
  STRIPE_PRICE_PRO_BYOK: z.string(),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
  
  // File Processing
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('50'),
  ALLOWED_FILE_TYPES: z.string().default('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,text/csv'),
  CHUNK_SIZE: z.string().transform(Number).default('1000'),
  CHUNK_OVERLAP: z.string().transform(Number).default('200'),
  MAX_CHUNKS_PER_DOCUMENT: z.string().transform(Number).default('1000'),
  
  // Monitoring
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('production'),
  SENTRY_TRACES_SAMPLE_RATE: z.string().transform(Number).default('0.1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
  ENABLE_REQUEST_LOGGING: z.string().transform(val => val === 'true').default('true'),
  ENABLE_PERFORMANCE_LOGGING: z.string().transform(val => val === 'true').default('true'),
  
  // Performance
  ENABLE_RESPONSE_CACHING: z.string().transform(val => val === 'true').default('true'),
  CACHE_TTL_SECONDS: z.string().transform(Number).default('3600'),
  ENABLE_DATABASE_CACHING: z.string().transform(val => val === 'true').default('true'),
  MAX_CONCURRENT_REQUESTS: z.string().transform(Number).default('10'),
  REQUEST_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  UPLOAD_TIMEOUT_MS: z.string().transform(Number).default('60000'),
  
  // Feature Flags
  FEATURE_GPT5: z.string().transform(val => val === 'true').default('true'),
  FEATURE_CHROMA_CLOUD: z.string().transform(val => val === 'true').default('true'),
  FEATURE_STRIPE_BILLING: z.string().transform(val => val === 'true').default('true'),
  FEATURE_GOOGLE_DRIVE: z.string().transform(val => val === 'true').default('true'),
  FEATURE_MICROSOFT_ONEDRIVE: z.string().transform(val => val === 'true').default('true'),
  FEATURE_FILE_UPLOAD: z.string().transform(val => val === 'true').default('true'),
  FEATURE_CHAT_STREAMING: z.string().transform(val => val === 'true').default('true'),
  RAG_APP_SCHEMA: z.string().transform(val => val != '0').default('1'),
  
  // Development
  DEBUG: z.string().transform(val => val === 'true').default('false'),
  ENABLE_DEBUG_LOGGING: z.string().transform(val => val === 'true').default('false'),
  ENABLE_TEST_MODE: z.string().transform(val => val === 'true').default('false'),
  MOCK_EXTERNAL_SERVICES: z.string().transform(val => val === 'true').default('false'),
  
  // Deployment
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.string().default('production'),
  CUSTOM_DOMAIN: z.string().default('rekonnlabs.com'),
  APP_SUBPATH: z.string().default('/briefly/app'),
  
  // Usage Limits
  FREE_TIER_MAX_DOCUMENTS: z.string().transform(Number).default('5'),
  FREE_TIER_MAX_CHAT_MESSAGES: z.string().transform(Number).default('100'),
  FREE_TIER_MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('10'),
  FREE_TIER_MAX_STORAGE_MB: z.string().transform(Number).default('100'),
  
  PRO_TIER_MAX_DOCUMENTS: z.string().transform(Number).default('100'),
  PRO_TIER_MAX_CHAT_MESSAGES: z.string().transform(Number).default('1000'),
  PRO_TIER_MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('50'),
  PRO_TIER_MAX_STORAGE_MB: z.string().transform(Number).default('1000'),
  
  PRO_BYOK_TIER_MAX_DOCUMENTS: z.string().transform(Number).default('500'),
  PRO_BYOK_TIER_MAX_CHAT_MESSAGES: z.string().transform(Number).default('5000'),
  PRO_BYOK_TIER_MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('100'),
  PRO_BYOK_TIER_MAX_STORAGE_MB: z.string().transform(Number).default('5000'),
})

// Parse and validate environment variables
function parseEnv() {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter(err => err.code === 'invalid_type' && err.received === 'undefined')
        .map(err => err.path.join('.'))
      
      const invalidVars = error.errors
        .filter(err => err.code !== 'invalid_type')
        .map(err => `${err.path.join('.')}: ${err.message}`)
      
      const errorMessage = [
        'Environment validation failed:',
        ...(missingVars.length > 0 ? [`Missing required variables: ${missingVars.join(', ')}`] : []),
        ...(invalidVars.length > 0 ? [`Invalid variables: ${invalidVars.join(', ')}`] : []),
      ].join('\n')
      
      throw new Error(errorMessage)
    }
    throw error
  }
}

// Create configuration object
const env = parseEnv()

export const config = {
  // Environment
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // Security
  security: {
    allowedOrigins: env.ALLOWED_ORIGINS?.split(',') || [
      'https://rekonnlabs.com',
      'https://briefly.rekonnlabs.com',
      'http://localhost:3000'
    ],
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
    maxFileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, // Convert to bytes
    allowedFileTypes: env.ALLOWED_FILE_TYPES.split(','),
  },
  
  // Authentication
  auth: {
    nextAuthUrl: env.NEXTAUTH_URL,
    // Legacy OAuth config - no longer used
    nextAuthSecret: env.NEXTAUTH_SECRET,
    googleDrive: {
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    },
    microsoftDrive: {
      clientId: env.MS_DRIVE_CLIENT_ID,
      clientSecret: env.MS_DRIVE_CLIENT_SECRET,
      tenantId: env.MS_DRIVE_TENANT_ID,
    },
  },
  
  // AI/LLM
  ai: {
    openaiApiKey: env.OPENAI_API_KEY,
    models: {
      free: env.CHAT_MODEL_FREE,
      pro: env.CHAT_MODEL_PRO,
      byok: env.CHAT_MODEL_BYOK,
    },
    featureGpt5: env.FEATURE_GPT5,
    embedding: {
      model: env.EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
    },
  },
  
  // Vector Storage
  vector: {
    backend: env.VECTOR_BACKEND,
    chroma: {
      apiKey: env.CHROMA_API_KEY,
      tenantId: env.CHROMA_TENANT_ID,
      dbName: env.CHROMA_DB_NAME,
    },
  },
  
  // Database
  database: {
    supabase: {
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      maxConnections: env.SUPABASE_MAX_CONNECTIONS,
      connectionTimeout: env.SUPABASE_CONNECTION_TIMEOUT,
      queryTimeout: env.SUPABASE_QUERY_TIMEOUT,
    },
  },
  
  // Payments
  payments: {
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      prices: {
        pro: env.STRIPE_PRICE_PRO,
        proByok: env.STRIPE_PRICE_PRO_BYOK,
      },
      urls: {
        success: env.STRIPE_SUCCESS_URL,
        cancel: env.STRIPE_CANCEL_URL,
      },
    },
  },
  
  // File Processing
  fileProcessing: {
    maxFileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    allowedTypes: env.ALLOWED_FILE_TYPES.split(','),
    chunkSize: env.CHUNK_SIZE,
    chunkOverlap: env.CHUNK_OVERLAP,
    maxChunksPerDocument: env.MAX_CHUNKS_PER_DOCUMENT,
  },
  
  // Monitoring
  monitoring: {
    sentry: {
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    },
    logging: {
      level: env.LOG_LEVEL,
      format: env.LOG_FORMAT,
      enableRequestLogging: env.ENABLE_REQUEST_LOGGING,
      enablePerformanceLogging: env.ENABLE_PERFORMANCE_LOGGING,
    },
  },
  
  // Performance
  performance: {
    enableResponseCaching: env.ENABLE_RESPONSE_CACHING,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    enableDatabaseCaching: env.ENABLE_DATABASE_CACHING,
    maxConcurrentRequests: env.MAX_CONCURRENT_REQUESTS,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    uploadTimeoutMs: env.UPLOAD_TIMEOUT_MS,
  },
  
  // Feature Flags
  features: {
    gpt5: env.FEATURE_GPT5,
    chromaCloud: env.FEATURE_CHROMA_CLOUD,
    stripeBilling: env.FEATURE_STRIPE_BILLING,
    googleDrive: env.FEATURE_GOOGLE_DRIVE,
    microsoftOneDrive: env.FEATURE_MICROSOFT_ONEDRIVE,
    fileUpload: env.FEATURE_FILE_UPLOAD,
    chatStreaming: env.FEATURE_CHAT_STREAMING,
    ragAppSchema: env.RAG_APP_SCHEMA,
  },
  
  // Development
  development: {
    debug: env.DEBUG,
    enableDebugLogging: env.ENABLE_DEBUG_LOGGING,
    enableTestMode: env.ENABLE_TEST_MODE,
    mockExternalServices: env.MOCK_EXTERNAL_SERVICES,
  },
  
  // Deployment
  deployment: {
    vercelUrl: env.VERCEL_URL,
    vercelEnv: env.VERCEL_ENV,
    customDomain: env.CUSTOM_DOMAIN,
    appSubpath: env.APP_SUBPATH,
  },
  
  // Usage Limits
  limits: {
    free: {
      maxDocuments: env.FREE_TIER_MAX_DOCUMENTS,
      maxChatMessages: env.FREE_TIER_MAX_CHAT_MESSAGES,
      maxUploadSizeMb: env.FREE_TIER_MAX_UPLOAD_SIZE_MB,
      maxStorageMb: env.FREE_TIER_MAX_STORAGE_MB,
    },
    pro: {
      maxDocuments: env.PRO_TIER_MAX_DOCUMENTS,
      maxChatMessages: env.PRO_TIER_MAX_CHAT_MESSAGES,
      maxUploadSizeMb: env.PRO_TIER_MAX_UPLOAD_SIZE_MB,
      maxStorageMb: env.PRO_TIER_MAX_STORAGE_MB,
    },
    proByok: {
      maxDocuments: env.PRO_BYOK_TIER_MAX_DOCUMENTS,
      maxChatMessages: env.PRO_BYOK_TIER_MAX_CHAT_MESSAGES,
      maxUploadSizeMb: env.PRO_BYOK_TIER_MAX_UPLOAD_SIZE_MB,
      maxStorageMb: env.PRO_BYOK_TIER_MAX_STORAGE_MB,
    },
  },
} as const

// Type-safe configuration access
export type Config = typeof config

// Helper functions for common configuration checks
export const isFeatureEnabled = (feature: keyof typeof config.features): boolean => {
  return config.features[feature]
}

export const getTierLimits = (tier: 'free' | 'pro' | 'proByok') => {
  return config.limits[tier]
}

export const isDevelopment = () => config.isDevelopment
export const isProduction = () => config.isProduction
export const isTest = () => config.isTest

// Validate configuration on module load
if (isProduction()) {
  // Additional production validation
  if (!config.auth.nextAuthSecret || config.auth.nextAuthSecret.length < 32) {
    throw new Error('NEXTAUTH_SECRET must be at least 32 characters in production')
  }
  
  if (!config.payments.stripe.secretKey || !config.payments.stripe.publishableKey) {
    throw new Error('Stripe configuration is required in production')
  }
  
  if (!config.database.supabase.url || !config.database.supabase.serviceRoleKey) {
    throw new Error('Supabase configuration is required in production')
  }
}

export default config
