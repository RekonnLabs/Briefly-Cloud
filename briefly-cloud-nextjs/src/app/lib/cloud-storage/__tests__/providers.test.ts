/**
 * Test file for cloud storage providers
 * This is a basic test to verify the implementation structure
 */

import { GoogleDriveProvider } from '../providers/google-drive'
import { OneDriveProvider } from '../providers/onedrive'

describe('Cloud Storage Providers', () => {
  describe('GoogleDriveProvider', () => {
    it('should be instantiable', () => {
      const provider = new GoogleDriveProvider()
      expect(provider).toBeInstanceOf(GoogleDriveProvider)
    })

    it('should have required methods', () => {
      const provider = new GoogleDriveProvider()
      expect(typeof provider.listFiles).toBe('function')
      expect(typeof provider.downloadFile).toBe('function')
      expect(typeof provider.getFileMetadata).toBe('function')
    })
  })

  describe('OneDriveProvider', () => {
    it('should be instantiable', () => {
      const provider = new OneDriveProvider()
      expect(provider).toBeInstanceOf(OneDriveProvider)
    })

    it('should have required methods', () => {
      const provider = new OneDriveProvider()
      expect(typeof provider.listFiles).toBe('function')
      expect(typeof provider.downloadFile).toBe('function')
      expect(typeof provider.getFileMetadata).toBe('function')
    })
  })
})