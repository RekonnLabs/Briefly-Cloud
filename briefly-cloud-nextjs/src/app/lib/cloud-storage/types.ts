/**
 * Cloud Storage Provider Types
 * 
 * Common interfaces and types for cloud storage providers
 */

export interface CloudStorageFile {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
  webViewLink?: string
  downloadUrl?: string
  isShortcut?: boolean
  originalId?: string
}

export interface CloudStorageFolder {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  webViewLink?: string
}

export interface CloudStorageListResponse {
  files: CloudStorageFile[]
  folders: CloudStorageFolder[]
  nextPageToken?: string | null
  hasMore: boolean
}

export interface CloudStorageProvider {
  listFiles(
    userId: string,
    folderId?: string,
    pageToken?: string,
    pageSize?: number
  ): Promise<CloudStorageListResponse>
  
  downloadFile(userId: string, fileId: string): Promise<Buffer>
  
  getFileMetadata?(userId: string, fileId: string): Promise<CloudStorageFile>
}

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  modifiedTime?: string
  webViewLink?: string
  shortcutDetails?: {
    targetId: string
    targetMimeType: string
  }
}

export interface OneDriveFile {
  id: string
  name: string
  size?: number
  lastModifiedDateTime?: string
  webUrl?: string
  file?: {
    mimeType?: string
  }
  folder?: {
    childCount?: number
  }
  '@microsoft.graph.downloadUrl'?: string
}
