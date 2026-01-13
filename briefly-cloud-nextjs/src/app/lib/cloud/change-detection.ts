/**
 * Cloud File Change Detection
 * 
 * Evaluates whether a cloud file should be re-indexed based on changes
 */

import { logger } from '@/app/lib/logger'
import type { FileRecord } from '@/app/lib/repos/files-repo'

export interface CloudFileMetadata {
  id: string
  name: string
  path?: string
  size?: number
  mimeType?: string
  modifiedAt?: string
  revision?: string
  version?: string
  etag?: string
  cTag?: string
}

export interface ChangeEvaluationResult {
  shouldReindex: boolean
  reasons: string[]
  changes: {
    revision?: boolean
    size?: boolean
    modifiedAt?: boolean
    name?: boolean
    path?: boolean
  }
}

/**
 * Evaluate if a cloud file should be re-indexed
 * 
 * @param cloudFile - File metadata from cloud provider (via Apideck)
 * @param existingFile - Existing file record from database (or null if new)
 * @returns Evaluation result with shouldReindex flag and reasons
 */
export function shouldReindexCloudFile(
  cloudFile: CloudFileMetadata,
  existingFile: FileRecord | null
): ChangeEvaluationResult {
  const reasons: string[] = []
  const changes: ChangeEvaluationResult['changes'] = {}

  // New file - always index
  if (!existingFile) {
    reasons.push('New file')
    return {
      shouldReindex: true,
      reasons,
      changes
    }
  }

  // Check revision/version/etag (strongest signal of change)
  const cloudRevision = cloudFile.revision || cloudFile.version || cloudFile.etag || cloudFile.cTag
  const existingRevision = existingFile.source_revision

  if (cloudRevision && existingRevision && cloudRevision !== existingRevision) {
    reasons.push(`Revision changed: ${existingRevision} → ${cloudRevision}`)
    changes.revision = true
  }

  // Check file size
  if (cloudFile.size !== undefined && existingFile.source_size !== undefined) {
    if (cloudFile.size !== existingFile.source_size) {
      reasons.push(`Size changed: ${existingFile.source_size} → ${cloudFile.size} bytes`)
      changes.size = true
    }
  }

  // Check modified timestamp
  if (cloudFile.modifiedAt && existingFile.source_modified_at) {
    const cloudModifiedTime = new Date(cloudFile.modifiedAt).getTime()
    const existingModifiedTime = new Date(existingFile.source_modified_at).getTime()

    // Allow 1 second tolerance for timestamp precision differences
    if (Math.abs(cloudModifiedTime - existingModifiedTime) > 1000) {
      reasons.push(`Modified time changed: ${existingFile.source_modified_at} → ${cloudFile.modifiedAt}`)
      changes.modifiedAt = true
    }
  }

  // Check name change (rename)
  if (cloudFile.name && existingFile.name && cloudFile.name !== existingFile.name) {
    reasons.push(`Name changed: ${existingFile.name} → ${cloudFile.name}`)
    changes.name = true
  }

  // Check path change (move)
  if (cloudFile.path && existingFile.source_path && cloudFile.path !== existingFile.source_path) {
    reasons.push(`Path changed: ${existingFile.source_path} → ${cloudFile.path}`)
    changes.path = true
  }

  // Decision: reindex if any meaningful change detected
  const shouldReindex = reasons.length > 0

  if (shouldReindex) {
    logger.info('[CHANGE_DETECTION] File changed', {
      fileId: cloudFile.id,
      fileName: cloudFile.name,
      reasons,
      changes
    })
  }

  return {
    shouldReindex,
    reasons,
    changes
  }
}

/**
 * Normalize Apideck file response to CloudFileMetadata
 * 
 * Handles different field names from different providers
 */
export function normalizeApideckFile(apideckFile: any): CloudFileMetadata {
  return {
    id: apideckFile.id,
    name: apideckFile.name,
    path: apideckFile.path || apideckFile.parent_path,
    size: apideckFile.size,
    mimeType: apideckFile.mime_type || apideckFile.type,
    modifiedAt: apideckFile.updated_at || apideckFile.modified_at || apideckFile.modified_time,
    revision: apideckFile.revision,
    version: apideckFile.version,
    etag: apideckFile.etag || apideckFile.e_tag,
    cTag: apideckFile.ctag || apideckFile.c_tag
  }
}
