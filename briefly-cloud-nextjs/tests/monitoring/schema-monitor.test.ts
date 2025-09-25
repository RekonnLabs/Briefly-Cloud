/**
 * Schema Monitoring System Tests
 * 
 * Comprehensive test suite for schema health monitoring,
 * performance tracking, and alerting functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { schemaMonitor } from '@/app/lib/monitoring/schema-monitor'
import { alertingService } from '@/app/lib/monitoring/alerting'

// Mock Supabase clients
jest.mock('@/app/lib/supabase-clients', () => ({
  supabaseApp: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({
          data: [{ id: 'test-user' }],
          error: null
        }))
      }))
    })),
    rpc: jest.fn(() => ({
      data: [],
      error: null
    }))
  },
  supabasePrivate: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({
          data: [{ id: 'test-user' }],
          error: null
        }))
      }))
    }))
  }
}))

// Mock alerting service
jest.mock('@/app/lib/monitoring/alerting', () => ({
  alertingService: {
    processAlert: jest.fn()
  }
}))

describe('Schema Monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    schemaMonitor.stopMonitoring()
  })

  afterEach(() => {
    schemaMonitor.stopMonitoring()
  })

  describe('Monitoring Control', () => {
    it('should start monitoring', () => {
      const status = schemaMonitor.getMonitoringStatus()
      expect(status.isMonitoring).toBe(false)

      schemaMonitor.startMonitoring(1000)
      
      const newStatus = schemaMonitor.getMonitoringStatus()
      expect(newStatus.isMonitoring).toBe(true)
    })

    it('should stop monitoring', () => {
      schemaMonitor.startMonitoring(1000)
      expect(schemaMonitor.getMonitoringStatus().isMonitoring).toBe(true)

      schemaMonitor.stopMonitoring()
      expect(schemaMonitor.getMonitoringStatus().isMonitoring).toBe(false)
    })

    it('should not start monitoring if already running', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      schemaMonitor.startMonitoring(1000)
      schemaMonitor.startMonitoring(1000)
      
      expect(consoleSpy).toHaveBeenCalledWith('Schema monitoring already running')
      consoleSpy.mockRestore()
    })
  })

  describe('Performance Metrics', () => {
    it('should return initial performance metrics', () => {
      const metrics = schemaMonitor.getPerformanceMetrics()
      
      expect(metrics).toHaveProperty('timestamp')
      expect(metrics).toHaveProperty('totalRequests')
      expect(metrics).toHaveProperty('averageResponseTime')
      expect(metrics).toHaveProperty('errorRate')
      expect(metrics).toHaveProperty('schemaMetrics')
      expect(metrics).toHaveProperty('alerts')
      
      expect(metrics.schemaMetrics).toHaveProperty('app')
      expect(metrics.schemaMetrics).toHaveProperty('private')
    })

    it('should track metrics over time', async () => {
      // Start monitoring with short interval for testing
      schemaMonitor.startMonitoring(100)
      
      // Wait for a few metrics collections
      await new Promise(resolve => setTimeout(resolve, 350))
      
      const status = schemaMonitor.getMonitoringStatus()
      expect(status.metricsCount).toBeGreaterThan(0)
      
      schemaMonitor.stopMonitoring()
    })
  })

  describe('Alert Management', () => {
    it('should create alerts for unhealthy schemas', async () => {
      // Mock error response
      const mockError = new Error('Connection failed')
      const { supabaseApp } = await import('@/app/lib/supabase-clients')
      ;(supabaseApp.from as jest.MockedFunction<any>).mockReturnValue({
        select: jest.fn(() => ({
          limit: jest.fn(() => ({
            data: null,
            error: mockError
          }))
        }))
      })

      schemaMonitor.startMonitoring(100)
      
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const alerts = schemaMonitor.getAlerts()
      expect(alerts.length).toBeGreaterThan(0)
      
      const criticalAlert = alerts.find(alert => alert.severity === 'critical')
      expect(criticalAlert).toBeDefined()
      expect(criticalAlert?.type).toBe('schema_unavailable')
      
      schemaMonitor.stopMonitoring()
    })

    it('should resolve alerts', () => {
      // Create a test alert by simulating an error condition
      const testAlert = {
        id: 'test-alert-123',
        type: 'connectivity' as const,
        severity: 'high' as const,
        schema: 'app' as const,
        message: 'Test alert',
        timestamp: new Date().toISOString(),
        resolved: false
      }

      // Manually add alert for testing
      schemaMonitor['alerts'].push(testAlert)
      
      const unresolvedAlerts = schemaMonitor.getAlerts(false)
      expect(unresolvedAlerts.length).toBe(1)
      
      const resolved = schemaMonitor.resolveAlert('test-alert-123')
      expect(resolved).toBe(true)
      
      const resolvedAlerts = schemaMonitor.getAlerts(false)
      expect(resolvedAlerts.length).toBe(0)
    })

    it('should not resolve non-existent alerts', () => {
      const resolved = schemaMonitor.resolveAlert('non-existent-alert')
      expect(resolved).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle schema connection errors gracefully', async () => {
      const mockError = new Error('Database connection failed')
      const { supabaseApp } = await import('@/app/lib/supabase-clients')
      ;(supabaseApp.from as jest.MockedFunction<any>).mockImplementation(() => {
        throw mockError
      })

      schemaMonitor.startMonitoring(100)
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const metrics = schemaMonitor.getPerformanceMetrics()
      const appMetrics = metrics.schemaMetrics.app
      
      expect(appMetrics.status).toBe('unhealthy')
      expect(appMetrics.errorCount).toBeGreaterThan(0)
      expect(appMetrics.lastError).toContain('Database connection failed')
      
      schemaMonitor.stopMonitoring()
    })

    it('should handle RPC function errors for private schema', async () => {
      const mockError = new Error('RPC function not found')
      const { supabaseApp } = await import('@/app/lib/supabase-clients')
      ;(supabaseApp.rpc as jest.MockedFunction<any>).mockReturnValue({
        data: null,
        error: mockError
      })

      schemaMonitor.startMonitoring(100)
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const metrics = schemaMonitor.getPerformanceMetrics()
      const privateMetrics = metrics.schemaMetrics.private
      
      expect(privateMetrics.status).toBe('unhealthy')
      expect(privateMetrics.errorCount).toBeGreaterThan(0)
      
      schemaMonitor.stopMonitoring()
    })
  })

  describe('Performance Thresholds', () => {
    it('should mark schemas as degraded for slow responses', async () => {
      // Mock slow response
      const { supabaseApp } = await import('@/app/lib/supabase-clients')
      ;(supabaseApp.from as jest.MockedFunction<any>).mockReturnValue({
        select: jest.fn(() => ({
          limit: jest.fn(() => new Promise(resolve => {
            setTimeout(() => resolve({
              data: [{ id: 'test-user' }],
              error: null
            }), 1500) // 1.5 second delay
          }))
        }))
      })

      schemaMonitor.startMonitoring(100)
      
      // Wait for slow response
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const metrics = schemaMonitor.getPerformanceMetrics()
      const appMetrics = metrics.schemaMetrics.app
      
      expect(appMetrics.responseTime).toBeGreaterThan(1000)
      expect(appMetrics.status).toBe('degraded')
      
      schemaMonitor.stopMonitoring()
    })
  })

  describe('Alert Integration', () => {
    it('should send alerts through alerting service', async () => {
      const mockError = new Error('Critical failure')
      const { supabaseApp } = await import('@/app/lib/supabase-clients')
      ;(supabaseApp.from as jest.MockedFunction<any>).mockReturnValue({
        select: jest.fn(() => ({
          limit: jest.fn(() => ({
            data: null,
            error: mockError
          }))
        }))
      })

      schemaMonitor.startMonitoring(100)
      
      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 300))
      
      expect(alertingService.processAlert).toHaveBeenCalled()
      
      const alertCall = (alertingService.processAlert as jest.MockedFunction<any>).mock.calls[0]
      const alert = alertCall[0]
      
      expect(alert).toHaveProperty('type')
      expect(alert).toHaveProperty('severity')
      expect(alert).toHaveProperty('schema')
      expect(alert).toHaveProperty('message')
      
      schemaMonitor.stopMonitoring()
    })
  })
})

describe('Alerting Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Configuration', () => {
    it('should load configuration from environment', () => {
      const config = alertingService.getConfig()
      
      expect(config).toHaveProperty('enabled')
      expect(config).toHaveProperty('channels')
      expect(config).toHaveProperty('thresholds')
      expect(config).toHaveProperty('escalation')
      
      expect(config.channels).toHaveProperty('email')
      expect(config.channels).toHaveProperty('webhook')
      expect(config.channels).toHaveProperty('slack')
    })

    it('should update configuration', () => {
      const newConfig = {
        enabled: true,
        channels: {
          email: {
            enabled: true,
            recipients: ['test@example.com']
          }
        }
      }
      
      alertingService.updateConfig(newConfig)
      const config = alertingService.getConfig()
      
      expect(config.enabled).toBe(true)
      expect(config.channels.email?.enabled).toBe(true)
      expect(config.channels.email?.recipients).toContain('test@example.com')
    })
  })

  describe('Alert Processing', () => {
    it('should process alerts when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      alertingService.updateConfig({ enabled: true })
      
      const testAlert = {
        id: 'test-alert',
        type: 'connectivity' as const,
        severity: 'high' as const,
        schema: 'app' as const,
        message: 'Test alert message',
        timestamp: new Date().toISOString(),
        resolved: false
      }
      
      await alertingService.processAlert(testAlert)
      
      // Should log that notifications would be sent
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert notifications sent for: Test alert message')
      )
      
      consoleSpy.mockRestore()
    })

    it('should skip processing when disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      alertingService.updateConfig({ enabled: false })
      
      const testAlert = {
        id: 'test-alert',
        type: 'connectivity' as const,
        severity: 'high' as const,
        schema: 'app' as const,
        message: 'Test alert message',
        timestamp: new Date().toISOString(),
        resolved: false
      }
      
      await alertingService.processAlert(testAlert)
      
      // Should not log any processing
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Alert notifications sent')
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('Test Alerts', () => {
    it('should send test alerts', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      alertingService.updateConfig({ enabled: true })
      
      await alertingService.testAlerts()
      
      expect(consoleSpy).toHaveBeenCalledWith('Test alert sent successfully')
      
      consoleSpy.mockRestore()
    })
  })
})