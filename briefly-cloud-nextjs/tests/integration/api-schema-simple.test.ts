/**
 * Simple API schema integration test
 * Tests basic functionality to verify schema fixes work
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { supabaseApp } from '@/app/lib/supabase-clients'
import { filesRepo } from '@/app/lib/repos/files-repo'
import { oauthTokensRepo } from '@/app/lib/repos/oauth-tokens-repo'
import { usersRepo } from '@/app/lib/repos/users-repo'

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'test-simple@example.com'

describe('API Schema Simple Integration Tests', () => {
  beforeAll(async () => {
    // Create test user
    await supabaseApp
      .from('users')
      .upsert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        subscription_tier: 'free',
        documents_uploaded: 0,
        storage_used_bytes: 0
      })
  })

  afterAll(async () => {
    // Cleanup
    try {
      await supabaseApp.from('files').delete().eq('user_id', TEST_USER_ID)
      await supabaseApp.from('users').delete().eq('id', TEST_USER_ID)
      await oauthTokensRepo.deleteToken(TEST_USER_ID, 'google')
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  })

  it('should create file records in app.files correctly', async () => {
    const fileData = {
      ownerId: TEST_USER_ID,
      name: 'test.pdf',
      path: 'test.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf'
    }

    const createdFile = await filesRepo.create(fileData)
    
    expect(createdFile).toBeDefined()
    expect(createdFile.id).toBeDefined()
    expect(createdFile.user_id).toBe(TEST_USER_ID)
    expect(createdFile.name).toBe('test.pdf')
  })

  it('should store OAuth tokens in private schema via RPC', async () => {
    const tokenData = {
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    }

    await oauthTokensRepo.saveToken(TEST_USER_ID, 'google', tokenData)
    
    const retrievedToken = await oauthTokensRepo.getToken(TEST_USER_ID, 'google')
    expect(retrievedToken).toBeDefined()
    expect(retrievedToken.accessToken).toBe('test-token')
  })

  it('should read user data from app.users correctly', async () => {
    const userProfile = await usersRepo.getById(TEST_USER_ID)
    
    expect(userProfile).toBeDefined()
    expect(userProfile.id).toBe(TEST_USER_ID)
    expect(userProfile.subscription_tier).toBe('free')
  })

  it('should verify schema connectivity', async () => {
    // Test app schema
    const { data: appTest, error: appError } = await supabaseApp
      .from('users')
      .select('id')
      .limit(1)

    expect(appError).toBeNull()

    // Test private schema via RPC
    const { data: privateTest, error: privateError } = await supabaseApp
      .rpc('get_oauth_token', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_provider: 'google'
      })

    expect(privateError).toBeNull()
  })
})