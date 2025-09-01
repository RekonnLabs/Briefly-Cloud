/**
 * Cloud Storage Integration Tests
 * Tests file listing, pagination, import job creation, and error handling
 */

import { GoogleDriveProvider } from '@/app/lib/cloud-storage/providers/google-drive'
import { OneDriveProvider } from '@/app/lib/cloud-storage/providers/onedrive'
import { ImportJobManager, type ImportJob } from '@/app/lib/jobs/import-job-manager'
import type { CloudStorageListResponse, CloudStorageFile } from '@/app/lib/cloud-storage/types'

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

// Mock fetch for API calls
global.fetch = jest.fn()

describe('Cloud Storage Integration Tests', () => {
  const mockUserId = 'test-user-id'
  const mockToken = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    scope: 'https://www.googleapis.com/auth/drive.readonly'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GoogleDriveProvider', () => {
    const googleDrive = new GoogleDriveProvider()

    describe('listFiles', () => {
      it('should list files with pagination successfully', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockApiResponse = {
          nextPageToken: 'next-page-token',
          files: [
            {
              id: 'file-1',
              name: 'Document.pdf',
              mimeType: 'application/pdf',
              size: '1024',
              modifiedTime: '2024-01-01T00:00:00Z',
              webViewLink: 'https://drive.google.com/file/d/file-1/view'
            },
            {
              id: 'folder-1',
              name: 'My Folder',
              mimeType: 'application/vnd.google-apps.folder',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          ]
        }

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockApiResponse)
        })

        const result = await googleDrive.listFiles(mockUserId, 'root', undefined, 50)

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://www.googleapis.com/drive/v3/files'),
          expect.objectContaining({
            headers: {
              'Authorization': `Bearer ${mockToken.accessToken}`,
              'Content-Type': 'application/json'
            }
          })
        )

        expect(result).toMatchObject({
          files: expect.arrayContaining([
            expect.objectContaining({
              id: 'file-1',
              name: 'Document.pdf',
              mimeType: 'application/pdf'
            })
          ]),
          folders: expect.arrayContaining([
            expect.objectContaining({
              id: 'folder-1',
              name: 'My Folder'
            })
          ]),
          nextPageToken: 'next-page-token',
          hasMore: true
        })
      })

      it('should handle Google Drive shortcuts correctly', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockApiResponse = {
          files: [
            {
              id: 'shortcut-1',
              name: 'Shortcut to Document',
              mimeType: 'application/vnd.google-apps.shortcut',
              shortcutDetails: {
                targetId: 'target-file-1',
                targetMimeType: 'application/pdf'
              }
            }
          ]
        }

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockApiResponse)
        })

        const result = await googleDrive.listFiles(mockUserId)

        expect(result.files).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'target-file-1', // Should use target ID
              name: 'Shortcut to Document',
              mimeType: 'application/pdf', // Should use target MIME type
              isShortcut: true,
              originalId: 'shortcut-1'
            })
          ])
        )
      })

      it('should handle pagination with pageToken', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockApiResponse = {
          files: [
            {
              id: 'file-2',
              name: 'Second Page Document.pdf',
              mimeType: 'application/pdf',
              size: '2048',
              modifiedTime: '2024-01-02T00:00:00Z'
            }
          ]
        }

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockApiResponse)
        })

        await googleDrive.listFiles(mockUserId, 'root', 'page-token-123', 25)

        const fetchCall = (fetch as jest.Mock).mock.calls[0]
        const url = fetchCall[0]
        
        expect(url).toContain('pageToken=page-token-123')
        expect(url).toContain('pageSize=25')
      })

      it('should handle API errors gracefully', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        const { logger } = require('@/app/lib/logger')
        
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve('Insufficient permissions')
        })

        await expect(
          googleDrive.listFiles(mockUserId)
        ).rejects.toThrow('Google Drive: Forbidden')

        expect(logger.error).toHaveBeenCalledWith(
          'Google Drive API error',
          expect.objectContaining({
            userId: mockUserId,
            status: 403,
            error: 'Insufficient permissions'
          })
        )
      })

      it('should handle missing token', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(null)

        await expect(
          googleDrive.listFiles(mockUserId)
        ).rejects.toThrow('No valid Google Drive token found')
      })

      it('should support Shared Drives with supportsAllDrives parameter', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ files: [] })
        })

        await googleDrive.listFiles(mockUserId, 'shared-drive-id')

        const fetchCall = (fetch as jest.Mock).mock.calls[0]
        const url = fetchCall[0]
        
        expect(url).toContain('supportsAllDrives=true')
        expect(url).toContain('includeItemsFromAllDrives=true')
      })
    })

    describe('downloadFile', () => {
      it('should download regular files successfully', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockFileContent = Buffer.from('PDF file content')

        // Mock file metadata call
        ;(fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              id: 'file-1',
              name: 'document.pdf',
              mimeType: 'application/pdf'
            })
          })
          // Mock file download call
          .mockResolvedValueOnce({
            ok: true,
            arrayBuffer: () => Promise.resolve(mockFileContent.buffer)
          })

        const result = await googleDrive.downloadFile(mockUserId, 'file-1')

        expect(result).toEqual(mockFileContent)
        expect(fetch).toHaveBeenCalledTimes(2)
      })

      it('should handle Google Docs export', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockExportedContent = Buffer.from('Exported document content')

        // Mock file metadata call for Google Doc
        ;(fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              id: 'doc-1',
              name: 'Google Doc',
              mimeType: 'application/vnd.google-apps.document'
            })
          })
          // Mock export call
          .mockResolvedValueOnce({
            ok: true,
            arrayBuffer: () => Promise.resolve(mockExportedContent.buffer)
          })

        const result = await googleDrive.downloadFile(mockUserId, 'doc-1')

        expect(result).toEqual(mockExportedContent)
        
        const exportCall = (fetch as jest.Mock).mock.calls[1]
        const exportUrl = exportCall[0]
        
        expect(exportUrl).toContain('/export?mimeType=')
        expect(exportUrl).toContain('application%2Fpdf') // URL encoded PDF MIME type
      })

      it('should handle download errors', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        // Mock file metadata call
        ;(fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              id: 'file-1',
              mimeType: 'application/pdf'
            })
          })
          // Mock failed download
          .mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found'
          })

        await expect(
          googleDrive.downloadFile(mockUserId, 'file-1')
        ).rejects.toThrow('Failed to download file: Not Found')
      })
    })
  })

  describe('OneDriveProvider', () => {
    const oneDrive = new OneDriveProvider()

    describe('listFiles', () => {
      it('should list files with @odata.nextLink pagination', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        const mockFirstPage = {
          value: [
            {
              id: 'file-1',
              name: 'Document.docx',
              size: 1024,
              lastModifiedDateTime: '2024-01-01T00:00:00Z',
              file: {},
              webUrl: 'https://onedrive.live.com/file-1'
            }
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc123'
        }

        const mockSecondPage = {
          value: [
            {
              id: 'folder-1',
              name: 'My Folder',
              lastModifiedDateTime: '2024-01-01T00:00:00Z',
              folder: { childCount: 5 }
            }
          ]
        }

        ;(fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockFirstPage)
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSecondPage)
          })

        const result = await oneDrive.listFiles(mockUserId, 'root', 50)

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(result.files).toHaveLength(1)
        expect(result.folders).toHaveLength(1)
        expect(result.hasMore).toBe(false) // All pages fetched
      })

      it('should handle specific folder navigation', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ value: [] })
        })

        await oneDrive.listFiles(mockUserId, 'folder-id-123')

        const fetchCall = (fetch as jest.Mock).mock.calls[0]
        const url = fetchCall[0]
        
        expect(url).toContain('/me/drive/items/folder-id-123/children')
      })

      it('should handle OneDrive API errors', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        const { logger } = require('@/app/lib/logger')
        
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        ;(fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: () => Promise.resolve('Token expired')
        })

        await expect(
          oneDrive.listFiles(mockUserId)
        ).rejects.toThrow('OneDrive: Unauthorized')

        expect(logger.error).toHaveBeenCalledWith(
          'OneDrive API error',
          expect.objectContaining({
            userId: mockUserId,
            status: 401,
            error: 'Token expired'
          })
        )
      })
    })
  })

  describe('ImportJobManager', () => {
    describe('createJob', () => {
      it('should create import job successfully', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        // Mock job ID generation
        supabaseAdmin.rpc.mockResolvedValueOnce({
          data: 'import_1234567890_abcdef123',
          error: null
        })

        // Mock job insertion
        supabaseAdmin.from.mockReturnValue({
          insert: jest.fn().mockResolvedValue({ data: null, error: null })
        })

        const job = await ImportJobManager.createJob(
          mockUserId,
          'google_drive',
          'folder-123',
          { batchSize: 10, maxRetries: 3 }
        )

        expect(job).toMatchObject({
          id: 'import_1234567890_abcdef123',
          userId: mockUserId,
          provider: 'google_drive',
          folderId: 'folder-123',
          status: 'pending',
          progress: {
            total: 0,
            processed: 0,
            failed: 0,
            skipped: 0,
            percentage: 0
          }
        })

        expect(supabaseAdmin.rpc).toHaveBeenCalledWith('generate_job_id', {
          job_type: 'import'
        })
      })

      it('should handle job creation errors', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.rpc.mockResolvedValue({
          data: null,
          error: { message: 'Function not found' }
        })

        await expect(
          ImportJobManager.createJob(mockUserId, 'google_drive')
        ).rejects.toThrow('Database error: Failed to generate job ID')
      })

      it('should use default values for optional parameters', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.rpc.mockResolvedValue({
          data: 'import_test_job',
          error: null
        })

        supabaseAdmin.from.mockReturnValue({
          insert: jest.fn().mockResolvedValue({ data: null, error: null })
        })

        const job = await ImportJobManager.createJob(mockUserId, 'microsoft')

        expect(job.folderId).toBe('root')
        expect(job.inputData).toMatchObject({
          provider: 'microsoft',
          folderId: 'root',
          batchSize: 5,
          maxRetries: 3
        })
      })
    })

    describe('getJob', () => {
      it('should retrieve job with progress information', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        const mockJobData = {
          id: 'test-job-id',
          user_id: mockUserId,
          job_type: 'import',
          status: 'processing',
          input_data: { provider: 'google_drive', folderId: 'root' },
          progress: { total: 10, processed: 5, failed: 1, skipped: 0 },
          created_at: '2024-01-01T00:00:00Z',
          started_at: '2024-01-01T00:01:00Z'
        }

        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockJobData,
                error: null
              })
            })
          })
        })

        const job = await ImportJobManager.getJob('test-job-id')

        expect(job).toMatchObject({
          id: 'test-job-id',
          userId: mockUserId,
          provider: 'google_drive',
          status: 'processing',
          progress: {
            total: 10,
            processed: 5,
            failed: 1,
            skipped: 0,
            percentage: 50
          }
        })
      })

      it('should return null for non-existent job', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'No rows returned' }
              })
            })
          })
        })

        const job = await ImportJobManager.getJob('non-existent-job')

        expect(job).toBeNull()
      })
    })

    describe('updateJobProgress', () => {
      it('should update job progress and calculate percentage', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.from.mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })

        await ImportJobManager.updateJobProgress('test-job-id', {
          total: 20,
          processed: 15,
          failed: 2,
          skipped: 1
        })

        expect(supabaseAdmin.from().update).toHaveBeenCalledWith({
          progress: {
            total: 20,
            processed: 15,
            failed: 2,
            skipped: 1,
            percentage: 90 // (15 + 2 + 1) / 20 * 100
          },
          updated_at: expect.any(String)
        })
      })

      it('should handle zero total files', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.from.mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })

        await ImportJobManager.updateJobProgress('test-job-id', {
          total: 0,
          processed: 0,
          failed: 0,
          skipped: 0
        })

        expect(supabaseAdmin.from().update).toHaveBeenCalledWith({
          progress: expect.objectContaining({
            percentage: 0
          }),
          updated_at: expect.any(String)
        })
      })
    })

    describe('Duplicate Detection', () => {
      it('should detect duplicate files using content hash', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        // Mock existing file with same hash
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'existing-file-id',
                    content_hash: 'abc123hash',
                    provider_version: 'google_drive:file-123:v1'
                  },
                  error: null
                })
              })
            })
          })
        })

        const isDuplicate = await ImportJobManager.checkDuplicate(
          mockUserId,
          'file-123',
          'google_drive',
          'abc123hash'
        )

        expect(isDuplicate).toBe(true)
      })

      it('should not detect duplicate for new files', async () => {
        const { supabaseAdmin } = require('@/app/lib/supabase-admin')
        
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'No rows returned' }
                })
              })
            })
          })
        })

        const isDuplicate = await ImportJobManager.checkDuplicate(
          mockUserId,
          'new-file-123',
          'google_drive',
          'newfilehash'
        )

        expect(isDuplicate).toBe(false)
      })
    })

    describe('Error Handling', () => {
      it('should handle provider connection errors', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(null)

        const result = await ImportJobManager.processFile(
          {
            id: 'test-job',
            userId: mockUserId,
            provider: 'google_drive'
          } as ImportJob,
          {
            id: 'file-1',
            name: 'test.pdf',
            mimeType: 'application/pdf'
          } as CloudStorageFile
        )

        expect(result).toMatchObject({
          success: false,
          status: 'failed',
          error: expect.stringContaining('No valid Google Drive token')
        })
      })

      it('should handle file processing errors gracefully', async () => {
        const { TokenStore } = require('@/app/lib/oauth/token-store')
        const { logger } = require('@/app/lib/logger')
        
        TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

        // Mock download failure
        ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

        const result = await ImportJobManager.processFile(
          {
            id: 'test-job',
            userId: mockUserId,
            provider: 'google_drive'
          } as ImportJob,
          {
            id: 'file-1',
            name: 'test.pdf',
            mimeType: 'application/pdf'
          } as CloudStorageFile
        )

        expect(result).toMatchObject({
          success: false,
          status: 'failed',
          error: expect.stringContaining('Network error')
        })

        expect(logger.error).toHaveBeenCalledWith(
          'File processing failed',
          expect.objectContaining({
            jobId: 'test-job',
            fileId: 'file-1',
            error: 'Network error'
          })
        )
      })
    })
  })

  describe('Performance Tests', () => {
    it('should handle large file lists efficiently', async () => {
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.refreshTokenIfNeeded.mockResolvedValue(mockToken)

      // Generate large file list
      const largeFileList = Array.from({ length: 5000 }, (_, i) => ({
        id: `file-${i}`,
        name: `Document-${i}.pdf`,
        mimeType: 'application/pdf',
        size: '1024',
        modifiedTime: '2024-01-01T00:00:00Z'
      }))

      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: largeFileList })
      })

      const startTime = Date.now()
      const result = await new GoogleDriveProvider().listFiles(mockUserId, 'root', undefined, 5000)
      const duration = Date.now() - startTime

      expect(result.files).toHaveLength(5000)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should handle concurrent import jobs', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      // Mock multiple job creations
      supabaseAdmin.rpc
        .mockResolvedValueOnce({ data: 'job-1', error: null })
        .mockResolvedValueOnce({ data: 'job-2', error: null })
        .mockResolvedValueOnce({ data: 'job-3', error: null })

      supabaseAdmin.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      })

      const jobPromises = [
        ImportJobManager.createJob(mockUserId, 'google_drive', 'folder-1'),
        ImportJobManager.createJob(mockUserId, 'microsoft', 'folder-2'),
        ImportJobManager.createJob(mockUserId, 'google_drive', 'folder-3')
      ]

      const jobs = await Promise.all(jobPromises)

      expect(jobs).toHaveLength(3)
      expect(jobs[0].id).toBe('job-1')
      expect(jobs[1].id).toBe('job-2')
      expect(jobs[2].id).toBe('job-3')
    })
  })
})