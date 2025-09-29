/**
 * OAuth Flow Monitoring Tests
 * 
 * Tests for OAuth flow separation monitoring and alerting system.
 */

import { 
  getOAuthMonitoring, 
  logMainAuthRoute, 
  logStorageOAuthRoute,
  logAuthenticationViolation 
} from '../oauth-flow-monitoring'
import { getOAuthAlertSystem } from '../oauth-flow-alerts'

// Mock the error monitoring system
jest.mock('../error-monitoring', () => ({
  getErrorMonitoring: () => ({
    setTag: jest.fn(),
    setExtra: jest.fn(),
    setUser: jest.fn(),
    captureMessage: jest.fn(),
    captureError: jest.fn()
  })
}))

describe('OAuth Flow Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Route Usage Validation', () => {
    it('should correctly identify main auth route usage', () => {
      const monitoring = getOAuthMonitoring()
      const mockCaptureMessage = jest.fn()
      
      // Mock the monitoring system
      monitoring['monitoring'].captureMessage = mockCaptureMessage
      
      // Test correct main auth route usage
      logMainAuthRoute('google', 'SupabaseAuthProvider', 'user123')
      
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('OAuth route used correctly'),
        'info',
        expect.any(Object)
      )
    })

    it('should detect route violations', () => {
      const monitoring = getOAuthMonitoring()
      const mockCaptureMessage = jest.fn()
      const mockCaptureError = jest.fn()
      
      monitoring['monitoring'].captureMessage = mockCaptureMessage
      monitoring['monitoring'].captureError = mockCaptureError
      
      // Test incorrect route usage - using storage route for main auth
      monitoring.logOAuthRouteUsage(
        '/api/storage/google/start',
        'main_auth', // Wrong flow type
        'SupabaseAuthProvider',
        'user123'
      )
      
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('OAuth route used incorrectly'),
        'warning',
        expect.any(Object)
      )
      
      expect(mockCaptureError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('OAuth route violation')
        }),
        expect.any(Object)
      )
    })

    it('should correctly identify storage OAuth route usage', () => {
      const monitoring = getOAuthMonitoring()
      const mockCaptureMessage = jest.fn()
      
      monitoring['monitoring'].captureMessage = mockCaptureMessage
      
      // Test correct storage OAuth route usage
      logStorageOAuthRoute('google', 'CloudStorage', 'user123')
      
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('OAuth route used correctly'),
        'info',
        expect.any(Object)
      )
    })
  })

  describe('Authentication Enforcement', () => {
    it('should log authentication violations', () => {
      const mockCaptureError = jest.fn()
      const monitoring = getOAuthMonitoring()
      monitoring['monitoring'].captureError = mockCaptureError
      
      logAuthenticationViolation(
        '/api/storage/google/start',
        'CloudStorage'
      )
      
      expect(mockCaptureError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Unauthenticated access attempt')
        }),
        expect.any(Object)
      )
    })
  })

  describe('Flow Type Detection', () => {
    it('should correctly detect main auth routes', () => {
      const monitoring = getOAuthMonitoring()
      
      const mainAuthRoutes = [
        '/auth/start?provider=google',
        '/auth/start?provider=azure',
        '/auth/start?provider=microsoft'
      ]
      
      mainAuthRoutes.forEach(route => {
        const expectedFlowType = monitoring['getExpectedFlowType'](route)
        expect(expectedFlowType).toBe('main_auth')
      })
    })

    it('should correctly detect storage OAuth routes', () => {
      const monitoring = getOAuthMonitoring()
      
      const storageRoutes = [
        '/api/storage/google/start',
        '/api/storage/microsoft/start',
        '/api/storage/google/callback',
        '/api/storage/microsoft/callback'
      ]
      
      storageRoutes.forEach(route => {
        const expectedFlowType = monitoring['getExpectedFlowType'](route)
        expect(expectedFlowType).toBe('storage_oauth')
      })
    })

    it('should extract provider from routes correctly', () => {
      const monitoring = getOAuthMonitoring()
      
      const testCases = [
        { route: '/auth/start?provider=google', expected: 'google' },
        { route: '/auth/start?provider=azure', expected: 'microsoft' },
        { route: '/api/storage/google/start', expected: 'google' },
        { route: '/api/storage/microsoft/start', expected: 'microsoft' }
      ]
      
      testCases.forEach(({ route, expected }) => {
        const provider = monitoring['extractProvider'](route)
        expect(provider).toBe(expected)
      })
    })
  })

  describe('Alert System Integration', () => {
    it('should trigger alerts for route violations', () => {
      const alertSystem = getOAuthAlertSystem()
      const mockTriggerAlert = jest.fn()
      alertSystem['triggerAlert'] = mockTriggerAlert
      
      // Test route violation alert
      alertSystem.checkRouteViolation(
        '/api/storage/google/start',
        'storage_oauth',
        'main_auth', // Wrong flow type
        'SupabaseAuthProvider',
        'user123'
      )
      
      expect(mockTriggerAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'route_violation',
          severity: 'critical',
          title: 'OAuth Route Violation Detected'
        })
      )
    })

    it('should trigger alerts for authentication violations', () => {
      const alertSystem = getOAuthAlertSystem()
      const mockTriggerAlert = jest.fn()
      alertSystem['triggerAlert'] = mockTriggerAlert
      
      // Test authentication violation alert
      alertSystem.checkAuthenticationEnforcement(
        '/api/storage/google/start',
        'CloudStorage'
      )
      
      expect(mockTriggerAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_enforcement_failure',
          severity: 'high',
          title: 'Authentication Enforcement Failure'
        })
      )
    })

    it('should trigger alerts for compliance rate drops', () => {
      const alertSystem = getOAuthAlertSystem()
      const mockTriggerAlert = jest.fn()
      alertSystem['triggerAlert'] = mockTriggerAlert
      
      // Test compliance rate alert (below critical threshold)
      alertSystem.checkComplianceRate(85, 100, 15, '1h')
      
      expect(mockTriggerAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'compliance_drop',
          severity: 'critical',
          title: 'OAuth Compliance Rate Drop'
        })
      )
    })

    it('should trigger alerts for high error rates', () => {
      const alertSystem = getOAuthAlertSystem()
      const mockTriggerAlert = jest.fn()
      alertSystem['triggerAlert'] = mockTriggerAlert
      
      // Test high error rate alert
      alertSystem.checkErrorRate(15, 100, 15, 'main_auth', '1h')
      
      expect(mockTriggerAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'high_error_rate',
          severity: 'critical',
          title: 'High main_auth OAuth Error Rate'
        })
      )
    })
  })

  describe('Performance Monitoring', () => {
    it('should measure OAuth flow performance', async () => {
      const monitoring = getOAuthMonitoring()
      const mockCaptureMessage = jest.fn()
      monitoring['monitoring'].captureMessage = mockCaptureMessage
      
      // Import the performance monitoring function
      const { measureOAuthFlowPerformance } = await import('../oauth-flow-monitoring')
      
      const mockOperation = jest.fn().mockResolvedValue('success')
      
      const result = await measureOAuthFlowPerformance(
        'connect_storage',
        'storage_oauth',
        'google',
        mockOperation,
        'user123'
      )
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalled()
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('OAuth operation completed'),
        'info',
        expect.any(Object)
      )
    })

    it('should handle OAuth flow performance errors', async () => {
      const monitoring = getOAuthMonitoring()
      const mockCaptureError = jest.fn()
      monitoring['monitoring'].captureError = mockCaptureError
      
      const { measureOAuthFlowPerformance } = await import('../oauth-flow-monitoring')
      
      const mockError = new Error('Operation failed')
      const mockOperation = jest.fn().mockRejectedValue(mockError)
      
      await expect(
        measureOAuthFlowPerformance(
          'connect_storage',
          'storage_oauth',
          'google',
          mockOperation,
          'user123'
        )
      ).rejects.toThrow('Operation failed')
      
      expect(mockCaptureError).toHaveBeenCalledWith(
        mockError,
        expect.any(Object)
      )
    })
  })

  describe('Logging Middleware', () => {
    it('should create OAuth logging middleware', () => {
      const { createOAuthLoggingMiddleware } = require('../oauth-flow-monitoring')
      
      const middleware = createOAuthLoggingMiddleware('TestComponent')
      
      expect(middleware).toHaveProperty('logMainAuth')
      expect(middleware).toHaveProperty('logStorageOAuth')
      expect(middleware).toHaveProperty('logCompletion')
      
      expect(typeof middleware.logMainAuth).toBe('function')
      expect(typeof middleware.logStorageOAuth).toBe('function')
      expect(typeof middleware.logCompletion).toBe('function')
    })
  })
})

