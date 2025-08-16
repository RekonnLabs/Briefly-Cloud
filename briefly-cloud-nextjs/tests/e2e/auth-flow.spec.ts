import { test, expect } from '@playwright/test'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/briefly/app')
  })

  test('should redirect unauthenticated users to sign in', async ({ page }) => {
    // Should be redirected to sign in page
    await expect(page).toHaveURL(/.*signin/)
    
    // Should show sign in form
    await expect(page.locator('h1')).toContainText(/sign in/i)
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })

  test('should display OAuth providers', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Should show Google and Microsoft sign in options
    await expect(page.locator('button[data-provider="google"]').first()).toBeVisible()
    await expect(page.locator('button[data-provider="azure-ad"]').first()).toBeVisible()
    
    // Should have correct provider names
    await expect(page.locator('button[data-provider="google"]').first()).toContainText('Google')
    await expect(page.locator('button[data-provider="azure-ad"]').first()).toContainText('Microsoft')
  })

  test('should handle Google OAuth flow', async ({ page }) => {
    // Mock Google OAuth response
    await page.route('**/api/auth/callback/google', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            image: 'https://example.com/avatar.jpg',
          },
        }),
      })
    })

    await page.goto('/auth/signin')
    
    // Click Google sign in button
    await page.click('button[data-provider="google"]')
    
    // Should redirect to Google OAuth
    await expect(page).toHaveURL(/accounts\.google\.com/)
  })

  test('should handle Microsoft OAuth flow', async ({ page }) => {
    // Mock Microsoft OAuth response
    await page.route('**/api/auth/callback/azure-ad', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            image: 'https://example.com/avatar.jpg',
          },
        }),
      })
    })

    await page.goto('/auth/signin')
    
    // Click Microsoft sign in button
    await page.click('button[data-provider="azure-ad"]')
    
    // Should redirect to Microsoft OAuth
    await expect(page).toHaveURL(/login\.microsoftonline\.com/)
  })

  test('should handle successful authentication', async ({ page }) => {
    // Mock successful authentication
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            image: 'https://example.com/avatar.jpg',
            subscriptionTier: 'free',
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      })
    })

    await page.goto('/briefly/app')
    
    // Should show authenticated user interface
    await expect(page.locator('[data-testid="user-profile"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="subscription-status"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="chat-interface"]').first()).toBeVisible()
  })

  test('should handle authentication errors', async ({ page }) => {
    // Mock authentication error
    await page.route('**/api/auth/callback/google', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'OAuth error',
          message: 'Authentication failed',
        }),
      })
    })

    await page.goto('/auth/signin')
    await page.click('button[data-provider="google"]')
    
    // Should show error message
    await expect(page.locator('[data-testid="auth-error"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="auth-error"]').first()).toContainText('Authentication failed')
  })

  test('should handle session expiration', async ({ page }) => {
    // Mock expired session
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: null,
          expires: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      })
    })

    await page.goto('/briefly/app')
    
    // Should redirect to sign in
    await expect(page).toHaveURL(/.*signin/)
  })

  test('should allow user to sign out', async ({ page }) => {
    // Mock authenticated session
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            subscriptionTier: 'free',
          },
        }),
      })
    })

    await page.goto('/briefly/app')
    
    // Click sign out button
    await page.click('[data-testid="sign-out-button"]')
    
    // Should redirect to sign in page
    await expect(page).toHaveURL(/.*signin/)
  })

  test('should preserve user preferences after authentication', async ({ page }) => {
    // Mock authenticated session with user settings
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            subscriptionTier: 'pro',
            preferences: {
              theme: 'dark',
              language: 'en',
            },
          },
        }),
      })
    })

    await page.goto('/briefly/app')
    
    // Should apply user preferences
    await expect(page.locator('[data-testid="theme-dark"]').first()).toBeVisible()
  })

  test('should handle subscription tier display', async ({ page }) => {
    // Mock authenticated session with different tiers
    const tiers = ['free', 'pro', 'pro_byok']
    
    for (const tier of tiers) {
      await page.route('**/api/auth/session', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
              name: 'Test User',
              subscriptionTier: tier,
            },
          }),
        })
      })

      await page.goto('/briefly/app')
      
      // Should display correct subscription tier
      await expect(page.locator('[data-testid="subscription-tier"]').first()).toContainText(tier)
    }
  })

  test('should handle OAuth token refresh', async ({ page }) => {
    // Mock token refresh
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      })
    })

    await page.goto('/briefly/app')
    
    // Should maintain session after token refresh
    await expect(page.locator('[data-testid="user-profile"]').first()).toBeVisible()
  })

  test('should validate OAuth redirect URIs', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Check Google OAuth redirect URI
    const googleButton = page.locator('button[data-provider="google"]').first()
    await expect(googleButton).toHaveAttribute('data-redirect-uri', `${SITE_URL}/auth/callback`)
    
    // Check Microsoft OAuth redirect URI
    const microsoftButton = page.locator('button[data-provider="azure-ad"]').first()
    await expect(microsoftButton).toHaveAttribute('data-redirect-uri', `${SITE_URL}/auth/callback`)
  })
})
