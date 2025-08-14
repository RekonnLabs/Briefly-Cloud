/**
 * Security Monitoring Service
 * 
 * This service provides real-time security monitoring, threat detection,
 * and automated response capabilities for the multi-tenant architecture.
 */

import { supabaseAdmin } from '@/app/lib/supabase'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getAuditLogger, type AuditAction, type AuditSeverity } from '@/app/lib/audit/audit-logger'

export interface SecurityThreat {
  id: string
  type: 'BRUTE_FORCE' | 'SUSPICIOUS_IP' | 'ANOMALOUS_BEHAVIOR' | 'DATA_EXFILTRATION' | 'PRIVILEGE_ESCALATION'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  userId?: string
  ipAddress?: string
  indicators: string[]
  confidence: number // 0-100
  firstSeen: string
  lastSeen: string
  eventCount: number
  status: 'active' | 'investigating' | 'resolved' | 'false_positive'
  metadata: Record<string, any>
}

export interface SecurityMetrics {
  totalThreats: number
  activeThreats: number
  criticalThreats: number
  threatsByType: Record<string, number>
  threatsBySeverity: Record<string, number>
  topTargetedUsers: Array<{ userId: string; threatCount: number }>
  topMaliciousIPs: Array<{ ipAddress: string; threatCount: number }>
  recentActivity: Array<{
    timestamp: string
    type: string
    severity: string
    description: string
  }>
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean
  confidence: number
  reasons: string[]
  riskScore: number
  recommendedAction: 'monitor' | 'alert' | 'block' | 'investigate'
}

/**
 * Security Monitor Service
 */
export class SecurityMonitor {
  private readonly auditLogger = getAuditLogger()

  /**
   * Analyze user behavior for anomalies
   */
  async analyzeUserBehavior(
    userId: string,
    currentAction: string,
    metadata: Record<string, any> = {}
  ): Promise<AnomalyDetectionResult> {
    try {
      const reasons: string[] = []
      let riskScore = 0
      let confidence = 0

      // Get user's historical behavior
      const { data: recentActivity } = await supabaseAdmin
        .from('private.audit_logs')
        .select('action, created_at, ip_address, user_agent, metadata')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('created_at', { ascending: false })
        .limit(100)

      if (!recentActivity || recentActivity.length === 0) {
        // New user - moderate risk
        return {
          isAnomalous: false,
          confidence: 30,
          reasons: ['New user with limited history'],
          riskScore: 30,
          recommendedAction: 'monitor'
        }
      }

      // Analyze patterns
      const patterns = this.analyzeActivityPatterns(recentActivity, currentAction, metadata)
      
      // Check for time-based anomalies
      const timeAnomaly = this.checkTimeBasedAnomalies(recentActivity, new Date())
      if (timeAnomaly.isAnomalous) {
        reasons.push(...timeAnomaly.reasons)
        riskScore += timeAnomaly.riskScore
        confidence += 20
      }

      // Check for location-based anomalies
      const locationAnomaly = this.checkLocationAnomalies(recentActivity, metadata.ipAddress)
      if (locationAnomaly.isAnomalous) {
        reasons.push(...locationAnomaly.reasons)
        riskScore += locationAnomaly.riskScore
        confidence += 25
      }

      // Check for behavioral anomalies
      const behaviorAnomaly = this.checkBehavioralAnomalies(recentActivity, currentAction)
      if (behaviorAnomaly.isAnomalous) {
        reasons.push(...behaviorAnomaly.reasons)
        riskScore += behaviorAnomaly.riskScore
        confidence += 30
      }

      // Check for volume anomalies
      const volumeAnomaly = this.checkVolumeAnomalies(recentActivity)
      if (volumeAnomaly.isAnomalous) {
        reasons.push(...volumeAnomaly.reasons)
        riskScore += volumeAnomaly.riskScore
        confidence += 25
      }

      // Determine if anomalous
      const isAnomalous = riskScore > 60 && confidence > 50
      
      // Recommend action based on risk score
      let recommendedAction: AnomalyDetectionResult['recommendedAction'] = 'monitor'
      if (riskScore > 90) recommendedAction = 'block'
      else if (riskScore > 70) recommendedAction = 'investigate'
      else if (riskScore > 50) recommendedAction = 'alert'

      return {
        isAnomalous,
        confidence: Math.min(confidence, 100),
        reasons,
        riskScore: Math.min(riskScore, 100),
        recommendedAction
      }

    } catch (error) {
      logger.error('Failed to analyze user behavior', { userId, currentAction }, error as Error)
      
      // Return safe default
      return {
        isAnomalous: false,
        confidence: 0,
        reasons: ['Analysis failed'],
        riskScore: 0,
        recommendedAction: 'monitor'
      }
    }
  }

