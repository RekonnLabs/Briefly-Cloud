/**
 * OneDrive Provider
 * 
 * Microsoft OneDrive integration with:
 * - @odata.nextLink pagination support
 * - Microsoft Graph API integration
 * - Root and specific folder ID navigation
 * - Complete file listings by following all pages
 */

import { TokenStore } from '@/app/lib/oauth/token-store'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import type { 
  CloudStorageProvider, 
  CloudStorageListResponse, 
  CloudStorageFile,
  CloudStorageFolder,
  OneDriveFile 
} from '../types'

export class OneDriveProvider implements CloudStorageProvider {
  /**
   * List files and folders from OneDrive with @odata.nextLink pagination
   */
  async listFiles(
    userId: string,
    folderId: string = 'root',
    pageToken?: string,
    pageSize: number = 100
  ): Promise<CloudStorageListResponse> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'microsoft')
      if (!token) {
        throw createError.unauthorized('No valid OneDrive token found')
      }

      let allFiles: CloudStorageFile[] = []
      let allFolders: CloudStorageFolder[] = []
      let nextLink: string | null = null

      // Build initial URL - handle both root and specific folder IDs
      let baseUrl: string
      if (folderId === 'root') {
        baseUrl = 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      } else {
        baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
      }

      let currentUrl = `${baseUrl}?$top=${pageSize}&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,@microsoft.graph.downloadUrl`

      // Follow @odata.nextLink until exhausted for complete listings
      do {
        const response = await fetch(currentUrl, {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error('OneDrive API error', {
            userId,
            folderId,
            status: response.status,
            error: errorText
          })
          throw createError.externalService('OneDrive', response.statusText)
        }

        const data = await response.json()

        // Process files and folders from this page
        const items: OneDriveFile[] = data.value || []
        
        const files = items
          .filter(item => item.file)
          .map(item => ({
            id: item.id,
            name: item.name,
            mimeType: item.file?.mimeType || 'application/octet-stream',
            size: item.size,
            modifiedTime: item.lastModifiedDateTime,
            webViewLink: item.webUrl,
            downloadUrl: item['@microsoft.graph.downloadUrl']
          }))

        const folders = items
          .filter(item => item.folder)
          .map(item => ({
            id: item.id,
            name: item.name,
            mimeType: 'application/vnd.ms-folder',
            modifiedTime: item.lastModifiedDateTime,
            webViewLink: item.webUrl
          }))

        allFiles.push(...files)
        allFolders.push(...folders)

        // Check for next page
        nextLink = data['@odata.nextLink'] || null
        currentUrl = nextLink || ''

        logger.debug('OneDrive page processed', {
          userId,
          folderId,
          pageFiles: files.length,
          pageFolders: folders.length,
          hasNextPage: !!nextLink
        })

      } while (nextLink)

      logger.info('OneDrive files listed successfully', {
        userId,
        folderId,
        totalFiles: allFiles.length,
        totalFolders: allFolders.length
      })

      return {
        files: allFiles,
        folders: allFolders,
        nextPageToken: null, // OneDrive doesn't use tokens, we fetch all pages
        hasMore: false
      }
    } catch (error) {
      logger.error('Error listing OneDrive files', {
        userId,
        folderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Download file from OneDrive using Microsoft Graph API
   */
  async downloadFile(userId: string, fileId: string): Promise<Buffer> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'microsoft')
      if (!token) {
        throw createError.unauthorized('No valid OneDrive token found')
      }

      // Get download URL from file metadata
      const metadataResponse = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?$select=@microsoft.graph.downloadUrl,name,size`,
        {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text()
        logger.error('OneDrive metadata error', {
          userId,
          fileId,
          status: metadataResponse.status,
          error: errorText
        })
        throw createError.externalService('OneDrive', `Failed to get file metadata: ${metadataResponse.statusText}`)
      }

      const metadata = await metadataResponse.json()
      const downloadUrl = metadata['@microsoft.graph.downloadUrl']

      if (!downloadUrl) {
        throw createError.externalService('OneDrive', 'No download URL available for this file')
      }

      // Download the file using the direct download URL
      const downloadResponse = await fetch(downloadUrl)

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text()
        logger.error('OneDrive download error', {
          userId,
          fileId,
          status: downloadResponse.status,
          error: errorText
        })
        throw createError.externalService('OneDrive', `Failed to download file: ${downloadResponse.statusText}`)
      }

      const buffer = Buffer.from(await downloadResponse.arrayBuffer())
      
      logger.info('OneDrive file downloaded successfully', {
        userId,
        fileId,
        fileName: metadata.name,
        size: buffer.length
      })

      return buffer
    } catch (error) {
      logger.error('Error downloading OneDrive file', {
        userId,
        fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get file metadata from OneDrive
   */
  async getFileMetadata(userId: string, fileId: string): Promise<CloudStorageFile> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'microsoft')
      if (!token) {
        throw createError.unauthorized('No valid OneDrive token found')
      }

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?$select=id,name,size,lastModifiedDateTime,webUrl,file,@microsoft.graph.downloadUrl`,
        {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('OneDrive metadata error', {
          userId,
          fileId,
          status: response.status,
          error: errorText
        })
        throw createError.externalService('OneDrive', `Failed to get file metadata: ${response.statusText}`)
      }

      const item: OneDriveFile = await response.json()

      return {
        id: item.id,
        name: item.name,
        mimeType: item.file?.mimeType || 'application/octet-stream',
        size: item.size,
        modifiedTime: item.lastModifiedDateTime,
        webViewLink: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl']
      }
    } catch (error) {
      logger.error('Error getting OneDrive file metadata', {
        userId,
        fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }
}
