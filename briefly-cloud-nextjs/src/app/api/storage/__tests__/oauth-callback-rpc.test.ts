/**
 * Tests for OAuth callback routes with RPC-based token storage
 * Verifies that callback routes use oauthTokensRepo instead of TokenStore
 */

describe('OAuth Callback Routes RPC Integration', () => {
  it('should import oauthTokensRepo instead of TokenStore', () => {
    // Read the source files to verify they use oauthTokensRepo
    const fs = require('fs')
    const path = require('path')
    
    const googleCallbackPath = path.join(__dirname, '../google/callback/route.ts')
    const microsoftCallbackPath = path.join(__dirname, '../microsoft/callback/route.ts')
    
    const googleCallbackSource = fs.readFileSync(googleCallbackPath, 'utf8')
    const microsoftCallbackSource = fs.readFileSync(microsoftCallbackPath, 'utf8')
    
    // Verify they import oauthTokensRepo instead of TokenStore
    expect(googleCallbackSource).toContain('import { oauthTokensRepo } from \'@/app/lib/repos/oauth-tokens-repo\'')
    expect(googleCallbackSource).not.toContain('import { TokenStore } from \'@/app/lib/oauth/token-store\'')
    
    expect(microsoftCallbackSource).toContain('import { oauthTokensRepo } from \'@/app/lib/repos/oauth-tokens-repo\'')
    expect(microsoftCallbackSource).not.toContain('import { TokenStore } from \'@/app/lib/oauth/token-store\'')
    
    // Verify they use oauthTokensRepo.saveToken instead of TokenStore.saveToken
    expect(googleCallbackSource).toContain('await oauthTokensRepo.saveToken(')
    expect(googleCallbackSource).not.toContain('await TokenStore.saveToken(')
    
    expect(microsoftCallbackSource).toContain('await oauthTokensRepo.saveToken(')
    expect(microsoftCallbackSource).not.toContain('await TokenStore.saveToken(')
    
    // Verify they use oauthTokensRepo.getToken instead of TokenStore.getToken
    expect(googleCallbackSource).toContain('await oauthTokensRepo.getToken(')
    expect(googleCallbackSource).not.toContain('await TokenStore.getToken(')
    
    expect(microsoftCallbackSource).toContain('await oauthTokensRepo.getToken(')
    expect(microsoftCallbackSource).not.toContain('await TokenStore.getToken(')
  })

  it('should use RPC-specific error handling', () => {
    const fs = require('fs')
    const path = require('path')
    
    const googleCallbackPath = path.join(__dirname, '../google/callback/route.ts')
    const microsoftCallbackPath = path.join(__dirname, '../microsoft/callback/route.ts')
    
    const googleCallbackSource = fs.readFileSync(googleCallbackPath, 'utf8')
    const microsoftCallbackSource = fs.readFileSync(microsoftCallbackPath, 'utf8')
    
    // Verify they use RPC-specific error logging
    expect(googleCallbackSource).toContain('token-storage-rpc')
    expect(googleCallbackSource).toContain('method: \'rpc_function\'')
    expect(googleCallbackSource).toContain('operation: \'token_storage_rpc\'')
    
    expect(microsoftCallbackSource).toContain('token-storage-rpc')
    expect(microsoftCallbackSource).toContain('method: \'rpc_function\'')
    expect(microsoftCallbackSource).toContain('operation: \'token_storage_rpc\'')
  })

  it('should use proper RPC logging messages', () => {
    const fs = require('fs')
    const path = require('path')
    
    const googleCallbackPath = path.join(__dirname, '../google/callback/route.ts')
    const microsoftCallbackPath = path.join(__dirname, '../microsoft/callback/route.ts')
    
    const googleCallbackSource = fs.readFileSync(googleCallbackPath, 'utf8')
    const microsoftCallbackSource = fs.readFileSync(microsoftCallbackPath, 'utf8')
    
    // Verify they use RPC-specific logging messages
    expect(googleCallbackSource).toContain('via RPC')
    expect(microsoftCallbackSource).toContain('via RPC')
  })
})
