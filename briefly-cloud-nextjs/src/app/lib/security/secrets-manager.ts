/**
 * Secrets Management Service
 * 
 * This service provides secure secrets management, rotation,
 * and validation with integration to Supabase Vault.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getAuditLogger } from '@/app/lib/stubs/audit/audit-logger'
import crypto from 'crypto'

export type SecretType = 
  | 'api_key' 
  | 'encryption_key' 
  | 'jwt_secret' 
  | 'oauth_secret' 
  | 'webhook_secret'
  | 'database_password'

export interface SecretMetadata {
  id: string
  name: string
  type: SecretType
  description?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
  rotationInterval?: number // days
  lastRotated?: string
  version: number
  isActive: boolean
  tags?: string[]
}

export interface SecretValue {
  value: string
  metadata: SecretMetadata
}

export interface SecretRotationResult {
  success: boolean
  oldSecretId: string
  newSecretId: string
  rotatedAt: string
  error?: string
}

export interface SecretHealth {
  secretId: string
  isHealthy: boolean
  lastChecked: string
  issues: string[]
  expiresIn?: number // days
  rotationDue?: boolean
}

/**
 * Secrets Manager Service
 */
export class SecretsManager {
  private readonly auditLogger = getAuditLogger()

  /**
   * Store a secret securely
   */
  async storeSecret(
    name: string,
    value: string,
    type: SecretType,
    options: {
      description?: string
      expiresAt?: Date
      rotationInterval?: number
      tags?: string[]
      userId?: string
    } = {}
  ): Promise<SecretMetadata> {
    try {
      // Validate secret strength
      const validation = this.validateSecretStrength(value, type)
      if (!validation.isValid) {
        throw new Error(`Secret validation failed: ${validation.errors.join(', ')}`)
      }

      // Encrypt the secret value
      const encryptedValue = this.encryptSecret(value)

      // Store in Supabase Vault
      const { data: secret, error } = await supabaseAdmin
        .from('vault.secrets')
        .insert({
          name,
          secret: encryptedValue.encrypted,
          key_id: encryptedValue.keyId,
          nonce: encryptedValue.nonce,
          description: options.description,
          secret_type: type,
          expires_at: options.expiresAt?.toISOString(),
          rotation_interval_days: options.rotationInterval,
          tags: options.tags || [],
          version: 1,
          is_active: true
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      // Log secret creation
      await this.auditLogger.logAction({
        userId: options.userId,
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'security',
        resourceId: secret.id,
        metadata: {
          action: 'secret_created',
          secretName: name,
          secretType: type,
          hasExpiration: !!options.expiresAt,
          rotationInterval: options.rotationInterval
        },
        severity: 'info'
      })

      return this.formatSecretMetadata(secret)

    } catch (error) {
      logger.error('Failed to store secret', { name, type }, error as Error)
      throw createError.databaseError('Failed to store secret', error as Error)
    }
  }

  /**
   * Retrieve a secret by name
   */
  async getSecret(name: string, userId?: string): Promise<SecretValue | null> {
    try {
      const { data: secret, error } = await supabaseAdmin
        .from('vault.secrets')
        .select('*')
        .eq('name', name)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (error || !secret) {
        return null
      }

      // Check if secret has expired
      if (secret.expires_at && new Date(secret.expires_at) < new Date()) {
        logger.warn('Attempted to access expired secret', { name })
        return null
      }

      // Decrypt the secret value
      const decryptedValue = this.decryptSecret({
        encrypted: secret.secret,
        keyId: secret.key_id,
        nonce: secret.nonce
      })

      // Log secret access
      await this.auditLogger.logAction({
        userId,
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'security',
        resourceId: secret.id,
        metadata: {
          action: 'secret_accessed',
          secretName: name,
          secretType: secret.secret_type
        },
        severity: 'info'
      })

      return {
        value: decryptedValue,
        metadata: this.formatSecretMetadata(secret)
      }

    } catch (error) {
      logger.error('Failed to retrieve secret', { name }, error as Error)
      throw createError.databaseError('Failed to retrieve secret', error as Error)
    }
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(
    name: string,
    newValue?: string,
    userId?: string
  ): Promise<SecretRotationResult> {
    try {
      // Get current secret
      const currentSecret = await this.getSecret(name, userId)
      if (!currentSecret) {
        throw new Error('Secret not found')
      }

      // Generate new value if not provided
      if (!newValue) {
        newValue = this.generateSecretValue(currentSecret.metadata.type)
      }

      // Validate new secret
      const validation = this.validateSecretStrength(newValue, currentSecret.metadata.type)
      if (!validation.isValid) {
        throw new Error(`New secret validation failed: ${validation.errors.join(', ')}`)
      }

      // Deactivate old secret
      await supabaseAdmin
        .from('vault.secrets')
        .update({ is_active: false })
        .eq('id', currentSecret.metadata.id)

      // Store new secret with incremented version
      const newSecretMetadata = await this.storeSecret(
        name,
        newValue,
        currentSecret.metadata.type,
        {
          description: currentSecret.metadata.description,
          expiresAt: currentSecret.metadata.expiresAt ? new Date(currentSecret.metadata.expiresAt) : undefined,
          rotationInterval: currentSecret.metadata.rotationInterval,
          tags: currentSecret.metadata.tags,
          userId
        }
      )

      // Update version
      await supabaseAdmin
        .from('vault.secrets')
        .update({ 
          version: currentSecret.metadata.version + 1,
          last_rotated: new Date().toISOString()
        })
        .eq('id', newSecretMetadata.id)

      // Log rotation
      await this.auditLogger.logAction({
        userId,
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'security',
        resourceId: newSecretMetadata.id,
        metadata: {
          action: 'secret_rotated',
          secretName: name,
          oldSecretId: currentSecret.metadata.id,
          newSecretId: newSecretMetadata.id,
          rotationType: newValue ? 'manual' : 'automatic'
        },
        severity: 'warning'
      })

      return {
        success: true,
        oldSecretId: currentSecret.metadata.id,
        newSecretId: newSecretMetadata.id,
        rotatedAt: new Date().toISOString()
      }

    } catch (error) {
      logger.error('Failed to rotate secret', { name }, error as Error)
      
      return {
        success: false,
        oldSecretId: '',
        newSecretId: '',
        rotatedAt: new Date().toISOString(),
        error: (error as Error).message
      }
    }
  }

  /**
   * Check secret health and rotation status
   */
  async checkSecretHealth(name: string): Promise<SecretHealth> {
    try {
      const secret = await this.getSecret(name)
      if (!secret) {
        return {
          secretId: '',
          isHealthy: false,
          lastChecked: new Date().toISOString(),
          issues: ['Secret not found']
        }
      }

      const issues: string[] = []
      let isHealthy = true

      // Check expiration
      let expiresIn: number | undefined
      if (secret.metadata.expiresAt) {
        const expirationDate = new Date(secret.metadata.expiresAt)
        const now = new Date()
        expiresIn = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (expiresIn <= 0) {
          issues.push('Secret has expired')
          isHealthy = false
        } else if (expiresIn <= 7) {
          issues.push(`Secret expires in ${expiresIn} days`)
        }
      }

      // Check rotation due
      let rotationDue = false
      if (secret.metadata.rotationInterval && secret.metadata.lastRotated) {
        const lastRotated = new Date(secret.metadata.lastRotated)
        const daysSinceRotation = Math.ceil((Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysSinceRotation >= secret.metadata.rotationInterval) {
          issues.push(`Secret rotation overdue by ${daysSinceRotation - secret.metadata.rotationInterval} days`)
          rotationDue = true
        } else if (daysSinceRotation >= secret.metadata.rotationInterval - 7) {
          issues.push(`Secret rotation due in ${secret.metadata.rotationInterval - daysSinceRotation} days`)
          rotationDue = true
        }
      }

      // Validate secret strength
      const validation = this.validateSecretStrength(secret.value, secret.metadata.type)
      if (!validation.isValid) {
        issues.push(...validation.errors)
        isHealthy = false
      }

      return {
        secretId: secret.metadata.id,
        isHealthy: isHealthy && issues.length === 0,
        lastChecked: new Date().toISOString(),
        issues,
        expiresIn,
        rotationDue
      }

    } catch (error) {
      logger.error('Failed to check secret health', { name }, error as Error)
      
      return {
        secretId: '',
        isHealthy: false,
        lastChecked: new Date().toISOString(),
        issues: [`Health check failed: ${(error as Error).message}`]
      }
    }
  }

  /**
   * List all secrets (metadata only)
   */
  async listSecrets(
    filters: {
      type?: SecretType
      tags?: string[]
      includeInactive?: boolean
    } = {}
  ): Promise<SecretMetadata[]> {
    try {
      let query = supabaseAdmin
        .from('vault.secrets')
        .select('id, name, secret_type, description, created_at, updated_at, expires_at, rotation_interval_days, last_rotated, version, is_active, tags')

      if (!filters.includeInactive) {
        query = query.eq('is_active', true)
      }

      if (filters.type) {
        query = query.eq('secret_type', filters.type)
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.contains('tags', filters.tags)
      }

      const { data: secrets, error } = await query.order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return (secrets || []).map(secret => this.formatSecretMetadata(secret))

    } catch (error) {
      logger.error('Failed to list secrets', filters, error as Error)
      throw createError.databaseError('Failed to list secrets', error as Error)
    }
  }

  /**
   * Delete a secret permanently
   */
  async deleteSecret(name: string, userId?: string): Promise<void> {
    try {
      const secret = await this.getSecret(name, userId)
      if (!secret) {
        throw new Error('Secret not found')
      }

      // Soft delete by deactivating
      const { error } = await supabaseAdmin
        .from('vault.secrets')
        .update({ 
          is_active: false,
          deleted_at: new Date().toISOString()
        })
        .eq('name', name)

      if (error) {
        throw error
      }

      // Log deletion
      await this.auditLogger.logAction({
        userId,
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'security',
        resourceId: secret.metadata.id,
        metadata: {
          action: 'secret_deleted',
          secretName: name,
          secretType: secret.metadata.type
        },
        severity: 'warning'
      })

    } catch (error) {
      logger.error('Failed to delete secret', { name }, error as Error)
      throw createError.databaseError('Failed to delete secret', error as Error)
    }
  }

  /**
   * Encrypt a secret value
   */
  private encryptSecret(value: string): {
    encrypted: string
    keyId: string
    nonce: string
  } {
    const algorithm = 'aes-256-gcm'
    const key = this.getEncryptionKey()
    const nonce = crypto.randomBytes(16)
    
    const cipher = crypto.createCipher(algorithm, key)
    cipher.setAAD(Buffer.from('briefly-cloud-secret'))
    
    let encrypted = cipher.update(value, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return {
      encrypted: encrypted + ':' + authTag.toString('hex'),
      keyId: 'default', // In production, use proper key management
      nonce: nonce.toString('hex')
    }
  }

  /**
   * Decrypt a secret value
   */
  private decryptSecret(encryptedData: {
    encrypted: string
    keyId: string
    nonce: string
  }): string {
    const algorithm = 'aes-256-gcm'
    const key = this.getEncryptionKey()
    
    const [encrypted, authTagHex] = encryptedData.encrypted.split(':')
    const authTag = Buffer.from(authTagHex, 'hex')
    const nonce = Buffer.from(encryptedData.nonce, 'hex')
    
    const decipher = crypto.createDecipher(algorithm, key)
    decipher.setAAD(Buffer.from('briefly-cloud-secret'))
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Get encryption key from environment
   */
  private getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY
    if (!key || key.length < 32) {
      throw new Error('Invalid encryption key')
    }
    return key
  }

  /**
   * Validate secret strength
   */
  private validateSecretStrength(value: string, type: SecretType): {
    isValid: boolean
    errors: string[]
    score: number
  } {
    const errors: string[] = []
    let score = 0

    // Length requirements by type
    const minLengths: Record<SecretType, number> = {
      api_key: 32,
      encryption_key: 32,
      jwt_secret: 32,
      oauth_secret: 24,
      webhook_secret: 24,
      database_password: 16
    }

    const minLength = minLengths[type] || 16
    if (value.length < minLength) {
      errors.push(`Secret must be at least ${minLength} characters long`)
    } else {
      score += 20
    }

    // Character diversity
    const hasLower = /[a-z]/.test(value)
    const hasUpper = /[A-Z]/.test(value)
    const hasDigit = /\d/.test(value)
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)

    const diversity = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length
    if (diversity < 3) {
      errors.push('Secret should contain at least 3 different character types (lowercase, uppercase, digits, special)')
    } else {
      score += diversity * 10
    }

    // Entropy check
    const entropy = this.calculateEntropy(value)
    if (entropy < 4.0) {
      errors.push('Secret has low entropy (randomness)')
    } else {
      score += Math.min(30, entropy * 5)
    }

    // Common patterns
    if (this.hasCommonPatterns(value)) {
      errors.push('Secret contains common patterns')
    } else {
      score += 20
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.min(100, score)
    }
  }

  /**
   * Calculate Shannon entropy
   */
  private calculateEntropy(str: string): number {
    const freq: Record<string, number> = {}
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1
    }

    let entropy = 0
    const len = str.length
    for (const char in freq) {
      const p = freq[char] / len
      entropy -= p * Math.log2(p)
    }

    return entropy
  }

  /**
   * Check for common patterns
   */
  private hasCommonPatterns(value: string): boolean {
    const patterns = [
      /123456/,
      /password/i,
      /secret/i,
      /admin/i,
      /test/i,
      /(.)\1{3,}/, // Repeated characters
      /^[a-zA-Z]+$/, // Only letters
      /^[0-9]+$/ // Only numbers
    ]

    return patterns.some(pattern => pattern.test(value))
  }

  /**
   * Generate a secure secret value
   */
  private generateSecretValue(type: SecretType): string {
    const lengths: Record<SecretType, number> = {
      api_key: 64,
      encryption_key: 64,
      jwt_secret: 64,
      oauth_secret: 48,
      webhook_secret: 48,
      database_password: 32
    }

    const length = lengths[type] || 32
    return crypto.randomBytes(length).toString('base64url')
  }

  /**
   * Format secret metadata from database record
   */
  private formatSecretMetadata(secret: any): SecretMetadata {
    return {
      id: secret.id,
      name: secret.name,
      type: secret.secret_type,
      description: secret.description,
      createdAt: secret.created_at,
      updatedAt: secret.updated_at,
      expiresAt: secret.expires_at,
      rotationInterval: secret.rotation_interval_days,
      lastRotated: secret.last_rotated,
      version: secret.version,
      isActive: secret.is_active,
      tags: secret.tags || []
    }
  }
}

// Singleton instance
let secretsManager: SecretsManager | null = null

/**
 * Get the secrets manager instance
 */
export function getSecretsManager(): SecretsManager {
  if (!secretsManager) {
    secretsManager = new SecretsManager()
  }
  return secretsManager
}

/**
 * Convenience functions
 */

export async function getSecret(name: string, userId?: string): Promise<string | null> {
  const manager = getSecretsManager()
  const secret = await manager.getSecret(name, userId)
  return secret?.value || null
}

export async function storeSecret(
  name: string,
  value: string,
  type: SecretType,
  options?: {
    description?: string
    expiresAt?: Date
    rotationInterval?: number
    tags?: string[]
    userId?: string
  }
): Promise<SecretMetadata> {
  const manager = getSecretsManager()
  return manager.storeSecret(name, value, type, options)
}

export async function rotateSecret(
  name: string,
  newValue?: string,
  userId?: string
): Promise<SecretRotationResult> {
  const manager = getSecretsManager()
  return manager.rotateSecret(name, newValue, userId)
}

export async function checkSecretHealth(name: string): Promise<SecretHealth> {
  const manager = getSecretsManager()
  return manager.checkSecretHealth(name)
}