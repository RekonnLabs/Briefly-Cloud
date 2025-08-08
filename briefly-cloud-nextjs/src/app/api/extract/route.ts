import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
// import { createClient } from '@supabase/supabase-js'
import { logApiUsage } from '@/app/lib/logger'
import { 
  extractTextFromBuffer, 
  createTextChunks, 
  isSupportedMimeType,
  getExtractionStats 
} from '@/app/lib/document-extractor'

// POST /api/extract - Extract text from uploaded file
async function extractTextHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    // Note: supabase client available if needed for future enhancements
    // const supabase = createClient(
    //   process.env.SUPABASE_URL!,
    //   process.env.SUPABASE_ANON_KEY!
    // )
    
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const options = formData.get('options') ? JSON.parse(formData.get('options') as string) : {}
    
    if (!file) {
      return ApiResponse.badRequest('No file provided')
    }
    
    // Validate file type
    if (!isSupportedMimeType(file.type)) {
      return ApiResponse.badRequest(
        `File type ${file.type} is not supported for text extraction`
      )
    }
    
    // Check file size (limit to 50MB for extraction)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return ApiResponse.badRequest(
        `File size ${Math.round(file.size / 1024 / 1024)}MB exceeds maximum allowed size of 50MB for text extraction`
      )
    }
    
    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Extract text
    const extractionResult = await extractTextFromBuffer(buffer, file.type, file.name)
    
    // Create chunks if requested
    let chunks = null
    if (options.createChunks !== false) {
      const maxChunkSize = options.maxChunkSize || 1000
      chunks = createTextChunks(
        extractionResult.text,
        `temp_${Date.now()}`,
        file.name,
        file.type,
        maxChunkSize
      )
    }
    
    // Get extraction statistics
    const stats = getExtractionStats(extractionResult)
    
    // Log usage
    logApiUsage(user.id, '/api/extract', 'text_extraction', {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      text_length: extractionResult.text.length,
      processing_time: extractionResult.metadata.processingTime,
      extractor_used: extractionResult.metadata.extractorUsed,
      chunk_count: chunks?.length || 0,
    })
    
    return ApiResponse.success({
      extraction: {
        text: extractionResult.text,
        metadata: extractionResult.metadata,
        warnings: extractionResult.warnings,
        stats,
      },
      ...(chunks && { chunks }),
      file_info: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }, 'Text extracted successfully')
    
  } catch (error) {
    console.error('Text extraction handler error:', error)
    
    // Re-throw known errors
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to extract text from document')
  }
}

// Export handler with middleware
export const POST = createProtectedApiHandler(extractTextHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 30, // More restrictive for processing-intensive operations
  },
  logging: {
    enabled: true,
    includeBody: false, // Don't log file content
  },
})