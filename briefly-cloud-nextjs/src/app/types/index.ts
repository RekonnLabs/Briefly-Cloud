// Re-export types from Supabase lib for convenience
export type {
  User,
  OAuthToken,
  FileMetadata,
  DocumentChunk,
  Conversation,
  ChatMessage,
  JobLog
} from '@/app/lib/supabase'

// Import for internal use
import type { ChatMessage, FileMetadata } from '@/app/lib/supabase'

// Additional types for the application
export interface DocumentReference {
  file_id: string
  file_name: string
  chunk_index: number
  relevance_score: number
}

export interface ChatResponse {
  response: string
  sources: DocumentReference[]
  conversationId: string
  messageId: string
}
export interface EmbedRequest {
  userId: string
  source: 'google' | 'microsoft' | 'upload'
  fileIds?: string[]
}

export interface EmbedStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  filesProcessed: number
  totalFiles: number
}

export interface ChatRequest {
  message: string
  conversationId?: string
  userId: string
}

export interface VectorSearchResult {
  content: string
  metadata: Record<string, unknown>
  score: number
  fileId: string
  fileName: string
  chunkIndex: number
}

export interface UsageStats {
  chatMessages: number
  documentsUploaded: number
  apiCalls: number
  storageUsed: number
}

export interface TierLimits {
  maxFiles: number
  maxLlmCalls: number
  maxStorageBytes: number
  features: string[]
}

export interface CloudStorageFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  webViewLink?: string
  downloadUrl?: string
}

export interface ProcessingJob {
  id: string
  type: 'document_embedding' | 'file_processing'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  createdAt: string
  completedAt?: string
}

export interface SubscriptionInfo {
  tier: 'free' | 'pro' | 'pro_byok'
  status: 'active' | 'canceled' | 'past_due'
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

export interface APIError {
  success: false
  error: string
  message?: string
  code?: number
}

export interface APISuccess<T = unknown> {
  success: true
  data: T
  message?: string
}

export type APIResponse<T = unknown> = APISuccess<T> | APIError

// Form types
export interface FileUploadForm {
  files: FileList
}

export interface ChatForm {
  message: string
}

export interface ProfileForm {
  fullName: string
  preferences: Record<string, unknown>
}

// Component prop types
export interface FileUploadProps {
  onUpload: (files: File[]) => void
  maxFiles?: number
  maxSize?: number
  acceptedTypes?: string[]
  disabled?: boolean
}

export interface ChatInterfaceProps {
  conversationId?: string
  onNewMessage?: (message: ChatMessage) => void
}

export interface DocumentListProps {
  documents: FileMetadata[]
  onSelect?: (document: FileMetadata) => void
  onDelete?: (documentId: string) => void
}

export interface UsageDashboardProps {
  usage: UsageStats
  limits: TierLimits
  tier: 'free' | 'pro' | 'pro_byok'
}

// Utility types
export type SubscriptionTier = 'free' | 'pro' | 'pro_byok'
export type CloudProvider = 'google' | 'microsoft'
export type FileSource = 'upload' | 'google' | 'microsoft'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type MessageRole = 'user' | 'assistant'

// Environment variable types
export interface EnvironmentConfig {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  OPENAI_API_KEY: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID?: string
  MICROSOFT_CLIENT_SECRET?: string
  CHROMA_API_KEY?: string
  CHROMA_TENANT_ID?: string
  CHROMA_DB_NAME?: string
  STRIPE_SECRET_KEY: string
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  NEXT_PUBLIC_SITE_URL?: string
}