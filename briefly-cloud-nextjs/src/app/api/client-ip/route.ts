/**
 * Client IP Address API
 * 
 * Returns the client's IP address for GDPR consent logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiResponse } from '@/app/lib/api-utils';

/**
 * GET /api/client-ip
 * Get the client's IP address
 */
export async function GET(request: NextRequest) {
  try {
    // Get IP from various headers (Vercel, Cloudflare, etc.)
    const ip = 
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-client-ip') ||
      'unknown';

    return createApiResponse({
      ip: ip.trim()
    });

  } catch (error) {
    console.error('Error getting client IP:', error);
    return createApiResponse({
      ip: 'unknown'
    });
  }
}