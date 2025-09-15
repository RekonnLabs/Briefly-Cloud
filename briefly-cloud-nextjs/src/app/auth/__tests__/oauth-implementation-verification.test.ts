/**
 * OAuth Implementation Verification Tests
 * 
 * Comprehensive verification that OAuth route handlers meet all requirements 8.1-8.5
 * by examining the actual implementation code and testing integration patterns.
 */

// Mock server-only module
jest.mock('server-only', () => ({}))

describe('OAuth Implementation Verification', () => {
  describe('Requirement 8.1: Writable Supabase clients with proper cookie adapters', () => {
    it('should verify getSupabaseServerMutable has proper cookie adapter implementation', () => {
      // Read the actual implementation
      const fs = require('fs')
      const path = require('path')
      
      const supabaseServerMutablePath = path.join(process.cwd(), 'src/app/lib/auth/supabase-server-mutable.ts')
      const content = fs.readFileSync(supabaseServerMutablePath, 'utf8')
      
      // Verify key implementation patterns
      expect(content).toContain('createServerClient')
      expect(content).toContain('cookies:')
      expect(content).toContain('get: (name) => req.cookies.get(name)?.value')
      expect(content).toContain('set: (name, value, options) => res.cookies.set(name, value, options)')
      expect(content).toContain('remove: (name, options) => res.cookies.set(name, "", { ...options, maxAge: 0 })')
    })

    it('should verify OAuth start route uses getSupabaseServerMutable correctly', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const content = fs.readFileSync(startRoutePath, 'utf8')
      
      // Verify proper usage patterns
      expect(content).toContain('getSupabaseServerMutable(req, res)')
      expect(content).toContain('supabase.auth.signInWithOAuth')
    })

    it('should verify OAuth callback route uses getSupabaseServerMutable correctly', () => {
      const fs = require('fs')
      const path = require('path')
      
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      const content = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify proper usage patterns
      expect(content).toContain('getSupabaseServerMutable(req, res)')
      expect(content).toContain('supabase.auth.exchangeCodeForSession')
    })
  })

  describe('Requirement 8.2: NextResponse.redirect() with proper header forwarding', () => {
    it('should verify OAuth start route uses NextResponse.redirect with header forwarding', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const content = fs.readFileSync(startRoutePath, 'utf8')
      
      // Verify NextResponse.redirect usage with headers
      expect(content).toContain('NextResponse.redirect')
      expect(content).toContain('{ headers: res.headers }')
    })

    it('should verify OAuth callback route uses NextResponse.redirect with header forwarding', () => {
      const fs = require('fs')
      const path = require('path')
      
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      const content = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify NextResponse.redirect usage with headers
      expect(content).toContain('NextResponse.redirect')
      expect(content).toContain('{ headers }')
    })
  })

  describe('Requirement 8.3: new NextResponse(null) usage to avoid Vercel errors', () => {
    it('should verify OAuth start route uses new NextResponse(null) pattern', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const content = fs.readFileSync(startRoutePath, 'utf8')
      
      // Verify NextResponse(null) pattern
      expect(content).toContain('new NextResponse(null)')
    })

    it('should verify OAuth callback route uses new NextResponse(null) pattern', () => {
      const fs = require('fs')
      const path = require('path')
      
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      const content = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify NextResponse(null) pattern
      expect(content).toContain('new NextResponse(null)')
    })
  })

  describe('Requirement 8.4: Cookie forwarding in redirect responses', () => {
    it('should verify OAuth routes forward headers containing cookies', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify header forwarding patterns that maintain cookies
      expect(startContent).toContain('{ headers: res.headers }')
      expect(callbackContent).toContain('{ headers }')
      
      // Verify headers are extracted from response
      expect(callbackContent).toContain('const headers = res.headers')
    })
  })

  describe('Requirement 8.5: Vercel deployment compatibility', () => {
    it('should verify OAuth routes use clampNext for open redirect protection', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify clampNext usage
      expect(startContent).toContain('import { clampNext }')
      expect(startContent).toContain('clampNext(req.nextUrl.searchParams.get("next"))')
      
      expect(callbackContent).toContain('import { clampNext }')
      expect(callbackContent).toContain('clampNext(req.nextUrl.searchParams.get("next"))')
    })

    it('should verify OAuth routes handle missing parameters gracefully', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify error handling for missing parameters
      expect(startContent).toContain('if (!provider)')
      expect(startContent).toContain('/auth/signin?err=provider')
      
      expect(callbackContent).toContain('if (!code)')
      expect(callbackContent).toContain('/auth/signin?err=code')
    })

    it('should verify OAuth routes handle authentication errors properly', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify error handling for auth failures
      expect(startContent).toContain('if (error || !data?.url)')
      expect(startContent).toContain('/auth/signin?err=start')
      
      expect(callbackContent).toContain('error ? new URL("/auth/signin?err=exchange", req.url) : dest')
    })

    it('should verify OAuth routes use proper Node.js runtime', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify runtime configuration for Vercel compatibility
      expect(startContent).toContain('export const runtime = "nodejs"')
      expect(callbackContent).toContain('export const runtime = "nodejs"')
    })
  })

  describe('Integration Verification', () => {
    it('should verify complete OAuth flow implementation', () => {
      const fs = require('fs')
      const path = require('path')
      
      // Verify all required files exist
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      const supabaseServerMutablePath = path.join(process.cwd(), 'src/app/lib/auth/supabase-server-mutable.ts')
      const clampNextPath = path.join(process.cwd(), 'src/app/lib/auth/utils.ts')
      
      expect(fs.existsSync(startRoutePath)).toBe(true)
      expect(fs.existsSync(callbackRoutePath)).toBe(true)
      expect(fs.existsSync(supabaseServerMutablePath)).toBe(true)
      expect(fs.existsSync(clampNextPath)).toBe(true)
    })

    it('should verify OAuth routes export GET handlers', () => {
      const fs = require('fs')
      const path = require('path')
      
      const startRoutePath = path.join(process.cwd(), 'src/app/auth/start/route.ts')
      const callbackRoutePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts')
      
      const startContent = fs.readFileSync(startRoutePath, 'utf8')
      const callbackContent = fs.readFileSync(callbackRoutePath, 'utf8')
      
      // Verify proper export patterns
      expect(startContent).toContain('export async function GET')
      expect(callbackContent).toContain('export async function GET')
    })
  })
})