import { NextResponse } from 'next/server'
import { createPublicApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { SUPPORTED_EXTRACTORS } from '@/app/lib/document-extractor'

// GET /api/extract/capabilities - Get text extraction capabilities
async function getCapabilitiesHandler(_request: Request, _context: ApiContext): Promise<NextResponse> {
  try {
    // Group extractors by category
    const capabilities = {
      supported_formats: {
        documents: {
          pdf: {
            mime_types: ['application/pdf'],
            extensions: ['pdf'],
            description: 'Portable Document Format',
            features: ['text_extraction', 'page_count', 'metadata'],
            limitations: ['images_not_extracted', 'complex_layouts_may_vary'],
          },
          word: {
            mime_types: [
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/msword'
            ],
            extensions: ['docx', 'doc'],
            description: 'Microsoft Word Documents',
            features: ['text_extraction', 'formatting_preserved', 'metadata'],
            limitations: ['images_not_extracted', 'complex_formatting_may_vary'],
          },
          excel: {
            mime_types: [
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel'
            ],
            extensions: ['xlsx', 'xls'],
            description: 'Microsoft Excel Spreadsheets',
            features: ['text_extraction', 'multi_sheet_support', 'cell_data'],
            limitations: ['formulas_not_evaluated', 'charts_not_extracted'],
          },
          powerpoint: {
            mime_types: [
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.ms-powerpoint'
            ],
            extensions: ['pptx', 'ppt'],
            description: 'Microsoft PowerPoint Presentations',
            features: ['basic_text_extraction'],
            limitations: ['limited_support', 'images_not_extracted', 'slide_layouts_not_preserved'],
            warning: 'PowerPoint extraction has limited support and may not capture all content',
          },
        },
        text: {
          plain_text: {
            mime_types: ['text/plain'],
            extensions: ['txt'],
            description: 'Plain Text Files',
            features: ['full_text_extraction', 'encoding_detection'],
            limitations: [],
          },
          markdown: {
            mime_types: ['text/markdown'],
            extensions: ['md'],
            description: 'Markdown Files',
            features: ['full_text_extraction', 'formatting_preserved'],
            limitations: [],
          },
          csv: {
            mime_types: ['text/csv', 'application/csv'],
            extensions: ['csv'],
            description: 'Comma-Separated Values',
            features: ['structured_data_extraction', 'column_preservation'],
            limitations: ['complex_csv_formats_may_vary'],
          },
          json: {
            mime_types: ['application/json'],
            extensions: ['json'],
            description: 'JSON Data Files',
            features: ['structured_data_extraction', 'formatting_preserved'],
            limitations: ['large_files_may_be_slow'],
          },
        },
      },
      
      extraction_features: {
        text_chunking: {
          description: 'Automatic text chunking for large documents',
          configurable_chunk_size: true,
          default_chunk_size: 1000,
          min_chunk_size: 100,
          max_chunk_size: 5000,
        },
        metadata_extraction: {
          description: 'Extract document metadata and statistics',
          includes: ['word_count', 'character_count', 'page_count', 'processing_time'],
        },
        batch_processing: {
          description: 'Process multiple files in a single request',
          max_files_per_batch: 10,
          supported: true,
        },
        caching: {
          description: 'Cache extraction results to avoid reprocessing',
          supported: true,
          cache_duration: 'permanent_until_file_updated',
        },
      },
      
      limitations: {
        file_size: {
          max_size_bytes: 50 * 1024 * 1024, // 50MB
          max_size_formatted: '50MB',
          description: 'Maximum file size for text extraction',
        },
        processing_time: {
          typical_range: '100ms - 10s',
          depends_on: ['file_size', 'file_type', 'content_complexity'],
        },
        content_types: {
          not_supported: [
            'images_in_documents',
            'charts_and_graphs',
            'complex_layouts',
            'embedded_objects',
            'audio_video_content',
          ],
        },
      },
      
      api_endpoints: {
        extract_from_upload: {
          method: 'POST',
          path: '/api/extract',
          description: 'Extract text from uploaded file',
          requires_auth: true,
        },
        extract_from_file_id: {
          method: 'POST',
          path: '/api/extract/{fileId}',
          description: 'Extract text from previously uploaded file',
          requires_auth: true,
        },
        batch_extraction: {
          method: 'POST',
          path: '/api/extract/batch',
          description: 'Extract text from multiple files',
          requires_auth: true,
        },
        get_extraction_status: {
          method: 'GET',
          path: '/api/extract/{fileId}',
          description: 'Get extraction status and existing chunks',
          requires_auth: true,
        },
      },
      
      rate_limits: {
        single_extraction: '30 requests per 15 minutes',
        batch_extraction: '5 requests per hour',
        status_checks: '100 requests per 15 minutes',
      },
      
      supported_mime_types: Object.keys(SUPPORTED_EXTRACTORS),
      supported_extensions: Object.values(SUPPORTED_EXTRACTORS),
      
      version: '1.0.0',
      last_updated: '2024-01-01T00:00:00Z',
    }
    
    return ApiResponse.success(capabilities)
    
  } catch (error) {
    console.error('Get capabilities handler error:', error)
    return ApiResponse.internalError('Failed to get extraction capabilities')
  }
}

// Export handler with middleware (public endpoint)
export const GET = createPublicApiHandler(getCapabilitiesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})