/**
 * Google Picker File Registration Integration Tests
 * 
 * Tests file registration API with various file types, processing queue integration,
 * and error handling for unsupported files
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { NextRequest } from 'next/server'
import { POST } from '../register-files/route'
import { 
  registerSelectedFiles,
  isSupportedMimeType,
  getSupportedFileTypes,
  getProcessingQueueStatus,
  SUPPORTED_MIME_TYPES,
  type SelectedFile,
  type FileRegistrationResult
} from '@/app/lib/google-picker/file-registration-service'
import { createFileMetadata } from '@/app/lib/supabase'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { validateFileRegistrationPermissions } from '@/app/lib/google-picker/permission-validator'
import { logFileRegistration } from '@/app/lib/google-picker/audit-service'
import { logger } from '@/app/lib/logger'

// Mock dependencies
jest.mock('@/app/lib/supabase')
jest.mock('@/app/lib/jobs/import-job-manager')
jest.mock('@/app/lib/google-picker/permission-validator')
jest.mock('@/app/lib/google-picker/audit-service')
jest.mock('@/app/lib/logger')
jest.mock('@/app/lib/api-middleware', () => ({
  createProtectedApiHandler: (handler: any) => handler
}))

const mockCreateFileMetadata = createFileMetadata as jest.MockedFunction<typeof createFileMetadata>
const mockImportJobManager = ImportJobManager as jest.Mocked<typeof ImportJobManager>
const mockValidateFileRegistrationPermissions = validateFileRegistrationPermissions as jest.MockedFunction<typeof validateFileRegistrationPermissions>
const mockLogFileRegistration = logFileRegistration as jest.MockedFunction<typeof logFileRegistration>
const mockLogger = logger as jest.Mocked<typeof logger>

describe('File Registration Integration Tests', () => {
  const testUserId = 'test-user-123'
  const testUser = { id: testUserId, email: 'test@example.com' }
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default successful mocks
    mockValidateFileRegistrationPermissions.mockReturnValue({
      isValid: true,
      hasMinimalPermissions: true,
      violations: [],
      riskLevel: 'low',
      actionRequired: []
    })
    
    mockCreateFileMetadata.mockImplementation(async (metadata) => ({
      id: `file-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...metadata
    }))
    
    mockImportJobManager.createJob.mockResolvedValue({
      id: 'job-123',
      userId: testUserId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'google_drive',
      totalFiles: 1,
      processedFiles: 0,
      failedFiles: 0,
      metadata: {}
    })
    
    mockImportJobManager.processJob.mockResolvedValue(undefined)
    mockImportJobManager.getUserJobs.mockResolvedValue([])
  })

  describe('API Route Handler', () => {
    const createRequest = (body: any) => {
      return new NextRequest('http://localhost/api/storage/google/register-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }

    const createContext = () => ({
      user: testUser,
      request: {} as NextRequest,
      params: {}
    })

    it('should register supported files successfully', async () => {
      // Arrange
      const requestBody = {
        files: [
          {
            id: 'pdf-file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024000,
            downloadUrl: 'https://drive.google.com/file/d/pdf-file-1/view'
          },
          {
            id: 'docx-file-2',
            name: 'presentation.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: 512000
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.data.success).toBe(true)
      expect(responseData.data.registeredFiles).toHaveLength(2)
      expect(responseData.data.summary.registered).toBe(2)
      expect(responseData.data.summary.supported).toBe(2)
      expect(responseData.data.summary.unsupported).toBe(0)
      expect(responseData.data.summary.failed).toBe(0)

      // Verify database calls
      expect(mockCreateFileMetadata).toHaveBeenCalledTimes(2)
      expect(mockImportJobManager.createJob).toHaveBeenCalledTimes(2)
      expect(mockLogFileRegistration).toHaveBeenCalledWith(
        testUserId,
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            fileId: 'pdf-file-1',
            fileName: 'document.pdf',
            mimeType: 'application/pdf',
            status: 'pending'
          }),
          expect.objectContaining({
            fileId: 'docx-file-2',
            fileName: 'presentation.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            status: 'pending'
          })
        ])
      )
    })

    it('should handle mixed supported and unsupported files', async () => {
      // Arrange
      const requestBody = {
        files: [
          {
            id: 'pdf-file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024000
          },
          {
            id: 'unsupported-file-2',
            name: 'video.mp4',
            mimeType: 'video/mp4',
            size: 5120000
          },
          {
            id: 'txt-file-3',
            name: 'notes.txt',
            mimeType: 'text/plain',
            size: 2048
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.data.success).toBe(true)
      expect(responseData.data.registeredFiles).toHaveLength(3)
      expect(responseData.data.summary.registered).toBe(3)
      expect(responseData.data.summary.supported).toBe(2)
      expect(responseData.data.summary.unsupported).toBe(1)
      expect(responseData.data.summary.failed).toBe(0)

      // Verify supported files were queued
      expect(mockImportJobManager.createJob).toHaveBeenCalledTimes(2)
      
      // Verify unsupported file was registered but not queued
      const unsupportedFile = responseData.data.registeredFiles.find(
        (f: any) => f.fileId === 'unsupported-file-2'
      )
      expect(unsupportedFile.status).toBe('unsupported')
      expect(unsupportedFile.queuedForProcessing).toBe(false)
    })

    it('should validate request format and reject invalid requests', async () => {
      // Arrange
      const invalidRequestBody = {
        files: [
          {
            id: 'file-1',
            // Missing required fields: name, mimeType, size
          }
        ]
      }

      const request = createRequest(invalidRequestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('Invalid request format')
      expect(responseData.data.errors).toContain('files[0].name: Must be a non-empty string')
      expect(responseData.data.errors).toContain('files[0].mimeType: Must be a non-empty string')
      expect(responseData.data.errors).toContain('files[0].size: Must be a non-negative number')
    })

    it('should reject empty files array', async () => {
      // Arrange
      const requestBody = { files: [] }
      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(responseData.success).toBe(false)
      expect(responseData.data.errors).toContain('Files array cannot be empty')
    })

    it('should reject files exceeding size limit', async () => {
      // Arrange
      const requestBody = {
        files: [
          {
            id: 'large-file-1',
            name: 'huge-document.pdf',
            mimeType: 'application/pdf',
            size: 60 * 1024 * 1024 // 60MB - exceeds 50MB limit
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(responseData.success).toBe(false)
      expect(responseData.data.errors).toContain('files[0].size: File too large (max 50MB)')
    })

    it('should reject too many files in single request', async () => {
      // Arrange
      const files = Array.from({ length: 51 }, (_, i) => ({
        id: `file-${i}`,
        name: `document-${i}.pdf`,
        mimeType: 'application/pdf',
        size: 1024
      }))

      const requestBody = { files }
      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(responseData.success).toBe(false)
      expect(responseData.data.errors).toContain('Cannot register more than 50 files at once')
    })

    it('should handle permission validation failures', async () => {
      // Arrange
      mockValidateFileRegistrationPermissions.mockReturnValue({
        isValid: false,
        hasMinimalPermissions: false,
        violations: ['insufficient_scope'],
        riskLevel: 'high',
        actionRequired: ['reconnect_with_proper_scope']
      })

      const requestBody = {
        files: [
          {
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024000
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(responseData.data.success).toBe(false)
      expect(responseData.data.summary.failed).toBe(1)
      expect(responseData.data.errors[0].reason).toContain('Token does not have required permissions')
    })

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockCreateFileMetadata.mockRejectedValue(new Error('Database connection failed'))

      const requestBody = {
        files: [
          {
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024000
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(responseData.data.success).toBe(false)
      expect(responseData.data.summary.failed).toBe(1)
      expect(responseData.data.errors[0].error).toBe('Registration failed')
    })

    it('should handle job queue failures gracefully', async () => {
      // Arrange
      mockImportJobManager.createJob.mockRejectedValue(new Error('Queue service unavailable'))

      const requestBody = {
        files: [
          {
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024000
          }
        ]
      }

      const request = createRequest(requestBody)
      const context = createContext()

      // Act
      const response = await POST(request, context)
      const responseData = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(responseData.data.success).toBe(true)
      expect(responseData.data.summary.registered).toBe(1)
      
      // File should be registered but not queued
      const registeredFile = responseData.data.registeredFiles[0]
      expect(registeredFile.queuedForProcessing).toBe(false)
    })
  })

  describe('File Registration Service', () => {
    it('should register files with proper metadata', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'google-doc-1',
          name: 'Meeting Notes.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 256000,
          downloadUrl: 'https://docs.google.com/document/d/google-doc-1/export'
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(result.success).toBe(true)
      expect(result.registeredFiles).toHaveLength(1)
      expect(result.errors).toHaveLength(0)
      
      const registeredFile = result.registeredFiles[0]
      expect(registeredFile.fileId).toBe('google-doc-1')
      expect(registeredFile.name).toBe('Meeting Notes.docx')
      expect(registeredFile.status).toBe('pending')
      expect(registeredFile.queuedForProcessing).toBe(true)

      // Verify database call with correct metadata
      expect(mockCreateFileMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: testUserId,
          name: 'Meeting Notes.docx',
          size: 256000,
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          source: 'google',
          external_id: 'google-doc-1',
          external_url: 'https://docs.google.com/document/d/google-doc-1/export',
          processed: false,
          processing_status: 'pending',
          metadata: expect.objectContaining({
            picker_selected: true,
            selected_at: expect.any(String),
            original_size: 256000,
            download_url: 'https://docs.google.com/document/d/google-doc-1/export'
          })
        })
      )
    })

    it('should handle Google Workspace native formats', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'google-doc-1',
          name: 'Google Doc',
          mimeType: 'application/vnd.google-apps.document',
          size: 0 // Google Docs don't have traditional file sizes
        },
        {
          id: 'google-sheet-1',
          name: 'Google Sheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          size: 0
        },
        {
          id: 'google-slides-1',
          name: 'Google Slides',
          mimeType: 'application/vnd.google-apps.presentation',
          size: 0
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(result.success).toBe(true)
      expect(result.registeredFiles).toHaveLength(3)
      expect(result.summary.supported).toBe(3)
      
      // All should be queued for processing
      expect(result.registeredFiles.every(f => f.queuedForProcessing)).toBe(true)
      expect(mockImportJobManager.createJob).toHaveBeenCalledTimes(3)
    })

    it('should validate file metadata and reject invalid files', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: '',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        },
        {
          id: 'file-2',
          name: '',
          mimeType: 'application/pdf',
          size: 1024000
        },
        {
          id: 'file-3',
          name: 'document.pdf',
          mimeType: '',
          size: 1024000
        },
        {
          id: 'file-4',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: -1
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(result.success).toBe(false)
      expect(result.registeredFiles).toHaveLength(0)
      expect(result.errors).toHaveLength(4)
      
      expect(result.errors[0].reason).toBe('Invalid file ID')
      expect(result.errors[1].reason).toBe('Invalid file name')
      expect(result.errors[2].reason).toBe('Invalid MIME type')
      expect(result.errors[3].reason).toBe('Invalid file size')
    })

    it('should handle permission validation with warnings', async () => {
      // Arrange
      mockValidateFileRegistrationPermissions.mockReturnValue({
        isValid: true,
        hasMinimalPermissions: true,
        violations: ['additional_metadata_scope'],
        riskLevel: 'medium',
        actionRequired: ['consider_scope_reduction']
      })

      const files: SelectedFile[] = [
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files, 'https://www.googleapis.com/auth/drive', 'token-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.registeredFiles).toHaveLength(1)
      expect(result.permissionValidation?.riskLevel).toBe('medium')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File registration proceeding with permission warnings',
        expect.objectContaining({
          userId: testUserId,
          tokenId: 'token-123',
          violations: ['additional_metadata_scope']
        })
      )
    })
  })

  describe('MIME Type Support', () => {
    it('should correctly identify supported MIME types', () => {
      // Test supported types
      expect(isSupportedMimeType('application/pdf')).toBe(true)
      expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
      expect(isSupportedMimeType('text/plain')).toBe(true)
      expect(isSupportedMimeType('application/vnd.google-apps.document')).toBe(true)

      // Test unsupported types
      expect(isSupportedMimeType('video/mp4')).toBe(false)
      expect(isSupportedMimeType('image/jpeg')).toBe(false)
      expect(isSupportedMimeType('application/zip')).toBe(false)
    })

    it('should provide comprehensive supported file types information', () => {
      // Act
      const supportedTypes = getSupportedFileTypes()

      // Assert
      expect(supportedTypes.mimeTypes).toEqual(SUPPORTED_MIME_TYPES)
      expect(supportedTypes.extensions).toContain('.pdf')
      expect(supportedTypes.extensions).toContain('.docx')
      expect(supportedTypes.extensions).toContain('.txt')
      
      expect(supportedTypes.categories.documents).toContain('application/pdf')
      expect(supportedTypes.categories.spreadsheets).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(supportedTypes.categories.presentations).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(supportedTypes.categories.text).toContain('text/plain')
    })
  })

  describe('Processing Queue Integration', () => {
    it('should create processing jobs for supported files', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'pdf-file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        },
        {
          id: 'docx-file-2',
          name: 'presentation.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 512000
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(mockImportJobManager.createJob).toHaveBeenCalledTimes(2)
      expect(mockImportJobManager.createJob).toHaveBeenCalledWith(
        testUserId,
        'google_drive',
        undefined,
        {
          batchSize: 1,
          maxRetries: 3
        }
      )
      
      expect(mockImportJobManager.processJob).toHaveBeenCalledTimes(2)
      expect(result.registeredFiles.every(f => f.queuedForProcessing)).toBe(true)
    })

    it('should not create jobs for unsupported files', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'video-file-1',
          name: 'presentation.mp4',
          mimeType: 'video/mp4',
          size: 5120000
        },
        {
          id: 'image-file-2',
          name: 'diagram.png',
          mimeType: 'image/png',
          size: 256000
        }
      ]

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(mockImportJobManager.createJob).not.toHaveBeenCalled()
      expect(mockImportJobManager.processJob).not.toHaveBeenCalled()
      expect(result.registeredFiles.every(f => !f.queuedForProcessing)).toBe(true)
      expect(result.registeredFiles.every(f => f.status === 'unsupported')).toBe(true)
    })

    it('should get processing queue status', async () => {
      // Arrange
      const mockJobs = [
        { id: 'job-1', status: 'pending', createdAt: new Date().toISOString() },
        { id: 'job-2', status: 'processing', createdAt: new Date().toISOString() },
        { id: 'job-3', status: 'completed', createdAt: new Date().toISOString() },
        { id: 'job-4', status: 'failed', createdAt: new Date().toISOString() },
        { id: 'job-5', status: 'completed', createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() } // 2 days ago
      ]
      
      mockImportJobManager.getUserJobs.mockResolvedValue(mockJobs as any)

      // Act
      const status = await getProcessingQueueStatus(testUserId)

      // Assert
      expect(status.pendingJobs).toBe(1)
      expect(status.processingJobs).toBe(1)
      expect(status.recentCompletedJobs).toBe(1) // Only recent ones
      expect(status.recentFailedJobs).toBe(1)
    })

    it('should handle queue status errors gracefully', async () => {
      // Arrange
      mockImportJobManager.getUserJobs.mockRejectedValue(new Error('Database error'))

      // Act
      const status = await getProcessingQueueStatus(testUserId)

      // Assert
      expect(status).toEqual({
        pendingJobs: 0,
        processingJobs: 0,
        recentCompletedJobs: 0,
        recentFailedJobs: 0
      })
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get processing queue status',
        expect.objectContaining({
          userId: testUserId,
          error: 'Database error'
        })
      )
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle partial failures gracefully', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'good-file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        },
        {
          id: 'bad-file-2',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        }
      ]

      // Mock first file success, second file failure
      mockCreateFileMetadata
        .mockResolvedValueOnce({
          id: 'app-file-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: testUserId,
          name: 'document.pdf',
          path: 'document.pdf',
          size: 1024000,
          mime_type: 'application/pdf',
          source: 'google',
          external_id: 'good-file-1',
          processed: false,
          processing_status: 'pending',
          metadata: {}
        })
        .mockRejectedValueOnce(new Error('Database constraint violation'))

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(result.success).toBe(false)
      expect(result.registeredFiles).toHaveLength(1)
      expect(result.errors).toHaveLength(1)
      expect(result.summary.registered).toBe(1)
      expect(result.summary.failed).toBe(1)
      
      expect(result.errors[0].fileId).toBe('bad-file-2')
      expect(result.errors[0].error).toBe('Registration failed')
    })

    it('should continue processing after job queue failures', async () => {
      // Arrange
      const files: SelectedFile[] = [
        {
          id: 'file-1',
          name: 'document1.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        },
        {
          id: 'file-2',
          name: 'document2.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        }
      ]

      // Mock job creation failure for first file, success for second
      mockImportJobManager.createJob
        .mockRejectedValueOnce(new Error('Queue service unavailable'))
        .mockResolvedValueOnce({
          id: 'job-2',
          userId: testUserId,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'google_drive',
          totalFiles: 1,
          processedFiles: 0,
          failedFiles: 0,
          metadata: {}
        })

      // Act
      const result = await registerSelectedFiles(testUserId, files)

      // Assert
      expect(result.success).toBe(true)
      expect(result.registeredFiles).toHaveLength(2)
      expect(result.errors).toHaveLength(0)
      
      // First file registered but not queued
      expect(result.registeredFiles[0].queuedForProcessing).toBe(false)
      // Second file registered and queued
      expect(result.registeredFiles[1].queuedForProcessing).toBe(true)
    })
  })
})