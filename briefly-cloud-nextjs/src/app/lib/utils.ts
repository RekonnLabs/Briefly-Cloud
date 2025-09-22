import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// API Response helpers
export interface APIResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export function createSuccessResponse<T>(data: T, message?: string): APIResponse<T> {
  return {
    success: true,
    data,
    message
  }
}

export function createErrorResponse(error: string, message?: string): APIResponse {
  return {
    success: false,
    error,
    message
  }
}

// Error handling for API routes
export function handleAPIError(error: unknown): Response {
  console.error('API Error:', error)
  
  if (error instanceof Error) {
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'INTERNAL_ERROR' },
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return new Response(JSON.stringify({
    success: false,
    error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
    timestamp: new Date().toISOString()
  }), { 
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  })
}

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Date formatting
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Subscription tier limits
export const TIER_LIMITS = {
  free: {
    max_files: 25,
    max_llm_calls: 100,
    max_storage_bytes: 104857600, // 100MB
    features: ['basic_chat', 'google', 'gpt_3_5_turbo']
  },
  pro: {
    max_files: 500,
    max_llm_calls: 400,
    max_storage_bytes: 1073741824, // 1GB
    features: ['advanced_chat', 'google', 'onedrive', 'priority_support', 'gpt_4_turbo']
  },
  pro_byok: {
    max_files: 5000,
    max_llm_calls: 2000,
    max_storage_bytes: 10737418240, // 10GB
    features: ['byok', 'advanced_chat', 'google', 'onedrive', 'priority_support', 'gpt_4_turbo']
  }
} as const

export type SubscriptionTier = keyof typeof TIER_LIMITS

// Check if user has reached usage limits
export function checkUsageLimit(
  currentUsage: number,
  limit: number,
  buffer: number = 0
): boolean {
  return currentUsage + buffer <= limit
}

// Supported file types
export const SUPPORTED_FILE_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json'
} as const

export function isValidFileType(mimeType: string): boolean {
  return mimeType in SUPPORTED_FILE_TYPES
}

export function getFileExtension(mimeType: string): string | undefined {
  return SUPPORTED_FILE_TYPES[mimeType as keyof typeof SUPPORTED_FILE_TYPES]
}

// Text chunking utility
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = []
  const paragraphs = text.split('\n\n')
  
  let currentChunk = ''
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = paragraph
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }
  
  return chunks.filter(chunk => chunk.length > 0)
}

// Rate limiting helper (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number = 60000 // 1 minute
): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}