  /**
   * Monitor for suspicious IP addresses
   */
  async monitorSuspiciousIPs(): Promise<string[]> {
    try {
      const suspiciousIPs: string[] = []
      
      // Get IPs with high failure rates
      const { data: failedLogins } = await supabaseAdmin
        .from('private.audit_logs')
        .select('ip_address')
        .eq('action', 'LOGIN_FAILED')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      
      if (failedLogins) {
        const ipCounts = failedLogins.reduce((acc, log) => {
          if (log.ip_address) {
            acc[log.ip_address] = (acc[log.ip_address] || 0) + 1
          }
          return acc
        }, {} as Record<string, number>)

        // Flag IPs with more than 10 failed attempts
        Object.entries(ipCounts).forEach(([ip, count]) => {
          if (count > 10) {
            suspiciousIPs.push(ip)
          }
        })
      }

      // Get IPs with unusual activity patterns
      const { data: unusualActivity } = await supabaseAdmin
        .from('private.audit_logs')
        .select('ip_address, action')
        .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()) // Last 6 hours
        .in('severity', ['warning', 'error', 'critical'])

      if (unusualActivity) {
        const ipActivityCounts = unusualActivity.reduce((acc, log) => {
          if (log.ip_address) {
            acc[log.ip_address] = (acc[log.ip_address] || 0) + 1
          }
          return acc
        }, {} as Record<string, number>)

        // Flag IPs with more than 5 suspicious activities
        Object.entries(ipActivityCounts).forEach(([ip, count]) => {
          if (count > 5 && !suspiciousIPs.includes(ip)) {
            suspiciousIPs.push(ip)
          }
        })
      }

      // Log suspicious IPs
      if (suspiciousIPs.length > 0) {
        await this.auditLogger.logSecurityEvent(
          'SUSPICIOUS_ACTIVITY',
          'warning',
          `Detected ${suspiciousIPs.length} suspicious IP addresses`,
          undefined,
          { suspiciousIPs },
          undefined,
          undefined
        )
      }

      return suspiciousIPs

    } catch (error) {
      logger.error('Failed to monitor suspicious IPs', error as Error)
      return []
    }
  }

  /**
   * Detect data exfiltration attempts
   */
  async detectDataExfiltration(userId: string): Promise<boolean> {
    try {
      // Check for unusual download patterns
      const { data: downloads } = await supabaseAdmin
        .from('private.audit_logs')
        .select('created_at, metadata')
        .eq('user_id', userId)
        .eq('action', 'DATA_EXPORT')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

      if (!downloads || downloads.length === 0) {
        return false
      }

      // Check for rapid successive downloads
      const downloadTimes = downloads.map(d => new Date(d.created_at).getTime()).sort()
      let rapidDownloads = 0

      for (let i = 1; i < downloadTimes.length; i++) {
        if (downloadTimes[i] - downloadTimes[i - 1] < 60000) { // Less than 1 minute apart
          rapidDownloads++
        }
      }

      // Check for large volume downloads
      const totalSize = downloads.reduce((sum, d) => {
        return sum + (d.metadata?.fileSize || 0)
      }, 0)

      const isExfiltration = rapidDownloads > 5 || totalSize > 100 * 1024 * 1024 // 100MB

      if (isExfiltration) {
        await this.auditLogger.logSecurityEvent(
          'SUSPICIOUS_ACTIVITY',
          'error',
          'Potential data exfiltration detected',
          userId,
          {
            rapidDownloads,
            totalSize,
            downloadCount: downloads.length
          }
        )
      }

      return isExfiltration

    } catch (error) {
      logger.error('Failed to detect data exfiltration', { userId }, error as Error)
      return false
    }
  }

  /**
   * Get security metrics and dashboard data
   */
  async getSecurityMetrics(
    startDate?: string,
    endDate?: string
  ): Promise<SecurityMetrics> {
    try {
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const end = endDate || new Date().toISOString()

      // Get security alerts
      const { data: alerts } = await supabaseAdmin
        .from('private.security_alerts')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)

      // Get audit logs for analysis
      const { data: auditLogs } = await supabaseAdmin
        .from('private.audit_logs')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .in('severity', ['warning', 'error', 'critical'])

      const totalThreats = alerts?.length || 0
      const activeThreats = alerts?.filter(a => !a.resolved).length || 0
      const criticalThreats = alerts?.filter(a => a.severity === 'critical').length || 0

      // Aggregate threat data
      const threatsByType = alerts?.reduce((acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      const threatsBySeverity = alerts?.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      // Get top targeted users
      const userThreatCounts = alerts?.reduce((acc, alert) => {
        if (alert.user_id) {
          acc[alert.user_id] = (acc[alert.user_id] || 0) + 1
        }
        return acc
      }, {} as Record<string, number>) || {}

      const topTargetedUsers = Object.entries(userThreatCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, threatCount]) => ({ userId, threatCount }))

      // Get top malicious IPs
      const ipThreatCounts = alerts?.reduce((acc, alert) => {
        if (alert.ip_address) {
          acc[alert.ip_address] = (acc[alert.ip_address] || 0) + 1
        }
        return acc
      }, {} as Record<string, number>) || {}

      const topMaliciousIPs = Object.entries(ipThreatCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ipAddress, threatCount]) => ({ ipAddress, threatCount }))

      // Get recent activity
      const recentActivity = (auditLogs || [])
        .slice(0, 20)
        .map(log => ({
          timestamp: log.created_at,
          type: log.action,
          severity: log.severity,
          description: `${log.action} - ${log.resource_type}`
        }))

      return {
        totalThreats,
        activeThreats,
        criticalThreats,
        threatsByType,
        threatsBySeverity,
        topTargetedUsers,
        topMaliciousIPs,
        recentActivity
      }

    } catch (error) {
      logger.error('Failed to get security metrics', { startDate, endDate }, error as Error)
      
      // Return empty metrics
      return {
        totalThreats: 0,
        activeThreats: 0,
        criticalThreats: 0,
        threatsByType: {},
        threatsBySeverity: {},
        topTargetedUsers: [],
        topMaliciousIPs: [],
        recentActivity: []
      }
    }
  }

  /**
   * Analyze activity patterns
   */
  private analyzeActivityPatterns(
    recentActivity: any[],
    currentAction: string,
    metadata: Record<string, any>
  ): any {
    // Implementation would analyze patterns like:
    // - Frequency of actions
    // - Time patterns
    // - Sequence patterns
    // - Device/browser patterns
    return { patterns: [] }
  }

  /**
   * Check for time-based anomalies
   */
  private checkTimeBasedAnomalies(
    recentActivity: any[],
    currentTime: Date
  ): { isAnomalous: boolean; reasons: string[]; riskScore: number } {
    const reasons: string[] = []
    let riskScore = 0

    // Check if activity is outside normal hours
    const hour = currentTime.getHours()
    const isOffHours = hour < 6 || hour > 22

    if (isOffHours) {
      // Check if user normally works these hours
      const offHoursActivity = recentActivity.filter(activity => {
        const activityHour = new Date(activity.created_at).getHours()
        return activityHour < 6 || activityHour > 22
      })

      if (offHoursActivity.length < recentActivity.length * 0.1) {
        reasons.push('Activity outside normal hours')
        riskScore += 20
      }
    }

    return {
      isAnomalous: riskScore > 0,
      reasons,
      riskScore
    }
  }

  /**
   * Check for location-based anomalies
   */
  private checkLocationAnomalies(
    recentActivity: any[],
    currentIP?: string
  ): { isAnomalous: boolean; reasons: string[]; riskScore: number } {
    const reasons: string[] = []
    let riskScore = 0

    if (!currentIP) {
      return { isAnomalous: false, reasons, riskScore }
    }

    // Get unique IPs from recent activity
    const recentIPs = [...new Set(recentActivity
      .map(activity => activity.ip_address)
      .filter(ip => ip))]

    // Check if this is a new IP
    if (!recentIPs.includes(currentIP)) {
      reasons.push('New IP address')
      riskScore += 30

      // Check if multiple new IPs recently
      const newIPsCount = recentIPs.length
      if (newIPsCount > 3) {
        reasons.push('Multiple new IP addresses')
        riskScore += 20
      }
    }

    return {
      isAnomalous: riskScore > 0,
      reasons,
      riskScore
    }
  }

  /**
   * Check for behavioral anomalies
   */
  private checkBehavioralAnomalies(
    recentActivity: any[],
    currentAction: string
  ): { isAnomalous: boolean; reasons: string[]; riskScore: number } {
    const reasons: string[] = []
    let riskScore = 0

    // Analyze action frequency
    const actionCounts = recentActivity.reduce((acc, activity) => {
      acc[activity.action] = (acc[activity.action] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const totalActions = recentActivity.length
    const currentActionFreq = (actionCounts[currentAction] || 0) / totalActions

    // Check if this action is unusual for this user
    if (currentActionFreq < 0.05 && totalActions > 20) {
      reasons.push('Unusual action for this user')
      riskScore += 15
    }

    return {
      isAnomalous: riskScore > 0,
      reasons,
      riskScore
    }
  }

  /**
   * Check for volume anomalies
   */
  private checkVolumeAnomalies(
    recentActivity: any[]
  ): { isAnomalous: boolean; reasons: string[]; riskScore: number } {
    const reasons: string[] = []
    let riskScore = 0

    // Check activity volume in last hour
    const lastHour = new Date(Date.now() - 60 * 60 * 1000)
    const recentHourActivity = recentActivity.filter(activity => 
      new Date(activity.created_at) > lastHour
    )

    // Check for activity spikes
    if (recentHourActivity.length > 50) {
      reasons.push('High activity volume')
      riskScore += 25
    }

    // Check for rapid succession
    const timestamps = recentHourActivity
      .map(activity => new Date(activity.created_at).getTime())
      .sort()

    let rapidActions = 0
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - timestamps[i - 1] < 1000) { // Less than 1 second apart
        rapidActions++
      }
    }

    if (rapidActions > 10) {
      reasons.push('Rapid successive actions')
      riskScore += 30
    }

    return {
      isAnomalous: riskScore > 0,
      reasons,
      riskScore
    }
  }
}

// Singleton instance
let securityMonitor: SecurityMonitor | null = null

/**
 * Get the security monitor instance
 */
export function getSecurityMonitor(): SecurityMonitor {
  if (!securityMonitor) {
    securityMonitor = new SecurityMonitor()
  }
  return securityMonitor
}

/**
 * Convenience functions
 */

export async function analyzeUserBehavior(
  userId: string,
  currentAction: string,
  metadata?: Record<string, any>
): Promise<AnomalyDetectionResult> {
  const monitor = getSecurityMonitor()
  return monitor.analyzeUserBehavior(userId, currentAction, metadata)
}

export async function monitorSuspiciousIPs(): Promise<string[]> {
  const monitor = getSecurityMonitor()
  return monitor.monitorSuspiciousIPs()
}

export async function detectDataExfiltration(userId: string): Promise<boolean> {
  const monitor = getSecurityMonitor()
  return monitor.detectDataExfiltration(userId)
}

export async function getSecurityMetrics(
  startDate?: string,
  endDate?: string
): Promise<SecurityMetrics> {
  const monitor = getSecurityMonitor()
  return monitor.getSecurityMetrics(startDate, endDate)
}