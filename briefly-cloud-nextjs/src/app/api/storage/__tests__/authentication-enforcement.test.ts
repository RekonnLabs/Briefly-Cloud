/**
 * Authentication Enforcement Tests
 * 
 * Tests that storage OAuth routes properly enforce authentication
 * and include proper error handling and logging.
 */

describe('Storage OAuth Authentication Enforcement', () => {
  it('should have authentication checks in Google start route', () => {
    const fs = require('fs')
    const path = require('path')
    
    const googleStartPath = path.join(__dirname, '../google/start/route.ts')
    const googleStartSource = fs.readFileSync(googleStartPath, 'utf8')
    
    // Verify authentication check is present
    expect(googleStartSource).toContain('supabase.auth.getUser()')
    expect(googleStartSource).toContain('if (authError || !user)')
    
    // Verify redirect to login for unauthenticated users
    expect(googleStartSource).toContain('NextResponse.redirect(loginUrl)')
    expect(googleStartSource).toContain('new URL(\'/auth/signin\', req.url)')
    
    // Verify flow separation monitoring
    expect(googleStartSource).toContain('FlowSeparationMonitor.logStorageAuthFailure')
    expect(googleStartSource).toContain('getAuthFailureMessage(\'google\')')
  })

  it('should have authentication checks in Microsoft start route', () => {
    const fs = require('fs')
    const path = require('path')
    
    const microsoftStartPath = path.join(__dirname, '../microsoft/start/route.ts')
    const microsoftStartSource = fs.readFileSync(microsoftStartPath, 'utf8')
    
    // Verify authentication check is present
    expect(microsoftStartSource).toContain('supabase.auth.getUser()')
    expect(microsoftStartSource).toContain('if (authError || !user)')
    
    // Verify redirect to login for unauthenticated users
    expect(microsoftStartSource).toContain('NextResponse.redirect(loginUrl)')
    expect(microsoftStartSource).toContain('new URL(\'/auth/signin\', req.url)')
    
    // Verify flow separation monitoring
    expect(microsoftStartSource).toContain('FlowSeparationMonitor.logStorageAuthFailure')
    expect(microsoftStartSource).toContain('getAuthFailureMessage(\'microsoft\')')
  })

  it('should have proper error messages and return URLs', () => {
    const fs = require('fs')
    const path = require('path')
    
    const googleStartPath = path.join(__dirname, '../google/start/route.ts')
    const microsoftStartPath = path.join(__dirname, '../microsoft/start/route.ts')
    
    const googleStartSource = fs.readFileSync(googleStartPath, 'utf8')
    const microsoftStartSource = fs.readFileSync(microsoftStartPath, 'utf8')
    
    // Verify both routes set proper return URL and message
    expect(googleStartSource).toContain('loginUrl.searchParams.set(\'returnTo\'')
    expect(googleStartSource).toContain('loginUrl.searchParams.set(\'message\'')
    expect(microsoftStartSource).toContain('loginUrl.searchParams.set(\'returnTo\'')
    expect(microsoftStartSource).toContain('loginUrl.searchParams.set(\'message\'')
  })

  it('should use direct authentication instead of createProtectedApiHandler', () => {
    const fs = require('fs')
    const path = require('path')
    
    const googleStartPath = path.join(__dirname, '../google/start/route.ts')
    const microsoftStartPath = path.join(__dirname, '../microsoft/start/route.ts')
    
    const googleStartSource = fs.readFileSync(googleStartPath, 'utf8')
    const microsoftStartSource = fs.readFileSync(microsoftStartPath, 'utf8')
    
    // Verify they don't use createProtectedApiHandler (which returns JSON 401)
    // but instead handle authentication directly with redirects
    expect(googleStartSource).not.toContain('createProtectedApiHandler')
    expect(microsoftStartSource).not.toContain('createProtectedApiHandler')
    
    // Verify they export the handler directly
    expect(googleStartSource).toContain('export const GET = handler')
    expect(microsoftStartSource).toContain('export const GET = handler')
  })

  it('should have FlowSeparationMonitor utility', () => {
    const fs = require('fs')
    const path = require('path')
    
    const flowMonitorPath = path.join(__dirname, '../../../lib/oauth/flow-separation-monitor.ts')
    const flowMonitorSource = fs.readFileSync(flowMonitorPath, 'utf8')
    
    // Verify key methods exist
    expect(flowMonitorSource).toContain('logStorageAuthFailure')
    expect(flowMonitorSource).toContain('getAuthFailureMessage')
    expect(flowMonitorSource).toContain('logViolation')
    expect(flowMonitorSource).toContain('FlowSeparationMonitor')
    
    // Verify it logs to OAuth logger
    expect(flowMonitorSource).toContain('OAuthLogger.logSecurityEvent')
  })
})