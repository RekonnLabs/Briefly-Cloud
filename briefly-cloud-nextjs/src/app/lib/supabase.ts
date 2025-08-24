/**
 * Supabase Browser Client
 * 
 * This module provides browser/client-side Supabase client.
 * For server-side operations, use supabase-admin.ts instead.
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Simple client for browser/client-side operations (fallback to basic client for build compatibility)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'app' },
  global: {
    headers: {
      'X-Client-Info': 'briefly-cloud-browser'
    }
  }
})

// Database types (to be expanded based on actual schema)
export interface User {
  id: string
  email: string
  full_name?: string
  subscription_tier: 'free' | 'pro' | 'pro_byok'
  subscription_status: string
  chat_messages_count: number
  chat_messages_limit: number
  documents_uploaded: number
  documents_limit: number
  api_calls_count: number
  api_calls_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  usage_stats: Record<string, unknown>
  preferences: Record<string, unknown>
  features_enabled: Record<string, boolean>
  permissions: Record<string, boolean>
  usage_reset_date: string
  trial_end_date?: string
  created_at: string
  updated_at: string
}

export interface OAuthToken {
  id: string
  user_id: string
  provider: 'google' | 'microsoft'
  access_token: string
  refresh_token?: string
  expires_at?: string
  scope?: string
  token_type?: string
  created_at: string
  updated_at: string
}

export interface FileMetadata {
  id: string
  user_id: string
  name: string
  path: string
  size: number
  mime_type: string
  source: 'upload' | 'google' | 'microsoft'
  external_id?: string
  external_url?: string
  processed: boolean
  processing_status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  file_id: string
  user_id: string
  chunk_index: number
  content: string
  embedding?: number[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources?: DocumentReference[]
  metadata?: Record<string, unknown>
  created_at: string
}

export interface DocumentReference {
  file_id: string
  file_name: string
  chunk_index: number
  relevance_score: number
}

export interface JobLog {
  id: string
  user_id: string
  job_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  input_data: Record<string, unknown>
  output_data?: Record<string, unknown>
  error_message?: string
  created_at: string
  completed_at?: string
}

export interface UserSettings {
  id: string
  user_id: string
  key: string
  value: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UsageLog {
  id: string
  user_id: string
  action: string
  details: Record<string, unknown>
  cost_cents: number
  created_at: string
}

// Database operation helpers
export class SupabaseError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message)
    this.name = 'SupabaseError'
  }
}

// User operations
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app.users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // No rows returned
      throw new SupabaseError(`Failed to get user: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting user: ${error}`)
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app.users')
      .select('*')
      .eq('email', email)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // No rows returned
      throw new SupabaseError(`Failed to get user by email: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting user by email: ${error}`)
  }
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app.users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to update user: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error updating user: ${error}`)
  }
}

// OAuth token operations
export async function getOAuthToken(userId: string, provider: 'google' | 'microsoft'): Promise<OAuthToken | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // No rows returned
      throw new SupabaseError(`Failed to get OAuth token: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting OAuth token: ${error}`)
  }
}

export async function upsertOAuthToken(tokenData: Omit<OAuthToken, 'id' | 'created_at' | 'updated_at'>): Promise<OAuthToken> {
  try {
    const { data, error } = await supabaseAdmin
      .from('oauth_tokens')
      .upsert(tokenData, { onConflict: 'user_id,provider' })
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to upsert OAuth token: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error upserting OAuth token: ${error}`)
  }
}

// File metadata operations
export async function getFileMetadata(userId: string, fileId?: string): Promise<FileMetadata[]> {
  try {
    let query = supabaseAdmin
      .from('file_metadata')
      .select('*')
      .eq('user_id', userId)

    if (fileId) {
      query = query.eq('id', fileId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      throw new SupabaseError(`Failed to get file metadata: ${error.message}`, error.code, error)
    }

    return data || []
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting file metadata: ${error}`)
  }
}

export async function createFileMetadata(metadata: Omit<FileMetadata, 'id' | 'created_at' | 'updated_at'>): Promise<FileMetadata> {
  try {
    const { data, error } = await supabaseAdmin
      .from('file_metadata')
      .insert(metadata)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to create file metadata: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error creating file metadata: ${error}`)
  }
}

// Document chunk operations
export async function getDocumentChunks(userId: string, fileId?: string): Promise<DocumentChunk[]> {
  try {
    let query = supabaseAdmin
      .from('document_chunks')
      .select('*')
      .eq('user_id', userId)

    if (fileId) {
      query = query.eq('file_id', fileId)
    }

    const { data, error } = await query.order('chunk_index', { ascending: true })

    if (error) {
      throw new SupabaseError(`Failed to get document chunks: ${error.message}`, error.code, error)
    }

    return data || []
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting document chunks: ${error}`)
  }
}

export async function createDocumentChunk(chunk: Omit<DocumentChunk, 'id' | 'created_at'>): Promise<DocumentChunk> {
  try {
    const { data, error } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunk)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to create document chunk: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error creating document chunk: ${error}`)
  }
}

// Conversation operations
export async function getConversations(userId: string): Promise<Conversation[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new SupabaseError(`Failed to get conversations: ${error.message}`, error.code, error)
    }

    return data || []
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting conversations: ${error}`)
  }
}

export async function createConversation(conversation: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>): Promise<Conversation> {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(conversation)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to create conversation: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error creating conversation: ${error}`)
  }
}

// Chat message operations
export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new SupabaseError(`Failed to get chat messages: ${error.message}`, error.code, error)
    }

    return data || []
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error getting chat messages: ${error}`)
  }
}

export async function createChatMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert(message)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to create chat message: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error creating chat message: ${error}`)
  }
}

// Job log operations
export async function createJobLog(job: Omit<JobLog, 'id' | 'created_at' | 'completed_at'>): Promise<JobLog> {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_logs')
      .insert(job)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to create job log: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error creating job log: ${error}`)
  }
}

export async function updateJobLog(jobId: string, updates: Partial<JobLog>): Promise<JobLog> {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_logs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      throw new SupabaseError(`Failed to update job log: ${error.message}`, error.code, error)
    }

    return data
  } catch (error) {
    if (error instanceof SupabaseError) throw error
    throw new SupabaseError(`Unexpected error updating job log: ${error}`)
  }
}