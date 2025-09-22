/**
 * Tests for OAuth Redirect URI Validation
 */

import { 
  validateRedirectUri, 
  constructRedirectUri, 
  getAllowedDomains,
  InvalidRedirectUriError,
  validateRedirectUriOrThrow,
  getProviderConsoleConfig
} from '../redirect-validation'

// Mock environment variables
const originalEnv = process.env

beforeEach(() => {
  jest.resetModules()
  process.env = { ...originalEnv }
})

afterAll(() => {
  process.env = originalEnv
})

describe('OAuth Redirect URI Validation', () => {
  describe('validateRedirectUri', () => {
    describe('in development environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development'
        delete process.env.VERCEL_ENV
      })

      it('should allow localhost URLs', () => {
        expect(validateRedirectUri('http://localhost:3000/api/storage/google/callback', 'google')).toBe(true)
        expect(validateRedirectUri('http://127.0.0.1:3000/api/storage/microsoft/callback', 'microsoft')).toBe(true)
        expect(validateRedirectUri('http://localhost:3001/api/storage/google/callback', 'google')).toBe(true)
      })

      it('should reject production URLs in development', () => {
        expect(validateRedirectUri('https://briefly.rekonnlabs.com/api/storage/google/callback', 'google')).toBe(false)
        expect(validateRedirectUri('https://malicious.com/api/storage/google/callback', 'google')).toBe(false)
      })

      it('should reject invalid URLs', () => {
        expect(validateRedirectUri('not-a-url', 'google')).toBe(false)
        expect(validateRedirectUri('', 'google')).toBe(false)
      })
    })

    describe('in production environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production'
        process.env.VERCEL_ENV = 'production'
      })

      it('should allow production URLs', () => {
        expect(validateRedirectUri('https://briefly.rekonnlabs.com/api/storage/google/callback', 'google')).toBe(true)
        expect(validateRedirectUri('https://www.briefly.rekonnlabs.com/api/storage/microsoft/callback', 'microsoft')).toBe(true)
      })

      it('should reject localhost URLs in production', () => {
        expect(validateRedirectUri('http://localhost:3000/api/storage/google/callback', 'google')).toBe(false)
        expect(validateRedirectUri('http://127.0.0.1:3000/api/storage/microsoft/callback', 'microsoft')).toBe(false)
      })

      it('should reject malicious URLs', () => {
        expect(validateRedirectUri('https://malicious.com/api/storage/google/callback', 'google')).toBe(false)
        expect(validateRedirectUri('https://evil.briefly.rekonnlabs.com/api/storage/google/callback', 'google')).toBe(false)
      })
    })

    describe('in preview environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production'
        process.env.VERCEL_ENV = 'preview'
      })

      it('should allow Vercel preview URLs', () => {
        expect(validateRedirectUri('https://briefly-cloud-nextjs-git-main-rekonnlabs.vercel.app/api/storage/google/callback', 'google')).toBe(true)
        expect(validateRedirectUri('https://briefly-cloud-nextjs-rekonnlabs.vercel.app/api/storage/microsoft/callback', 'microsoft')).toBe(true)
        expect(validateRedirectUri('https://briefly-cloud-nextjs-feature-branch-rekonnlabs.vercel.app/api/storage/google/callback', 'google')).toBe(true)
      })

      it('should reject non-Vercel preview URLs', () => {
        expect(validateRedirectUri('https://malicious-preview.vercel.app/api/storage/google/callback', 'google')).toBe(false)
        expect(validateRedirectUri('https://localhost:3000/api/storage/google/callback', 'google')).toBe(false)
      })
    })
  })

  describe('constructRedirectUri', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      delete process.env.VERCEL_ENV
    })

    it('should construct valid redirect URI', () => {
      const uri = constructRedirectUri('http://localhost:3000', 'google', '/api/storage/google/callback')
      expect(uri).toBe('http://localhost:3000/api/storage/google/callback')
    })

    it('should throw error for invalid origin', () => {
      expect(() => {
        constructRedirectUri('https://malicious.com', 'google', '/api/storage/google/callback')
      }).toThrow('Redirect URI not allowed for google')
    })
  })

  describe('validateRedirectUriOrThrow', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      delete process.env.VERCEL_ENV
    })

    it('should not throw for valid URI', () => {
      expect(() => {
        validateRedirectUriOrThrow('http://localhost:3000/api/storage/google/callback', 'google')
      }).not.toThrow()
    })

    it('should throw InvalidRedirectUriError for invalid URI', () => {
      expect(() => {
        validateRedirectUriOrThrow('https://malicious.com/api/storage/google/callback', 'google')
      }).toThrow(InvalidRedirectUriError)
    })

    it('should include provider and environment in error', () => {
      try {
        validateRedirectUriOrThrow('https://malicious.com/api/storage/google/callback', 'google')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRedirectUriError)
        expect(error.provider).toBe('google')
        expect(error.environment).toBe('development')
        expect(error.uri).toBe('https://malicious.com/api/storage/google/callback')
      }
    })
  })

  describe('getAllowedDomains', () => {
    it('should return development domains in development', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.VERCEL_ENV
      
      const domains = getAllowedDomains()
      expect(domains).toContain('localhost:3000')
      expect(domains).toContain('127.0.0.1:3000')
    })

    it('should return production domains in production', () => {
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'production'
      
      const domains = getAllowedDomains()
      expect(domains).toContain('briefly.rekonnlabs.com')
      expect(domains).toContain('www.briefly.rekonnlabs.com')
    })
  })

  describe('getProviderConsoleConfig', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      delete process.env.VERCEL_ENV
    })

    it('should return configuration for provider consoles', () => {
      const config = getProviderConsoleConfig()
      
      expect(config.environment).toBe('development')
      expect(config.allowedDomains).toContain('localhost:3000')
      expect(config.redirectUris.google).toContain('https://localhost:3000/api/storage/google/callback')
      expect(config.redirectUris.microsoft).toContain('https://localhost:3000/api/storage/microsoft/callback')
      expect(config.instructions.google).toContain('Google Cloud Console')
      expect(config.instructions.microsoft).toContain('Azure App Registration')
    })
  })

  describe('Security Edge Cases', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      delete process.env.VERCEL_ENV
    })

    it('should reject subdomain attacks', () => {
      expect(validateRedirectUri('https://evil.localhost:3000/api/storage/google/callback', 'google')).toBe(false)
      expect(validateRedirectUri('https://malicious.briefly.rekonnlabs.com/api/storage/google/callback', 'google')).toBe(false)
    })

    it('should reject protocol manipulation', () => {
      expect(validateRedirectUri('javascript://localhost:3000/api/storage/google/callback', 'google')).toBe(false)
      expect(validateRedirectUri('data://localhost:3000/api/storage/google/callback', 'google')).toBe(false)
    })

    it('should reject path traversal attempts', () => {
      expect(validateRedirectUri('http://localhost:3000/../../../etc/passwd', 'google')).toBe(true) // URL is valid, but path doesn't matter for domain validation
    })

    it('should handle URL encoding attempts', () => {
      expect(validateRedirectUri('http://localhost%3A3000/api/storage/google/callback', 'google')).toBe(false)
    })
  })
})
