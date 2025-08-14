/**
 * Secrets Rotation API Route
 * 
 * This endpoint provides secure secrets rotation capabilities
 * for administrators with proper audit logging.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withHighSecurity } from '@/app/lib/security/security-middleware'
import { getSecretsManager, type SecretType } from '@/app/lib/security/secrets-manager'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { logger } from '@/app/lib/logger'

/**
 * POST /api/admin/secrets/rotate
 * 
 * Rotate secrets (admin only)
 */
export const POST = withAuth(
  withHighSecurity(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Strict admin check
      if (!user.email?.endsWith('@rekonnlabs.com')) {
        await getAuditLogger().logSecurityEvent(
          'ADMIN_ACCESS',
          'error',
          'Unauthorized secrets rotation attempt',
          user.id,
          { 
            endpoint: '/api/admin/secrets/rotate',
            userEmail: user.email 
          },
          context.ipAddress,
          context.userAgent
        )

        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 403 }
        )
      }

      const body = await request.json()
      const { 
        secretName, 
        newValue, 
        rotateAll = false,
        secretType 
      } = body

      if (!rotateAll && !secretName) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Missing parameters',
            message: 'Either secretName or rotateAll=true is required'
          },
          { status: 400 }
        )
      }

      const secretsManager = getSecretsManager()
      const results = []

      if (rotateAll) {
        // Rotate all secrets of a specific type or all secrets
        const filters = secretType ? { type: secretType as SecretType } : {}
        const secrets = await secretsManager.listSecrets(filters)
        
        for (const secret of secrets) {
          try {
            const result = await secretsManager.rotateSecret(
              secret.name,
              undefined, // Auto-generate new value
              user.id
            )
            results.push({
              secretName: secret.name,
              ...result
            })
          } catch (error) {
            results.push({
              secretName: secret.name,
              success: false,
              error: (error as Error).message,
              oldSecretId: '',
              newSecretId: '',
              rotatedAt: new Date().toISOString()
            })
          }
        }
      } else {
        // Rotate single secret
        const result = await secretsManager.rotateSecret(
          secretName,
          newValue,
          user.id
        )
        results.push({
          secretName,
          ...result
        })
      }

      // Count successes and failures
      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length

      // Log the rotation operation
      await getAuditLogger().logAdminAction(
        'SYSTEM_ERROR', // Using existing action type
        user.id,
        undefined,
        undefined,
        undefined,
        {
          endpoint: '/api/admin/secrets/rotate',
          rotateAll,
          secretType,
          secretName,
          successful,
          failed,
          totalSecrets: results.length
        },
        context.ipAddress,
        context.userAgent
      )

      return NextResponse.json({
        success: successful > 0,
        message: `${successful} secrets rotated successfully${failed > 0 ? `, ${failed} failed` : ''}`,
        data: {
          results,
          summary: {
            total: results.length,
            successful,
            failed
          }
        }
      })

    } catch (error) {
      logger.error('Failed to rotate secrets', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to rotate secrets',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * GET /api/admin/secrets/rotate/status
 * 
 * Get secrets rotation status and health
 */
export const GET = withAuth(
  withHighSecurity(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Strict admin check
      if (!user.email?.endsWith('@rekonnlabs.com')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 403 }
        )
      }

      const { searchParams } = new URL(request.url)
      const secretType = searchParams.get('type') as SecretType | undefined
      const includeInactive = searchParams.get('includeInactive') === 'true'

      const secretsManager = getSecretsManager()
      
      // Get all secrets
      const filters = { 
        type: secretType,
        includeInactive 
      }
      const secrets = await secretsManager.listSecrets(filters)

      // Check health for each secret
      const healthChecks = await Promise.all(
        secrets.map(async (secret) => {
          try {
            const health = await secretsManager.checkSecretHealth(secret.name)
            return {
              secretName: secret.name,
              secretType: secret.type,
              version: secret.version,
              isActive: secret.isActive,
              ...health
            }
          } catch (error) {
            return {
              secretName: secret.name,
              secretType: secret.type,
              version: secret.version,
              isActive: secret.isActive,
              isHealthy: false,
              lastChecked: new Date().toISOString(),
              issues: [`Health check failed: ${(error as Error).message}`]
            }
          }
        })
      )

      // Calculate summary statistics
      const summary = {
        totalSecrets: secrets.length,
        healthySecrets: healthChecks.filter(h => h.isHealthy).length,
        unhealthySecrets: healthChecks.filter(h => !h.isHealthy).length,
        rotationDue: healthChecks.filter(h => h.rotationDue).length,
        expiringSoon: healthChecks.filter(h => h.expiresIn && h.expiresIn <= 7).length,
        byType: secrets.reduce((acc, secret) => {
          acc[secret.type] = (acc[secret.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }

      // Log admin access
      await getAuditLogger().logAdminAction(
        'ADMIN_ACCESS',
        user.id,
        undefined,
        undefined,
        undefined,
        {
          endpoint: '/api/admin/secrets/rotate/status',
          secretType,
          includeInactive,
          secretsChecked: secrets.length
        },
        context.ipAddress,
        context.userAgent
      )

      return NextResponse.json({
        success: true,
        data: {
          summary,
          secrets: healthChecks,
          timestamp: new Date().toISOString()
        }
      })

    } catch (error) {
      logger.error('Failed to get secrets status', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get secrets status',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)