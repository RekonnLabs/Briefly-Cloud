import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'
import { 
  DocumentChunker, 
  storeDocumentChunks, 
  getChunkingStats,
  DEFAULT_CHUNKING_CONFIGS 
} from '@/app/lib/document-chunker'
import { z } from 'zod'

// Validation schemas
const chunkCreationSchema = z.object({
  text: z.string().min(1),
  fileId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  strategy: z.enum(['paragraph', 'sentence', 'fixed', 'semantic', 'sliding']).optional().default('paragraph'),
  maxChunkSize: z.number().min(100).max(5000).optional().default(1000),
  minChunkSize: z.number().min(50).max(2000).optional(),
  overlap: z.number().min(0).max(1000).optional(),
  preserveStructure: z.boolean().optional(),
  respectBoundaries: z.boolean().optional(),
  saveToDatabase: z.boolean().optional().default(true),
})

// Note: fileChunkingSchema defined but not used in this route
// const fileChunkingSchema = z.object({
//   fileId: z.string(),
//   strategy: z.enum(['paragraph', 'sentence', 'fixed', 'semantic', 'sliding']).optional().default('paragraph'),
//   maxChunkSize: z.number().min(100).max(5000).optional().default(1000),
//   minChunkSize: z.number().min(50).max(2000).optional(),
//   overlap: z.number().min(0).max(1000).optional(),
//   preserveStructure: z.boolean().optional(),
//   respectBoundaries: z.boolean().optional(),
//   saveToDatabase: z.boolean().optional().default(true),
//   forceReprocess: z.boolean().optional().default(false),
// })

// POST /api/chunks - Create chunks from text
async function createChunksHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = chunkCreationSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const {
      text,
      fileId,
      fileName,
      mimeType,
      strategy,
      maxChunkSize,
      minChunkSize,
      overlap,
      preserveStructure,
      respectBoundaries,
      saveToDatabase,
    } = validation.data
    
    // Create chunker with configuration
    const chunker = new DocumentChunker({
      strategy,
      maxChunkSize,
      minChunkSize,
      overlap,
      preserveStructure,
      respectBoundaries,
    })
    
    // Create chunks
    const chunks = chunker.createChunks(text, fileId, fileName, mimeType, user.id)
    
    // Store in database if requested
    let storedChunks = null
    if (saveToDatabase) {
      storedChunks = await storeDocumentChunks(chunks, user.id, fileId)
      
      // Update file metadata to mark as processed
      const supabase = supabaseAdmin
      
      await supabase
        .from('file_metadata')
        .update({
          processed: true,
          processing_status: 'completed',
          metadata: {
            chunk_count: chunks.length,
            chunking_strategy: strategy,
            max_chunk_size: maxChunkSize,
            processed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId)
        .eq('user_id', user.id)
    }
    
    // Get chunking statistics
    const stats = getChunkingStats(chunks)
    
    // Log usage
    logApiUsage(user.id, '/api/chunks', 'chunk_creation', {
      file_id: fileId,
      strategy,
      chunk_count: chunks.length,
      text_length: text.length,
      max_chunk_size: maxChunkSize,
      saved_to_database: saveToDatabase,
    })
    
    return ApiResponse.success({
      chunks: storedChunks || chunks,
      stats,
      config: {
        strategy,
        maxChunkSize,
        minChunkSize,
        overlap,
        preserveStructure,
        respectBoundaries,
      },
      saved_to_database: saveToDatabase,
    }, 'Chunks created successfully')
    
  } catch (error) {
    console.error('Create chunks handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to create chunks')
  }
}

