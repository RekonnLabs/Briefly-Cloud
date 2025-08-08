import { NextRequest, NextResponse } from 'next/server'
import { securityHeadersMiddleware, corsMiddleware } from './src/app/lib/security'

// Define which paths should be handled by this middleware
const protectedPaths = [
  '/api',
  '/briefly/app',
  '/auth'
]

// Define paths that should be excluded from middleware
const excludedPaths = [
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Only apply security middleware to protected paths
  if (!protectedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Handle CORS for API routes
  if (pathname.startsWith('/api')) {
    const corsResponse = corsMiddleware(request)
    if (corsResponse) {
      return corsResponse
    }
  }

  // Create response
  const response = NextResponse.next()

  // Apply security headers to all responses
  return securityHeadersMiddleware(response)
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
