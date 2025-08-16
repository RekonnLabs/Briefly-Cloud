/**
 * Simple Rate Limit Configuration
 * Temporary file to fix build issues
 */

export const rateLimitConfigs = {
  chat: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
  },
  upload: {
    windowMs: 60 * 1000, // 1 minute  
    max: 10, // 10 uploads per minute
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  }
} as const