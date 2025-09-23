/**
 * Files Repository Usage Examples
 * 
 * This file demonstrates how to use the updated FilesRepository with app schema.
 * These examples show the proper usage patterns for the new schema-aware implementation.
 */

import { filesRepo, type CreateFileInput, type UpdateFileInput } from './files-repo'

/**
 * Example: Creating a new file record
 */
export async function createFileExample() {
  const userId = 'user-123'
  
  const fileInput: CreateFileInput = {
    ownerId: userId,
    name: 'document.pdf',
    path: '/uploads/user-123/document.pdf',
    sizeBytes: 1024 * 1024, // 1MB
    mimeType: 'application/pdf',
    source: 'upload',
    metadata: {
      originalName: 'My Document.pdf',
      uploadedAt: new Date().toISOString(),
      userAgent: 'Mozilla/5.0...'
    }
  }

  try {
    const createdFile = await filesRepo.create(fileInput)
    console.log('File created:', createdFile.id)
    return createdFile
  } catch (error) {
    console.error('Failed to create file:', error)
    throw error
  }
}

/**
 * Example: Retrieving a file by ID
 */
export async function getFileExample() {
  const userId = 'user-123'
  const fileId = 'file-456'

  try {
    const file = await filesRepo.getById(userId, fileId)
    if (file) {
      console.log('File found:', file.name)
      return file
    } else {
      console.log('File not found')
      return null
    }
  } catch (error) {
    console.error('Failed to get file:', error)
    throw error
  }
}

/**
 * Example: Updating file processing status
 */
export async function updateProcessingStatusExample() {
  const userId = 'user-123'
  const fileId = 'file-456'

  try {
    // Mark as processing
    await filesRepo.updateProcessingStatus(userId, fileId, 'processing')
    console.log('File marked as processing')

    // Simulate processing...
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Mark as completed
    await filesRepo.updateProcessingStatus(userId, fileId, 'completed')
    console.log('File processing completed')
  } catch (error) {
    // Mark as failed on error
    await filesRepo.updateProcessingStatus(userId, fileId, 'failed')
    console.error('File processing failed:', error)
    throw error
  }
}

/**
 * Example: Listing user files with pagination
 */
export async function listUserFilesExample() {
  const userId = 'user-123'
  const limit = 20
  const offset = 0

  try {
    const files = await filesRepo.findByUserId(userId, limit, offset)
    console.log(`Found ${files.length} files for user`)
    
    files.forEach(file => {
      console.log(`- ${file.name} (${file.processing_status})`)
    })
    
    return files
  } catch (error) {
    console.error('Failed to list files:', error)
    throw error
  }
}

/**
 * Example: Searching files with filters
 */
export async function searchFilesExample() {
  const userId = 'user-123'

  try {
    const searchResult = await filesRepo.search(userId, {
      search: 'document',
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 10,
      offset: 0
    })

    console.log(`Found ${searchResult.count} files matching search`)
    console.log(`Returning ${searchResult.items.length} items`)
    
    return searchResult
  } catch (error) {
    console.error('Failed to search files:', error)
    throw error
  }
}

/**
 * Example: Updating file metadata
 */
export async function updateFileExample() {
  const userId = 'user-123'
  const fileId = 'file-456'

  const updates: UpdateFileInput = {
    name: 'renamed-document.pdf',
    metadata: {
      renamed: true,
      renamedAt: new Date().toISOString()
    }
  }

  try {
    await filesRepo.update(userId, fileId, updates)
    console.log('File updated successfully')
  } catch (error) {
    console.error('Failed to update file:', error)
    throw error
  }
}

/**
 * Example: Bulk operations
 */
export async function bulkOperationsExample() {
  const userId = 'user-123'
  const fileIds = ['file-1', 'file-2', 'file-3']

  try {
    // Bulk update
    const updatedFiles = await filesRepo.updateMany(userId, fileIds, {
      processed: true,
      processing_status: 'completed'
    })
    console.log(`Updated ${updatedFiles.length} files`)

    // Bulk delete
    const deletedIds = await filesRepo.deleteMany(userId, fileIds)
    console.log(`Deleted ${deletedIds.length} files`)
    
    return { updated: updatedFiles, deleted: deletedIds }
  } catch (error) {
    console.error('Bulk operations failed:', error)
    throw error
  }
}

/**
 * Example: Error handling patterns
 */
export async function errorHandlingExample() {
  const userId = 'user-123'

  try {
    // This will fail validation
    await filesRepo.create({
      ownerId: '', // Empty required field
      name: 'test.pdf',
      path: '/test.pdf',
      sizeBytes: 1024
    })
  } catch (error) {
    if (error.message.includes('Validation Error')) {
      console.log('Validation failed as expected')
      // Handle validation errors
    } else if (error.message.includes('Database Error')) {
      console.log('Database error occurred')
      // Handle database errors
    } else {
      console.log('Unexpected error:', error)
      // Handle other errors
    }
  }
}

/**
 * Example: Backward compatibility usage
 */
export async function backwardCompatibilityExample() {
  const userId = 'user-123'

  try {
    // This method maintains the old AppFile interface for compatibility
    const files = await filesRepo.listByOwner(userId)
    
    files.forEach(file => {
      // These properties match the old AppFile interface
      console.log(`File: ${file.name}`)
      console.log(`Owner: ${file.owner_id}`)
      console.log(`Size: ${file.size_bytes} bytes`)
      console.log(`Created: ${file.created_at}`)
    })
    
    return files
  } catch (error) {
    console.error('Backward compatibility example failed:', error)
    throw error
  }
}

/**
 * Example: Complete file lifecycle
 */
export async function completeFileLifecycleExample() {
  const userId = 'user-123'

  try {
    // 1. Create file
    const file = await filesRepo.create({
      ownerId: userId,
      name: 'lifecycle-test.pdf',
      path: '/uploads/lifecycle-test.pdf',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      source: 'upload',
      metadata: { test: true }
    })
    console.log('1. File created:', file.id)

    // 2. Start processing
    await filesRepo.updateProcessingStatus(userId, file.id, 'processing')
    console.log('2. Processing started')

    // 3. Update metadata during processing
    await filesRepo.update(userId, file.id, {
      metadata: { 
        test: true, 
        processed: true,
        chunks: 5
      }
    })
    console.log('3. Metadata updated')

    // 4. Complete processing
    await filesRepo.updateProcessingStatus(userId, file.id, 'completed')
    console.log('4. Processing completed')

    // 5. Retrieve final state
    const finalFile = await filesRepo.getById(userId, file.id)
    console.log('5. Final state:', finalFile?.processing_status)

    // 6. Clean up
    await filesRepo.delete(userId, file.id)
    console.log('6. File deleted')

    return finalFile
  } catch (error) {
    console.error('File lifecycle example failed:', error)
    throw error
  }
}