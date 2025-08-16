/**
 * Simple Rate Limit Configuration
 * Temporary file to fix build issues
 */

import { NextRequest, NextResponse } from 'next/server';

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
} as const;

// Simple rate limiting implementation
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function withRateLimit(request: NextRequest, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler(); // For now, just pass through - implement proper rate limiting later
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}