// GET /api/chunks - Get chunking capabilities and configurations
async function getChunkingInfoHandler(_request: Request, _context: ApiContext): Promise<NextResponse> {
  try {
    const capabilities = {
      strategies: {
        paragraph: {
          name: 'Paragraph-based',
          description: 'Split text by paragraph boundaries, preserving document structure',
          default_config: DEFAULT_CHUNKING_CONFIGS.paragraph,
          best_for: ['documents', 'articles', 'reports'],
          pros: ['Preserves structure', 'Natural boundaries', 'Good for most documents'],
          cons: ['Variable chunk sizes', 'May create very large chunks'],
        },
        sentence: {
          name: 'Sentence-based',
          description: 'Split text by sentence boundaries for more granular chunks',
          default_config: DEFAULT_CHUNKING_CONFIGS.sentence,
          best_for: ['detailed_analysis', 'qa_systems', 'precise_retrieval'],
          pros: ['Granular control', 'Natural language boundaries', 'Good for Q&A'],
          cons: ['More chunks', 'May lose context', 'Slower processing'],
        },
        fixed: {
          name: 'Fixed-size',
          description: 'Create chunks of approximately equal size',
          default_config: DEFAULT_CHUNKING_CONFIGS.fixed,
          best_for: ['consistent_processing', 'memory_constraints', 'batch_operations'],
          pros: ['Predictable sizes', 'Consistent processing', 'Memory efficient'],
          cons: ['May break sentences', 'Less natural boundaries', 'Context loss'],
        },
        sliding: {
          name: 'Sliding window',
          description: 'Create overlapping chunks to preserve context across boundaries',
          default_config: DEFAULT_CHUNKING_CONFIGS.sliding,
          best_for: ['context_preservation', 'search_applications', 'embeddings'],
          pros: ['Preserves context', 'No information loss', 'Better for search'],
          cons: ['More chunks', 'Storage overhead', 'Processing complexity'],
        },
        semantic: {
          name: 'Semantic boundaries',
          description: 'Split based on semantic meaning (future enhancement)',
          default_config: DEFAULT_CHUNKING_CONFIGS.semantic,
          best_for: ['advanced_analysis', 'topic_modeling', 'content_understanding'],
          pros: ['Intelligent boundaries', 'Topic coherence', 'Better embeddings'],
          cons: ['Complex processing', 'Slower performance', 'Not yet implemented'],
          status: 'coming_soon',
        },
      },
      
      configuration_options: {
        maxChunkSize: {
          description: 'Maximum characters per chunk',
          min: 100,
          max: 5000,
          default: 1000,
          recommended: {
            'short_documents': 500,
            'medium_documents': 1000,
            'long_documents': 1500,
            'embeddings': 1000,
            'search': 800,
          },
        },
        minChunkSize: {
          description: 'Minimum characters per chunk (prevents tiny chunks)',
          min: 50,
          max: 2000,
          default: 100,
        },
        overlap: {
          description: 'Character overlap for sliding window strategy',
          min: 0,
          max: 1000,
          default: 200,
          note: 'Only applies to sliding window strategy',
        },
        preserveStructure: {
          description: 'Try to preserve document structure (paragraphs, sections)',
          default: true,
          recommended: true,
        },
        respectBoundaries: {
          description: 'Avoid breaking words or sentences when possible',
          default: true,
          recommended: true,
        },
      },
      
      performance_guidelines: {
        chunk_count_estimates: {
          '1000_chars': '~1 chunk',
          '5000_chars': '3-5 chunks',
          '10000_chars': '8-12 chunks',
          '50000_chars': '40-60 chunks',
        },
        processing_time: {
          'paragraph': 'Fast (~10ms per 1000 chars)',
          'sentence': 'Medium (~20ms per 1000 chars)',
          'fixed': 'Fast (~5ms per 1000 chars)',
          'sliding': 'Medium (~15ms per 1000 chars)',
          'semantic': 'Slow (~100ms per 1000 chars, when available)',
        },
        memory_usage: {
          'paragraph': 'Low',
          'sentence': 'Medium',
          'fixed': 'Low',
          'sliding': 'High (due to overlap)',
          'semantic': 'High',
        },
      },
      
      limitations: {
        max_text_length: 1000000, // 1MB of text
        max_chunks_per_document: 1000,
        supported_languages: ['English (primary)', 'Other languages (basic support)'],
        batch_processing: 'Up to 10 documents per request',
      },
      
      version: '1.0.0',
      last_updated: new Date().toISOString(),
    }
    
    return ApiResponse.success(capabilities)
    
  } catch (error) {
    console.error('Get chunking info handler error:', error)
    return ApiResponse.internalError('Failed to get chunking information')
  }
}

// Export handlers with middleware
export const POST = createProtectedApiHandler(createChunksHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 50, // More restrictive for processing operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const GET = createProtectedApiHandler(getChunkingInfoHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})