describe('OAuth Alert System', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Alert Management', () => {
    it('should store and retrieve active alerts', () => {
      const alertSystem = getOAuthAlertSystem()
      
      // Trigger an alert
      alertSystem.checkRouteViolation(
        '/api/storage/google/start',
        'storage_oauth',
        'main_auth',
        'TestComponent',
        'user123'
      )
      
      const activeAlerts = alertSystem.getActiveAlerts()
      expect(activeAlerts).toHaveLength(1)
      expect(activeAlerts[0]).toMatchObject({
        type: 'route_violation',
        resolved: false
      })
    })

    it('should resolve alerts', () => {
      const alertSystem = getOAuthAlertSystem()
      
      // Trigger an alert
      alertSystem.checkRouteViolation(
        '/api/storage/google/start',
        'storage_oauth',
        'main_auth',
        'TestComponent',
        'user123'
      )
      
      const activeAlerts = alertSystem.getActiveAlerts()
      const alertId = activeAlerts[0].id
      
      const resolved = alertSystem.resolveAlert(alertId)
      expect(resolved).toBe(true)
      
      const remainingAlerts = alertSystem.getActiveAlerts()
      expect(remainingAlerts).toHaveLength(0)
    })

    it('should clear old resolved alerts', () => {
      const alertSystem = getOAuthAlertSystem()
      
      // Create a mock old alert
      const oldAlert = {
        id: 'old_alert',
        type: 'route_violation' as const,
        severity: 'medium' as const,
        title: 'Old Alert',
        message: 'This is an old alert',
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        metadata: {},
        resolved: true
      }
      
      alertSystem['alerts'].set(oldAlert.id, oldAlert)
      
      // Clear old alerts (default 24 hours)
      alertSystem.clearOldAlerts()
      
      expect(alertSystem['alerts'].has(oldAlert.id)).toBe(false)
    })
  })

  describe('Severity Assessment', () => {
    it('should assign correct severity for different violation types', () => {
      const alertSystem = getOAuthAlertSystem()
      
      // Storage route used for main auth (critical)
      const criticalSeverity = alertSystem['getViolationSeverity'](
        '/api/storage/google/start',
        'storage_oauth',
        'main_auth'
      )
      expect(criticalSeverity).toBe('critical')
      
      // Main auth route used for storage (high)
      const highSeverity = alertSystem['getViolationSeverity'](
        '/auth/start?provider=google',
        'main_auth',
        'storage_oauth'
      )
      expect(highSeverity).toBe('high')
    })
  })
})