/**
 * Google Drive Provider
 * 
 * Enhanced Google Drive integration with support for:
 * - Shared Drives and shortcuts
 * - Google Docs export
 * - Proper pagination with nextPageToken
 * - Folder navigation
 */

import { TokenStore } from '@/app/lib/oauth/token-store'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import type { 
  CloudStorageProvider, 
  CloudStorageListResponse, 
  CloudStorageFile,
  CloudStorageFolder,
  GoogleDriveFile 
} from '../types'

export class GoogleDriveProvider implements CloudStorageProvider {
  /**
   * List files and folders from Google Drive with enhanced features
   */
  async listFiles(
    userId: string,
    folderId: string = 'root',
    pageToken?: string,
    pageSize: number = 100
  ): Promise<CloudStorageListResponse> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'google')
      if (!token) {
        throw createError.unauthorized('No valid Google Drive token found')
      }

      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,parents,modifiedTime,webViewLink,shortcutDetails)',
        pageSize: pageSize.toString(),
        orderBy: 'folder,name',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      })

      if (pageToken) {
        params.set('pageToken', pageToken)
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google Drive API error', {
          userId,
          folderId,
          status: response.status,
          error: errorText
        })
        throw createError.externalService('Google Drive', response.statusText)
      }

      const data = await response.json()

      // Process files and handle shortcuts
      const processedFiles = data.files?.map((file: GoogleDriveFile) => {
        // Resolve shortcuts to their target
        if (file.mimeType === 'application/vnd.google-apps.shortcut' && file.shortcutDetails) {
          return {
            ...file,
            id: file.shortcutDetails.targetId,
            mimeType: file.shortcutDetails.targetMimeType,
            isShortcut: true,
            originalId: file.id
          }
        }
        return file
      }) || []

      // Separate files and folders
      const files: CloudStorageFile[] = processedFiles
        .filter((f: GoogleDriveFile) => 
          !f.mimeType.startsWith('application/vnd.google-apps.folder') &&
          f.mimeType !== 'application/vnd.google-apps.shortcut'
        )
        .map((f: GoogleDriveFile) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size) : undefined,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          isShortcut: (f as any).isShortcut,
          originalId: (f as any).originalId
        }))

      const folders: CloudStorageFolder[] = processedFiles
        .filter((f: GoogleDriveFile) => 
          f.mimeType.startsWith('application/vnd.google-apps.folder')
        )
        .map((f: GoogleDriveFile) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink
        }))

      logger.info('Google Drive files listed successfully', {
        userId,
        folderId,
        filesCount: files.length,
        foldersCount: folders.length,
        hasMore: !!data.nextPageToken
      })

      return {
        files,
        folders,
        nextPageToken: data.nextPageToken,
        hasMore: !!data.nextPageToken
      }
    } catch (error) {
      logger.error('Error listing Google Drive files', {
        userId,
        folderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Download file from Google Drive with Google Docs export support
   */
  async downloadFile(userId: string, fileId: string): Promise<Buffer> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'google')
      if (!token) {
        throw createError.unauthorized('No valid Google Drive token found')
      }

      // Get file metadata to determine download method
      const fileMetadata = await this.getFileMetadata(userId, fileId)
      let downloadUrl: string

      if (fileMetadata.mimeType.startsWith('application/vnd.google-apps.')) {
        // Export Google Docs formats
        const exportMimeType = this.getExportMimeType(fileMetadata.mimeType)
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`
      } else {
        // Direct download for regular files
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      }

      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google Drive download error', {
          userId,
          fileId,
          status: response.status,
          error: errorText
        })
        throw createError.externalService('Google Drive', `Failed to download file: ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      
      logger.info('Google Drive file downloaded successfully', {
        userId,
        fileId,
        size: buffer.length
      })

      return buffer
    } catch (error) {
      logger.error('Error downloading Google Drive file', {
        userId,
        fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(userId: string, fileId: string): Promise<CloudStorageFile> {
    try {
      const token = await TokenStore.refreshTokenIfNeeded(userId, 'google')
      if (!token) {
        throw createError.unauthorized('No valid Google Drive token found')
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink`,
        {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google Drive metadata error', {
          userId,
          fileId,
          status: response.status,
          error: errorText
        })
        throw createError.externalService('Google Drive', `Failed to get file metadata: ${response.statusText}`)
      }

      const file: GoogleDriveFile = await response.json()

      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size) : undefined,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink
      }
    } catch (error) {
      logger.error('Error getting Google Drive file metadata', {
        userId,
        fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get appropriate export MIME type for Google Docs formats
   */
  private getExportMimeType(googleMimeType: string): string {
    const exportMap: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.google-apps.drawing': 'image/png',
      'application/vnd.google-apps.script': 'application/vnd.google-apps.script+json'
    }

    return exportMap[googleMimeType] || 'text/plain'
  }
}
