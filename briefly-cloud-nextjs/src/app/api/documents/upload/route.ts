/**
 * Document Upload API Route
 * 
 * This endpoint handles document uploads with comprehensive
 * usage tracking, rate limiting, and tier enforcement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withUploadControls } from '@/app/lib/usage/usage-middleware'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * POST /api/documents/upload
 * 
 * Upload and process a document
 */
export const POST = withAuth(
  withUploadControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Parse multipart form data
      const formData = await request.formData()
      const file = formData.get('file') as File
      const title = formData.get('title') as string
      const description = formData.get('description') as string
      
      if (!file) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'No file provided',
            message: 'Please select a file to upload'
          },
          { status: 400 }
        )
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]

      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid file type',
            message: 'Please upload a PDF, DOCX, TXT, MD, XLS, or XLSX file'
          },
          { status: 400 }
        )
      }

      // Validate file size (50MB max for free tier, 100MB for pro)
      const maxSize = user.subscription_tier === 'free' ? 50 * 1024 * 1024 : 100 * 1024 * 1024
      
      if (file.size > maxSize) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'File too large',
            message: `File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB for your ${user.subscription_tier} plan`
          },
          { status: 400 }
        )
      }
      
      // Log the upload request
      logger.info('Processing document upload', {
        userId: user.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        title
      })
      
      // TODO: Implement actual document processing
      // This would include:
      // 1. Store file in cloud storage
      // 2. Extract text content
      // 3. Generate embeddings
      // 4. Store in vector database
      // 5. Update user's document count
      
      // Simulate document processing for now
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // Create response
      const response = {
        success: true,
        data: {
          documentId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          title: title || file.name,
          description: description || '',
          status: 'processing',
          uploadedAt: new Date().toISOString(),
          processingEstimate: '2-5 minutes',
          chunks: {
            estimated: Math.ceil(file.size / 1000), // Rough estimate
            processed: 0
          }
        }
      }
      
      logger.info('Document upload initiated successfully', {
        userId: user.id,
        documentId,
        fileName: file.name
      })
      
      return NextResponse.json(response)
      
    } catch (error) {
      logger.error('Failed to process document upload', {
        userId: context.user.id,
        error: (error as Error).message
      })
      
      if (error instanceof Error) {
        // Handle specific error types
        if (error.message.includes('limit exceeded')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Upload limit exceeded',
              message: error.message,
              upgradeRequired: true
            },
            { status: 402 }
          )
        }
        
        if (error.message.includes('rate limit')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Rate limit exceeded',
              message: error.message,
              retryAfter: 60
            },
            { status: 429 }
          )
        }
        
        if (error.message.includes('storage')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Storage limit exceeded',
              message: error.message,
              upgradeRequired: true
            },
            { status: 402 }
          )
        }
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to upload document',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)