/**
 * Cloud Auth Context
 * 
 * Provides authentication context for cloud provider API calls via Apideck
 */

import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export interface CloudAuthContext {
  userId: string
  provider: 'gdrive' | 'onedrive' | 'dropbox'
  consumerId: string // Apideck consumer ID (typically user ID)
  serviceId: string // Apideck service ID (google-drive, microsoft-onedrive, dropbox)
  apideckApiKey: string
  apideckAppId: string
}

/**
 * Map provider names to Apideck service IDs
 */
const PROVIDER_TO_SERVICE_ID: Record<string, string> = {
  gdrive: 'google-drive',
  onedrive: 'microsoft-onedrive',
  dropbox: 'dropbox'
}

/**
 * Get cloud authentication context for Apideck API calls
 * 
 * @param userId - User ID
 * @param provider - Cloud provider (gdrive, onedrive, dropbox)
 * @returns Authentication context for API calls
 */
export async function getCloudAuthContext(
  userId: string,
  provider: 'gdrive' | 'onedrive' | 'dropbox'
): Promise<CloudAuthContext> {
  // Validate inputs
  if (!userId) {
    throw createError.badRequest('User ID is required')
  }

  if (!provider) {
    throw createError.badRequest('Provider is required')
  }

  if (!['gdrive', 'onedrive', 'dropbox'].includes(provider)) {
    throw createError.badRequest(`Invalid provider: ${provider}`)
  }

  // Get Apideck credentials from environment
  const apideckApiKey = process.env.APIDECK_API_KEY
  const apideckAppId = process.env.APIDECK_APP_ID

  if (!apideckApiKey) {
    logger.error('Missing APIDECK_API_KEY environment variable')
    throw createError.serverError('Cloud sync configuration error')
  }

  if (!apideckAppId) {
    logger.error('Missing APIDECK_APP_ID environment variable')
    throw createError.serverError('Cloud sync configuration error')
  }

  // Map provider to Apideck service ID
  const serviceId = PROVIDER_TO_SERVICE_ID[provider]

  if (!serviceId) {
    throw createError.badRequest(`Unsupported provider: ${provider}`)
  }

  // Use user ID as consumer ID (Apideck's way of identifying end users)
  const consumerId = userId

  logger.info('Cloud auth context created', {
    userId,
    provider,
    serviceId,
    hasApiKey: !!apideckApiKey,
    hasAppId: !!apideckAppId
  })

  return {
    userId,
    provider,
    consumerId,
    serviceId,
    apideckApiKey,
    apideckAppId
  }
}

/**
 * Create Apideck API headers
 */
export function createApideckHeaders(context: CloudAuthContext): Record<string, string> {
  return {
    'Authorization': `Bearer ${context.apideckApiKey}`,
    'X-APIDECK-APP-ID': context.apideckAppId,
    'X-APIDECK-CONSUMER-ID': context.consumerId,
    'X-APIDECK-SERVICE-ID': context.serviceId,
    'Content-Type': 'application/json'
  }
}
