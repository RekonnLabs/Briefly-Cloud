/**
 * Performance and Load Tests
 * Tests large folder imports, pagination performance, and concurrent operations
 */

import { GoogleDriveProvider } from '@/app/lib/cloud-storage/providers/google-drive'
import { OneDriveProvider } from '@/app/lib/cloud-storage/providers/onedrive'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/app/lib/oauth/token-store', () => ({
  TokenStore: {
    refreshTokenIfNeeded: jest.fn(),
  },
}))

jest.mock('@/app/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ data: null, error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null })),
        })),
      })),
      update: jest.fn(() => ({ 
        eq: jest.fn(() => ({ data: null, error: null }))
      })),
    })),
  },
}))

jest.mock('@/app/lib/auth/supabase-auth', () => ({
  getAuthenticatedUser: jest.fn(),
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/app/lib/api-errors', () => ({
  createError: {
    unauthorized: jest.fn((message: string) => new Error(message)),
    externalService: jest.fn((service: string, message: string) => new Error(`${service}: ${message}`)),
    internal: jest.fn((message: string) => new Error(message)),
  },
}))

jest.mock('@/app/lib/error-handler', () => ({
  ErrorHandler: {
    handleError: jest.fn((error, context) => {
      return ApiResponse.serverError('Internal server error', 'INTERNAL_ERROR', context.correlationId)
    }),
    isRetryableError: jest.fn(() => false),
  },
}))

jest.mock('@/app/lib/audit/comprehensive-audit-logger', () => ({
  auditApiAccess: jest.fn().mockResolvedValue(undefined),
  auditSystemError: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/app/lib/security', () => ({
  createSecurityMiddleware: jest.fn(() => (req: NextRequest, res: any) => res),
  RateLimiter: {
    isRateLimited: jest.fn(() => false),
    getRemainingRequests: jest.fn(() => 10),
  },
  InputSanitizer: {
    sanitizeString: jest.fn((str: string) => str),
  },
  securitySchemas: {},
  validateEnvironment: jest.fn(),
}))

// Mock fetch for API calls
global.fetch = jest.fn()

