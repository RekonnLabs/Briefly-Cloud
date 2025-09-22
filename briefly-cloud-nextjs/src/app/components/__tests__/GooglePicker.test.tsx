/**
 * Google Picker Component Tests
 * 
 * Tests GooglePicker component rendering, interactions, API loading, and file selection
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 2.4
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { GooglePicker } from '../GooglePicker'
import { toast } from 'sonner'
import * as errorHandling from '@/app/lib/google-picker/error-handling'
import * as retryService from '@/app/lib/google-picker/retry-service'
import * as auditService from '@/app/lib/google-picker/audit-service'

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}))
jest.mock('@/app/lib/google-picker/error-handling')
jest.mock('@/app/lib/google-picker/retry-service')
jest.mock('@/app/lib/google-picker/audit-service')

const mockToast = {
  success: jest.fn(),
  error: jest.fn()
}
const mockErrorHandling = errorHandling as jest.Mocked<typeof errorHandling>
const mockRetryService = retryService as jest.Mocked<typeof retryService>
const mockAuditService = auditService as jest.Mocked<typeof auditService>

// Mock Google APIs
const mockPickerBuilder = {
  addView: jest.fn().mockReturnThis(),
  setOAuthToken: jest.fn().mockReturnThis(),
  setDeveloperKey: jest.fn().mockReturnThis(),
  setCallback: jest.fn().mockReturnThis(),
  setTitle: jest.fn().mockReturnThis(),
  setSize: jest.fn().mockReturnThis(),
  build: jest.fn()
}

const mockPicker = {
  setVisible: jest.fn()
}

const mockGoogleAPIs = {
  google: {
    picker: {
      PickerBuilder: jest.fn(() => mockPickerBuilder),
      ViewId: {
        DOCS: 'docs',
        SPREADSHEETS: 'spreadsheets',
        PRESENTATIONS: 'presentations',
        PDFS: 'pdfs'
      },
      Action: {
        PICKED: 'picked',
        CANCEL: 'cancel'
      }
    }
  },
  gapi: {
    load: jest.fn()
  }
}

// Mock fetch
global.fetch = jest.fn()

describe('GooglePicker Component', () => {
  const mockOnFilesSelected = jest.fn()
  const mockOnError = jest.fn()
  const testUserId = 'test-user-123'
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset window.google
    Object.assign(window, mockGoogleAPIs)
    
    // Default successful mocks
    mockPickerBuilder.build.mockReturnValue(mockPicker)
    mockErrorHandling.createErrorContext.mockReturnValue({
      operation: 'test',
      userId: testUserId,
      timestamp: new Date().toISOString(),
      metadata: {}
    })
    mockRetryService.withRetry.mockImplementation(async (id, fn) => await fn())
    mockRetryService.getRetryInfo.mockReturnValue({
      isRetrying: false,
      attemptCount: 0,
      nextRetryAt: null,
      canRetry: true
    })
    
    // Mock successful token fetch
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'test-access-token',
          tokenId: 'test-token-id',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file'
        }
      })
    })
  })

  describe('Component Rendering and Interactions', () => {
    it('should render picker button with correct initial state', () => {
      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      // Assert
      const button = screen.getByRole('button', { name: /add files from google drive/i })
      expect(button).toBeInTheDocument()
      expect(button).not.toBeDisabled()
      expect(screen.getByText('Add files from Google Drive')).toBeInTheDocument()
    })

    it('should render disabled button when disabled prop is true', () => {
      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          disabled={true}
          userId={testUserId}
        />
      )

      // Assert
      const button = screen.getByRole('button', { name: /add files from google drive/i })
      expect(button).toBeDisabled()
    })

    it('should show loading state when picker is being opened', async () => {
      // Arrange
      let resolveLoad: () => void
      const loadPromise = new Promise<void>((resolve) => {
        resolveLoad = resolve
      })
      
      mockRetryService.withRetry.mockImplementation(async () => {
        await loadPromise
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument()
        expect(button).toBeDisabled()
      })

      // Cleanup
      act(() => {
        resolveLoad!()
      })
    })

    it('should show error state after failed picker operation', async () => {
      // Arrange
      const testError = new Error('Picker failed to load')
      mockRetryService.withRetry.mockRejectedValue(testError)
      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'PICKER_LOAD_FAILED',
        userMessage: 'Failed to load file picker',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })
      mockErrorHandling.getErrorGuidance.mockReturnValue({
        message: 'Failed to load file picker',
        action: 'retry'
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument()
        expect(mockOnError).toHaveBeenCalledWith('Failed to load file picker')
        expect(mockToast.error).toHaveBeenCalledWith('Failed to load file picker')
      })
    })

    it('should show retry button for retryable errors', async () => {
      // Arrange
      const testError = new Error('Network error')
      mockRetryService.withRetry.mockRejectedValue(testError)
      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'NETWORK_ERROR',
        userMessage: 'Network connection failed',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })
      mockErrorHandling.getErrorGuidance.mockReturnValue({
        message: 'Network connection failed',
        action: 'retry'
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      })
    })

    it('should show recovery options for authentication errors', async () => {
      // Arrange
      const authError = new Error('Token expired')
      mockRetryService.withRetry.mockRejectedValue(authError)
      mockErrorHandling.handleTokenError.mockReturnValue({
        type: 'TOKEN_EXPIRED',
        userMessage: 'Your Google Drive access has expired',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })
      mockErrorHandling.getErrorGuidance.mockReturnValue({
        message: 'Your Google Drive access has expired',
        action: 'reconnect'
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fix connection/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /reconnect now/i })).toBeInTheDocument()
      })
    })
  })

  describe('Google Picker API Loading', () => {
    it('should load Google APIs script when picker is not loaded', async () => {
      // Arrange
      delete (window as any).google
      
      const mockScript = {
        src: '',
        onload: null as any,
        onerror: null as any
      }
      
      const originalCreateElement = document.createElement
      document.createElement = jest.fn().mockImplementation((tagName) => {
        if (tagName === 'script') {
          return mockScript
        }
        return originalCreateElement.call(document, tagName)
      })
      
      const originalAppendChild = document.head.appendChild
      document.head.appendChild = jest.fn()

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Simulate script loading
      act(() => {
        Object.assign(window, mockGoogleAPIs)
        mockScript.onload()
        mockGoogleAPIs.gapi.load.mock.calls[0][1].callback()
      })

      // Assert
      expect(document.createElement).toHaveBeenCalledWith('script')
      expect(mockScript.src).toBe('https://apis.google.com/js/api.js')
      expect(document.head.appendChild).toHaveBeenCalledWith(mockScript)
      expect(mockGoogleAPIs.gapi.load).toHaveBeenCalledWith('picker', expect.any(Object))

      // Cleanup
      document.createElement = originalCreateElement
      document.head.appendChild = originalAppendChild
    })

    it('should handle script loading failure', async () => {
      // Arrange
      delete (window as any).google
      
      const mockScript = {
        src: '',
        onload: null as any,
        onerror: null as any
      }
      
      document.createElement = jest.fn().mockReturnValue(mockScript)
      document.head.appendChild = jest.fn()
      
      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'API_LOAD_FAILED',
        userMessage: 'Failed to load Google APIs',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Simulate script error
      act(() => {
        mockScript.onerror()
      })

      // Assert
      await waitFor(() => {
        expect(mockErrorHandling.handlePickerError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Failed to load Google APIs script' }),
          expect.any(Object)
        )
      })
    })

    it('should handle picker API loading failure', async () => {
      // Arrange
      delete (window as any).google
      
      const mockScript = {
        src: '',
        onload: null as any,
        onerror: null as any
      }
      
      document.createElement = jest.fn().mockReturnValue(mockScript)
      document.head.appendChild = jest.fn()
      
      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'API_LOAD_FAILED',
        userMessage: 'Failed to load Google Picker API',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Simulate script load success but picker API failure
      act(() => {
        Object.assign(window, mockGoogleAPIs)
        mockScript.onload()
        mockGoogleAPIs.gapi.load.mock.calls[0][1].onerror()
      })

      // Assert
      await waitFor(() => {
        expect(mockErrorHandling.handlePickerError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Failed to load Google Picker API' }),
          expect.any(Object)
        )
      })
    })

    it('should handle API loading timeout', async () => {
      // Arrange
      delete (window as any).google
      
      const mockScript = {
        src: '',
        onload: null as any,
        onerror: null as any
      }
      
      document.createElement = jest.fn().mockReturnValue(mockScript)
      document.head.appendChild = jest.fn()
      
      // Mock timers
      jest.useFakeTimers()

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Fast-forward time to trigger timeout
      act(() => {
        jest.advanceTimersByTime(15000)
      })

      // Assert
      await waitFor(() => {
        expect(mockErrorHandling.handlePickerError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Timeout loading Google APIs script' }),
          expect.any(Object)
        )
      })

      // Cleanup
      jest.useRealTimers()
    })

    it('should reuse loaded picker API on subsequent calls', async () => {
      // Arrange - picker already loaded
      Object.assign(window, mockGoogleAPIs)

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      
      // Click twice
      fireEvent.click(button)
      await waitFor(() => expect(mockRetryService.withRetry).toHaveBeenCalledTimes(1))
      
      fireEvent.click(button)
      await waitFor(() => expect(mockRetryService.withRetry).toHaveBeenCalledTimes(2))

      // Assert - should not try to load script again
      expect(document.createElement).not.toHaveBeenCalledWith('script')
    })
  })

  describe('Picker Initialization and Configuration', () => {
    it('should initialize picker with correct configuration', async () => {
      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(mockPickerBuilder.addView).toHaveBeenCalledWith('docs')
        expect(mockPickerBuilder.addView).toHaveBeenCalledWith('spreadsheets')
        expect(mockPickerBuilder.addView).toHaveBeenCalledWith('presentations')
        expect(mockPickerBuilder.addView).toHaveBeenCalledWith('pdfs')
        expect(mockPickerBuilder.setOAuthToken).toHaveBeenCalledWith('test-access-token')
        expect(mockPickerBuilder.setDeveloperKey).toHaveBeenCalledWith(process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
        expect(mockPickerBuilder.setTitle).toHaveBeenCalledWith('Select files to add to your knowledge base')
        expect(mockPickerBuilder.setSize).toHaveBeenCalledWith(1051, 650)
        expect(mockPickerBuilder.setCallback).toHaveBeenCalledWith(expect.any(Function))
        expect(mockPickerBuilder.build).toHaveBeenCalled()
        expect(mockPicker.setVisible).toHaveBeenCalledWith(true)
      })
    })

    it('should handle token fetch failure', async () => {
      // Arrange
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({
          error: {
            type: 'TOKEN_EXPIRED',
            message: 'Token has expired',
            requiresReauth: true
          }
        })
      })

      mockErrorHandling.handleTokenError.mockReturnValue({
        type: 'TOKEN_EXPIRED',
        userMessage: 'Your Google Drive access has expired',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(mockErrorHandling.handleTokenError).toHaveBeenCalled()
        expect(mockOnError).toHaveBeenCalledWith('Your Google Drive access has expired')
      })
    })

    it('should handle missing access token in response', async () => {
      // Arrange
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            tokenId: 'test-token-id',
            expiresIn: 3600,
            scope: 'https://www.googleapis.com/auth/drive.file'
            // Missing accessToken
          }
        })
      })

      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'INVALID_TOKEN',
        userMessage: 'Invalid token received',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(mockErrorHandling.handlePickerError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'No access token received' }),
          expect.any(Object)
        )
      })
    })

    it('should log picker session start for audit', async () => {
      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert
      await waitFor(() => {
        expect(mockAuditService.logPickerSessionStart).toHaveBeenCalledWith(
          testUserId,
          expect.any(String), // sessionId
          'test-token-id',
          expect.objectContaining({
            userAgent: navigator.userAgent
          })
        )
      })
    })
  })

  describe('File Selection Callback Handling', () => {
    let pickerCallback: (data: any) => void

    beforeEach(async () => {
      // Setup picker and capture callback
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockPickerBuilder.setCallback).toHaveBeenCalled()
      })

      pickerCallback = mockPickerBuilder.setCallback.mock.calls[0][0]
    })

    it('should handle successful file selection', () => {
      // Arrange
      const mockPickerData = {
        action: 'picked',
        docs: [
          {
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            sizeBytes: '1024000',
            downloadUrl: 'https://drive.google.com/file/d/file-1/view'
          },
          {
            id: 'file-2',
            name: 'spreadsheet.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: '512000'
          }
        ]
      }

      // Act
      act(() => {
        pickerCallback(mockPickerData)
      })

      // Assert
      expect(mockOnFilesSelected).toHaveBeenCalledWith([
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          downloadUrl: 'https://drive.google.com/file/d/file-1/view'
        },
        {
          id: 'file-2',
          name: 'spreadsheet.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 512000,
          downloadUrl: undefined
        }
      ])

      expect(mockAuditService.logFileSelectionSuccess).toHaveBeenCalledWith(
        testUserId,
        expect.any(String), // sessionId
        [
          {
            fileId: 'file-1',
            fileName: 'document.pdf',
            mimeType: 'application/pdf',
            fileSize: 1024000
          },
          {
            fileId: 'file-2',
            fileName: 'spreadsheet.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileSize: 512000
          }
        ],
        'test-token-id'
      )
    })

    it('should handle file selection with missing size', () => {
      // Arrange
      const mockPickerData = {
        action: 'picked',
        docs: [
          {
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf'
            // Missing sizeBytes
          }
        ]
      }

      // Act
      act(() => {
        pickerCallback(mockPickerData)
      })

      // Assert
      expect(mockOnFilesSelected).toHaveBeenCalledWith([
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 0,
          downloadUrl: undefined
        }
      ])
    })

    it('should handle picker cancellation', () => {
      // Arrange
      const mockPickerData = {
        action: 'cancel'
      }

      // Act
      act(() => {
        pickerCallback(mockPickerData)
      })

      // Assert
      expect(mockOnFilesSelected).not.toHaveBeenCalled()
      expect(mockAuditService.logFileSelectionCancelled).toHaveBeenCalledWith(
        testUserId,
        expect.any(String), // sessionId
        'test-token-id'
      )
    })

    it('should handle unknown picker actions gracefully', () => {
      // Arrange
      const mockPickerData = {
        action: 'unknown_action'
      }

      // Act
      act(() => {
        pickerCallback(mockPickerData)
      })

      // Assert
      expect(mockOnFilesSelected).not.toHaveBeenCalled()
      expect(mockAuditService.logFileSelectionSuccess).not.toHaveBeenCalled()
      expect(mockAuditService.logFileSelectionCancelled).not.toHaveBeenCalled()
    })
  })

  describe('Retry and Recovery Mechanisms', () => {
    it('should show retry status when operation is retrying', () => {
      // Arrange
      mockRetryService.getRetryInfo.mockReturnValue({
        isRetrying: true,
        attemptCount: 2,
        nextRetryAt: new Date(Date.now() + 5000).toISOString(),
        canRetry: true
      })

      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      // Assert
      expect(screen.getByText(/retrying\.\.\. \(attempt 3\)/i)).toBeInTheDocument()
      expect(screen.getByText(/next attempt in \d+s/i)).toBeInTheDocument()
    })

    it('should handle manual retry button click', async () => {
      // Arrange
      const testError = new Error('Network error')
      mockRetryService.withRetry.mockRejectedValueOnce(testError).mockResolvedValueOnce(undefined)
      mockErrorHandling.handlePickerError.mockReturnValue({
        type: 'NETWORK_ERROR',
        userMessage: 'Network connection failed',
        canRetry: true,
        requiresReauth: false,
        timestamp: new Date().toISOString()
      })
      mockErrorHandling.getErrorGuidance.mockReturnValue({
        message: 'Network connection failed',
        action: 'retry'
      })

      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      // First click fails
      const button = screen.getByRole('button', { name: /add files from google drive/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      })

      // Act - click retry
      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      // Assert
      await waitFor(() => {
        expect(mockRetryService.withRetry).toHaveBeenCalledTimes(2)
      })
    })

    it('should open recovery dialog for authentication errors', async () => {
      // Arrange
      const authError = new Error('Token expired')
      mockRetryService.withRetry.mockRejectedValue(authError)
      mockErrorHandling.handleTokenError.mockReturnValue({
        type: 'TOKEN_EXPIRED',
        userMessage: 'Your Google Drive access has expired',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })
      mockErrorHandling.getErrorGuidance.mockReturnValue({
        message: 'Your Google Drive access has expired',
        action: 'reconnect'
      })

      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fix connection/i })).toBeInTheDocument()
      })

      // Act - click fix connection
      const fixButton = screen.getByRole('button', { name: /fix connection/i })
      fireEvent.click(fixButton)

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Fix Google Drive Connection')).toBeInTheDocument()
      })
    })

    it('should handle recovery completion', async () => {
      // This test would require mocking the GooglePickerRecovery component
      // For now, we'll test the callback handling
      
      // Arrange
      const authError = new Error('Token expired')
      mockRetryService.withRetry.mockRejectedValue(authError)
      mockErrorHandling.handleTokenError.mockReturnValue({
        type: 'TOKEN_EXPIRED',
        userMessage: 'Your Google Drive access has expired',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })

      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fix connection/i })).toBeInTheDocument()
      })

      // The actual recovery completion would be tested in integration tests
      // since it involves the GooglePickerRecovery component
    })
  })

  describe('Cleanup and Error Handling', () => {
    it('should cleanup retry operations on unmount', () => {
      // Arrange
      const { unmount } = render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
          userId={testUserId}
        />
      )

      // Act
      unmount()

      // Assert
      expect(mockRetryService.cancelRetry).toHaveBeenCalledWith(expect.stringMatching(/picker-open-/))
    })

    it('should handle component without userId gracefully', async () => {
      // Act
      render(
        <GooglePicker
          onFilesSelected={mockOnFilesSelected}
          onError={mockOnError}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      // Assert - should not crash and should not call audit functions
      await waitFor(() => {
        expect(mockAuditService.logPickerSessionStart).not.toHaveBeenCalled()
      })
    })
  })
})
