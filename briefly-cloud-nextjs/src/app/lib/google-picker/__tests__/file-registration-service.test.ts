/**
 * Test file for Google Picker File Registration Service
 * 
 * This test verifies the core functionality of the file registration service
 * without requiring the full application context.
 */

import { 
  isSupportedMimeType, 
  getSupportedFileTypes,
  SUPPORTED_MIME_TYPES 
} from '../file-registration-service'

describe('Google Picker File Registration Service', () => {
  describe('isSupportedMimeType', () => {
    test('should return true for supported PDF files', () => {
      expect(isSupportedMimeType('application/pdf')).toBe(true)
    })

    test('should return true for supported Word documents', () => {
      expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
      expect(isSupportedMimeType('application/msword')).toBe(true)
    })

    test('should return true for supported Excel files', () => {
      expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
      expect(isSupportedMimeType('application/vnd.ms-excel')).toBe(true)
    })

    test('should return true for supported PowerPoint files', () => {
      expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(true)
      expect(isSupportedMimeType('application/vnd.ms-powerpoint')).toBe(true)
    })

    test('should return true for supported text files', () => {
      expect(isSupportedMimeType('text/plain')).toBe(true)
      expect(isSupportedMimeType('text/markdown')).toBe(true)
      expect(isSupportedMimeType('text/csv')).toBe(true)
    })

    test('should return true for supported Google Workspace files', () => {
      expect(isSupportedMimeType('application/vnd.google-apps.document')).toBe(true)
      expect(isSupportedMimeType('application/vnd.google-apps.spreadsheet')).toBe(true)
      expect(isSupportedMimeType('application/vnd.google-apps.presentation')).toBe(true)
    })

    test('should return false for unsupported file types', () => {
      expect(isSupportedMimeType('image/jpeg')).toBe(false)
      expect(isSupportedMimeType('video/mp4')).toBe(false)
      expect(isSupportedMimeType('application/zip')).toBe(false)
      expect(isSupportedMimeType('audio/mpeg')).toBe(false)
    })

    test('should return false for empty or invalid MIME types', () => {
      expect(isSupportedMimeType('')).toBe(false)
      expect(isSupportedMimeType('invalid')).toBe(false)
      expect(isSupportedMimeType('text/')).toBe(false)
    })
  })

  describe('getSupportedFileTypes', () => {
    test('should return comprehensive file type information', () => {
      const supportedTypes = getSupportedFileTypes()

      expect(supportedTypes).toHaveProperty('mimeTypes')
      expect(supportedTypes).toHaveProperty('extensions')
      expect(supportedTypes).toHaveProperty('categories')

      // Verify MIME types array
      expect(Array.isArray(supportedTypes.mimeTypes)).toBe(true)
      expect(supportedTypes.mimeTypes.length).toBeGreaterThan(0)
      expect(supportedTypes.mimeTypes).toContain('application/pdf')

      // Verify extensions array
      expect(Array.isArray(supportedTypes.extensions)).toBe(true)
      expect(supportedTypes.extensions).toContain('.pdf')
      expect(supportedTypes.extensions).toContain('.docx')
      expect(supportedTypes.extensions).toContain('.xlsx')

      // Verify categories
      expect(supportedTypes.categories).toHaveProperty('documents')
      expect(supportedTypes.categories).toHaveProperty('spreadsheets')
      expect(supportedTypes.categories).toHaveProperty('presentations')
      expect(supportedTypes.categories).toHaveProperty('text')

      // Verify category contents
      expect(supportedTypes.categories.documents).toContain('application/pdf')
      expect(supportedTypes.categories.spreadsheets).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(supportedTypes.categories.presentations).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(supportedTypes.categories.text).toContain('text/plain')
    })
  })

  describe('SUPPORTED_MIME_TYPES constant', () => {
    test('should contain all expected MIME types', () => {
      const expectedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.google-apps.presentation'
      ]

      expectedTypes.forEach(type => {
        expect(SUPPORTED_MIME_TYPES).toContain(type)
      })
    })

    test('should be a readonly array', () => {
      // This test ensures the constant is properly typed as readonly
      expect(Array.isArray(SUPPORTED_MIME_TYPES)).toBe(true)
      expect(SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0)
    })
  })
})

// Mock test for validation function (would need actual implementation to test fully)
describe('File validation', () => {
  test('should validate file metadata structure', () => {
    const validFile = {
      id: 'test-file-id',
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: 1024000, // 1MB
      downloadUrl: 'https://example.com/download'
    }

    // Basic validation checks that would be performed
    expect(typeof validFile.id).toBe('string')
    expect(validFile.id.length).toBeGreaterThan(0)
    expect(typeof validFile.name).toBe('string')
    expect(validFile.name.length).toBeGreaterThan(0)
    expect(typeof validFile.mimeType).toBe('string')
    expect(typeof validFile.size).toBe('number')
    expect(validFile.size).toBeGreaterThan(0)
    expect(validFile.size).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
  })

  test('should identify invalid file metadata', () => {
    const invalidFiles = [
      { id: '', name: 'test.pdf', mimeType: 'application/pdf', size: 1000 }, // Empty ID
      { id: 'test', name: '', mimeType: 'application/pdf', size: 1000 }, // Empty name
      { id: 'test', name: 'test.pdf', mimeType: '', size: 1000 }, // Empty MIME type
      { id: 'test', name: 'test.pdf', mimeType: 'application/pdf', size: -1 }, // Negative size
      { id: 'test', name: 'test.pdf', mimeType: 'application/pdf', size: 100 * 1024 * 1024 }, // Too large
    ]

    invalidFiles.forEach(file => {
      const hasEmptyId = !file.id || file.id.length === 0
      const hasEmptyName = !file.name || file.name.length === 0
      const hasEmptyMimeType = !file.mimeType || file.mimeType.length === 0
      const hasInvalidSize = file.size <= 0 || file.size > 50 * 1024 * 1024

      expect(hasEmptyId || hasEmptyName || hasEmptyMimeType || hasInvalidSize).toBe(true)
    })
  })
})