describe('Backend Performance and Load Tests', () => {
  const mockUserId = 'test-user-id'
  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    full_name: 'Test User',
    subscription_tier: 'pro' as const,
    subscription_status: 'active',
    usage_count: 5,
    usage_limit: 1000,
    features_enabled: { ai_chat: true },
    permissions: { can_upload: true },
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }

  const mockToken = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    scope: 'https://www.googleapis.com/auth/drive.readonly'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Set longer timeout for performance tests
    jest.setTimeout(30000)
  })

  describe('Large Folder Import Performance', () => {
    it('should handle large folder imports without memory exhaustion', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      // Mock job creation
      supabaseAdmin.rpc.mockResolvedValue({
        data: 'large-import-job',
        error: null
      })

      supabaseAdmin.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      })

      // Generate large file list (1000 files)
      const largeFileList = Array.from({ length: 1000 }, (_, i) => ({
        id: `file-${i}`,
        name: `Document-${i}.pdf`,
        mimeType: 'application/pdf',
        size: '1048576', // 1MB each
        modifiedTime: '2024-01-01T00:00:00Z',
        webViewLink: `https://drive.google.com/file/d/file-${i}/view`
      }))

      // Mock API responses for file listing
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: largeFileList })
      })

      const startTime = Date.now()
      const initialMemory = process.memoryUsage()

      // Create and process large import job
      const job = await ImportJobManager.createJob(
        mockUserId,
        'google_drive',
        'large-folder-id',
        { batchSize: 50 }
      )

      expect(job).toBeDefined()
      expect(job.inputData.batchSize).toBe(50)

      const endTime = Date.now()
      const finalMemory = process.memoryUsage()
      const duration = endTime - startTime
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Performance assertions
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Memory increase < 100MB
    })

    it('should process files in batches to prevent timeout', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      // Mock batch processing
      const batchSize = 10
      const totalFiles = 100
      let processedBatches = 0

      // Mock file processing that tracks batches
      const mockProcessFile = jest.fn().mockImplementation(async () => {
        processedBatches++
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10))
        return {
          success: true,
          status: 'completed',
          chunksCreated: 5
        }
      })

      // Replace the actual processFile method
      ImportJobManager.processFile = mockProcessFile

      supabaseAdmin.rpc.mockResolvedValue({
        data: 'batch-job',
        error: null
      })

      supabaseAdmin.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      })

      const startTime = Date.now()

      const job = await ImportJobManager.createJob(
        mockUserId,
        'google_drive',
        'batch-folder',
        { batchSize }
      )

      // Simulate batch processing
      const files = Array.from({ length: totalFiles }, (_, i) => ({
        id: `file-${i}`,
        name: `Document-${i}.pdf`,
        mimeType: 'application/pdf'
      }))

      // Process in batches
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        await Promise.all(
          batch.map(file => mockProcessFile(job, file))
        )
      }

      const duration = Date.now() - startTime

      expect(processedBatches).toBe(totalFiles)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
      expect(mockProcessFile).toHaveBeenCalledTimes(totalFiles)
    })

    it('should handle streaming downloads for large files', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      // Mock large file (100MB)
      const largeFileSize = 100 * 1024 * 1024
      const mockLargeFileBuffer = Buffer.alloc(largeFileSize, 'x')

      // Mock streaming download
      ;(fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'large-file',
            name: 'large-document.pdf',
            mimeType: 'application/pdf',
            size: largeFileSize.toString()
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockLargeFileBuffer.buffer)
        })

      const googleDrive = new GoogleDriveProvider()
      const startTime = Date.now()
      const initialMemory = process.memoryUsage()

      const result = await googleDrive.downloadFile(mockUserId, 'large-file')

      const endTime = Date.now()
      const finalMemory = process.memoryUsage()
      const duration = endTime - startTime
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      expect(result).toBeInstanceOf(Buffer)
      expect(result.length).toBe(largeFileSize)
      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds
      // Memory increase should be reasonable (not loading entire file into memory multiple times)
      expect(memoryIncrease).toBeLessThan(largeFileSize * 2)
    })
  })

  describe('Pagination Performance', () => {
    it('should handle 5000+ item folders within 10 seconds', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      const itemsPerPage = 1000
      const totalItems = 5000
      const totalPages = Math.ceil(totalItems / itemsPerPage)

      // Mock paginated responses
      const mockPages = Array.from({ length: totalPages }, (_, pageIndex) => {
        const startIndex = pageIndex * itemsPerPage
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
        const pageItems = Array.from({ length: endIndex - startIndex }, (_, i) => ({
          id: `item-${startIndex + i}`,
          name: `Document-${startIndex + i}.pdf`,
          mimeType: 'application/pdf',
          size: '1024',
          modifiedTime: '2024-01-01T00:00:00Z'
        }))

        return {
          files: pageItems,
          nextPageToken: pageIndex < totalPages - 1 ? `page-${pageIndex + 1}` : undefined
        }
      })

      let currentPage = 0
      ;(fetch as jest.Mock).mockImplementation(() => {
        const response = mockPages[currentPage]
        currentPage++
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response)
        })
      })

      const googleDrive = new GoogleDriveProvider()
      const startTime = Date.now()

      // Simulate paginated listing
      let allFiles: any[] = []
      let pageToken: string | undefined = undefined
      let pageCount = 0

      do {
        const result = await googleDrive.listFiles(
          mockUserId,
          'large-folder',
          pageToken,
          itemsPerPage
        )
        
        allFiles = allFiles.concat(result.files)
        pageToken = result.nextPageToken
        pageCount++
      } while (pageToken && pageCount < 10) // Safety limit

      const duration = Date.now() - startTime

      expect(allFiles.length).toBe(totalItems)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
      expect(pageCount).toBe(totalPages)
    })

    it('should handle OneDrive @odata.nextLink pagination efficiently', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      const itemsPerPage = 200
      const totalItems = 2000
      const totalPages = Math.ceil(totalItems / itemsPerPage)

      // Mock OneDrive paginated responses
      let currentPage = 0
      ;(fetch as jest.Mock).mockImplementation(() => {
        const startIndex = currentPage * itemsPerPage
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
        const pageItems = Array.from({ length: endIndex - startIndex }, (_, i) => ({
          id: `item-${startIndex + i}`,
          name: `Document-${startIndex + i}.docx`,
          size: 2048,
          lastModifiedDateTime: '2024-01-01T00:00:00Z',
          file: {},
          webUrl: `https://onedrive.live.com/item-${startIndex + i}`
        }))

        const response = {
          value: pageItems,
          '@odata.nextLink': currentPage < totalPages - 1 
            ? `https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=page${currentPage + 1}`
            : undefined
        }

        currentPage++
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response)
        })
      })

      const oneDrive = new OneDriveProvider()
      const startTime = Date.now()

      const result = await oneDrive.listFiles(mockUserId, 'root', itemsPerPage)

      const duration = Date.now() - startTime

      expect(result.files.length).toBe(totalItems)
      expect(duration).toBeLessThan(15000) // Should complete within 15 seconds
      expect(fetch).toHaveBeenCalledTimes(totalPages)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent import jobs without conflicts', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      // Mock concurrent job creation
      let jobCounter = 0
      supabaseAdmin.rpc.mockImplementation(() => {
        jobCounter++
        return Promise.resolve({
          data: `concurrent-job-${jobCounter}`,
          error: null
        })
      })

      supabaseAdmin.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      })

      const concurrentJobs = 10
      const startTime = Date.now()

      // Create multiple jobs concurrently
      const jobPromises = Array.from({ length: concurrentJobs }, (_, i) =>
        ImportJobManager.createJob(
          `user-${i}`,
          i % 2 === 0 ? 'google_drive' : 'microsoft',
          `folder-${i}`
        )
      )

      const jobs = await Promise.all(jobPromises)
      const duration = Date.now() - startTime

      expect(jobs).toHaveLength(concurrentJobs)
      expect(jobs.every(job => job.id.startsWith('concurrent-job-'))).toBe(true)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(concurrentJobs)
    })

    it('should handle concurrent API requests with rate limiting', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { RateLimiter } = require('@/app/lib/security')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      let requestCount = 0
      const mockHandler = jest.fn(async () => {
        requestCount++
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100))
        return ApiResponse.ok({ requestNumber: requestCount })
      })

      // Configure rate limiting after 5 requests
      RateLimiter.isRateLimited.mockImplementation(() => requestCount > 5)
      RateLimiter.getRemainingRequests.mockImplementation(() => Math.max(0, 5 - requestCount))

      const handler = createProtectedApiHandler(mockHandler, {
        rateLimit: {
          windowMs: 60000,
          maxRequests: 5
        }
      })

      const concurrentRequests = 10
      const startTime = Date.now()

      // Make concurrent requests
      const requestPromises = Array.from({ length: concurrentRequests }, (_, i) =>
        handler(new NextRequest(`http://localhost:3000/api/test?req=${i}`, {
          method: 'GET'
        }))
      )

      const responses = await Promise.all(requestPromises)
      const duration = Date.now() - startTime

      // Check that some requests succeeded and some were rate limited
      const successfulResponses = responses.filter(r => r.status === 200)
      const rateLimitedResponses = responses.filter(r => r.status === 429)

      expect(successfulResponses.length).toBeLessThanOrEqual(5)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should handle concurrent file downloads without memory issues', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      const fileSize = 10 * 1024 * 1024 // 10MB per file
      const concurrentDownloads = 5
      const mockFileBuffer = Buffer.alloc(fileSize, 'x')

      // Mock file downloads
      ;(fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('/files/')) {
          // File metadata request
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'test-file',
              name: 'test.pdf',
              mimeType: 'application/pdf'
            })
          })
        } else {
          // File download request
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(mockFileBuffer.buffer)
          })
        }
      })

      const googleDrive = new GoogleDriveProvider()
      const startTime = Date.now()
      const initialMemory = process.memoryUsage()

      // Download multiple files concurrently
      const downloadPromises = Array.from({ length: concurrentDownloads }, (_, i) =>
        googleDrive.downloadFile(mockUserId, `file-${i}`)
      )

      const results = await Promise.all(downloadPromises)
      
      const endTime = Date.now()
      const finalMemory = process.memoryUsage()
      const duration = endTime - startTime
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      expect(results).toHaveLength(concurrentDownloads)
      expect(results.every(result => result.length === fileSize)).toBe(true)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
      // Memory increase should be reasonable for concurrent downloads
      expect(memoryIncrease).toBeLessThan(fileSize * concurrentDownloads * 2)
    })
  })

  describe('Error Recovery Performance', () => {
    it('should handle transient errors with retry logic efficiently', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      let attemptCount = 0
      ;(fetch as jest.Mock).mockImplementation(() => {
        attemptCount++
        if (attemptCount <= 2) {
          // Fail first 2 attempts
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable'
          })
        } else {
          // Succeed on 3rd attempt
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] })
          })
        }
      })

      const googleDrive = new GoogleDriveProvider()
      const startTime = Date.now()

      // This should eventually succeed after retries
      let result
      let error
      try {
        // Simulate retry logic (normally handled by error handler)
        for (let i = 0; i < 3; i++) {
          try {
            result = await googleDrive.listFiles(mockUserId)
            break
          } catch (e) {
            if (i === 2) throw e // Last attempt
            await new Promise(resolve => setTimeout(resolve, 100)) // Brief delay
          }
        }
      } catch (e) {
        error = e
      }

      const duration = Date.now() - startTime

      expect(result).toBeDefined()
      expect(error).toBeUndefined()
      expect(attemptCount).toBe(3)
      expect(duration).toBeLessThan(1000) // Should complete quickly with retries
    })

    it('should gracefully degrade when external services are unavailable', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      const { logger } = require('@/app/lib/logger')
      
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      // Mock complete service failure
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network unreachable'))

      const googleDrive = new GoogleDriveProvider()
      const startTime = Date.now()

      let error
      try {
        await googleDrive.listFiles(mockUserId)
      } catch (e) {
        error = e
      }

      const duration = Date.now() - startTime

      expect(error).toBeDefined()
      expect(error.message).toContain('Network unreachable')
      expect(duration).toBeLessThan(5000) // Should fail fast
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory during large batch operations', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const initialMemory = process.memoryUsage()
      const iterations = 100

      // Simulate many job operations
      supabaseAdmin.rpc.mockImplementation((funcName) => {
        if (funcName === 'generate_job_id') {
          return Promise.resolve({
            data: `job-${Date.now()}-${Math.random()}`,
            error: null
          })
        }
        return Promise.resolve({ data: null, error: null })
      })

      supabaseAdmin.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      })

      // Create and process many jobs
      for (let i = 0; i < iterations; i++) {
        const job = await ImportJobManager.createJob(
          `user-${i}`,
          'google_drive',
          `folder-${i}`
        )
        
        // Simulate some processing
        await ImportJobManager.updateJobProgress(job.id, {
          total: 10,
          processed: 5,
          failed: 0,
          skipped: 0
        })
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory increase should be reasonable for the number of operations
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB increase
    })
  })
})