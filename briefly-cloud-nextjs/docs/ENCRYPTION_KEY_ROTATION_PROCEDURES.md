# Encryption Key Rotation Procedures

## Overview

This document provides comprehensive procedures for rotating encryption keys in response to security incidents, scheduled maintenance, or compliance requirements. It covers emergency rotation, scheduled rotation, and key compromise scenarios.

## Key Management Architecture

### Key Types and Usage
- **Database Encryption Keys**: Used for encrypting OAuth tokens and sensitive data
- **JWT Signing Keys**: Used for NextAuth.js session tokens
- **API Keys**: Third-party service authentication (OpenAI, Stripe, etc.)
- **Webhook Secrets**: Used for validating incoming webhooks
- **Session Secrets**: Used for session encryption and CSRF protection

### Key Storage Locations
- **Supabase Vault**: Database encryption keys
- **Vercel Environment Variables**: API keys and secrets
- **Application Configuration**: Non-sensitive configuration keys
- **External Key Management**: Enterprise key management systems (if applicable)

## Rotation Scenarios

### 1. Emergency Key Rotation

#### When to Use
- Security breach detected
- Key compromise suspected
- Unauthorized access incidents
- Immediate security threat

#### Procedure

1. **Immediate Response (0-15 minutes)**
   ```bash
   # Activate emergency lockdown
   vercel env add EMERGENCY_LOCKDOWN true production
   vercel --prod
   
   # Revoke all active sessions
   node scripts/emergency-session-revocation.js
   
   # Generate new emergency keys
   node scripts/generate-emergency-keys.js --all-types
   ```

2. **Key Generation and Storage (15-30 minutes)**
   ```bash
   # Generate new database encryption keys
   node scripts/generate-db-encryption-keys.js --emergency
   
   # Generate new JWT signing keys
   node scripts/generate-jwt-keys.js --emergency
   
   # Generate new session secrets
   node scripts/generate-session-secrets.js --emergency
   
   # Store keys securely
   node scripts/store-emergency-keys.js --vault supabase
   ```

3. **Application Configuration Update (30-45 minutes)**
   ```bash
   # Update Vercel environment variables
   node scripts/update-vercel-env.js --key-set emergency
   
   # Update Supabase Vault keys
   node scripts/update-supabase-vault.js --key-set emergency
   
   # Verify key updates
   node scripts/verify-key-updates.js --emergency
   ```

4. **Data Re-encryption (45-120 minutes)**
   ```bash
   # Re-encrypt OAuth tokens
   node scripts/re-encrypt-oauth-tokens.js --new-key-set emergency
   
   # Re-encrypt sensitive user data
   node scripts/re-encrypt-user-data.js --new-key-set emergency
   
   # Verify re-encryption
   node scripts/verify-re-encryption.js --full-check
   ```

5. **Service Restoration (120-150 minutes)**
   ```bash
   # Deploy updated application
   vercel --prod
   
   # Disable emergency lockdown
   vercel env rm EMERGENCY_LOCKDOWN production
   vercel --prod
   
   # Verify service functionality
   npm run test:integration:security
   ```

### 2. Scheduled Key Rotation

#### When to Use
- Regular security maintenance (quarterly/annually)
- Compliance requirements
- Preventive security measures
- Key expiration approaching

#### Procedure

1. **Pre-Rotation Planning (1 week before)**
   ```bash
   # Schedule maintenance window
   node scripts/schedule-maintenance.js --type key-rotation --date "2024-04-15T02:00:00Z"
   
   # Notify stakeholders
   node scripts/notify-stakeholders.js --type scheduled-maintenance
   
   # Prepare rotation scripts
   node scripts/prepare-rotation-scripts.js --validate
   ```

2. **Backup Current Keys (1 day before)**
   ```bash
   # Export current keys for backup
   node scripts/backup-current-keys.js --secure-storage
   
   # Verify backup integrity
   node scripts/verify-key-backup.js --checksum
   
   # Test restoration procedures
   node scripts/test-key-restoration.js --dry-run
   ```

3. **Generate New Keys (Maintenance window)**
   ```bash
   # Generate new database encryption keys
   node scripts/generate-db-encryption-keys.js --scheduled
   
   # Generate new JWT signing keys with overlap period
   node scripts/generate-jwt-keys.js --scheduled --overlap-hours 24
   
   # Generate new API keys (coordinate with providers)
   node scripts/rotate-api-keys.js --providers openai,stripe
   ```

4. **Gradual Key Migration (Over 24-48 hours)**
   ```bash
   # Phase 1: Deploy new keys alongside old keys
   node scripts/deploy-dual-keys.js --phase 1
   
   # Phase 2: Start using new keys for new operations
   node scripts/activate-new-keys.js --phase 2
   
   # Phase 3: Re-encrypt existing data
   node scripts/re-encrypt-existing-data.js --batch-size 1000
   
   # Phase 4: Deactivate old keys
   node scripts/deactivate-old-keys.js --phase 4
   ```

5. **Post-Rotation Validation**
   ```bash
   # Verify all systems using new keys
   npm run test:integration:full
   
   # Check for any remaining old key usage
   node scripts/audit-key-usage.js --check-old-keys
   
   # Update documentation
   node scripts/update-key-documentation.js
   ```

### 3. Selective Key Rotation

#### When to Use
- Specific key compromise
- Third-party service key rotation
- Individual component security update
- Targeted security enhancement

#### Procedure

1. **Identify Affected Keys**
   ```bash
   # Analyze key usage scope
   node scripts/analyze-key-scope.js --key-type oauth-encryption
   
   # Identify affected data
   node scripts/identify-affected-data.js --key-id "key-12345"
   
   # Assess rotation impact
   node scripts/assess-rotation-impact.js --selective
   ```

2. **Generate Replacement Keys**
   ```bash
   # Generate specific key type
   node scripts/generate-specific-key.js --type oauth-encryption
   
   # Validate key strength
   node scripts/validate-key-strength.js --new-key
   
   # Store in appropriate location
   node scripts/store-key.js --location supabase-vault --key-type oauth-encryption
   ```

3. **Selective Data Re-encryption**
   ```bash
   # Re-encrypt only affected data
   node scripts/selective-re-encryption.js \
     --key-type oauth-encryption \
     --affected-tables "private.oauth_tokens" \
     --batch-size 500
   
   # Verify selective re-encryption
   node scripts/verify-selective-encryption.js --key-type oauth-encryption
   ```

## Key Rotation Scripts

### Emergency Key Generation Script
```javascript
// scripts/generate-emergency-keys.js
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

async function generateEmergencyKeys() {
  const keys = {
    database_encryption: crypto.randomBytes(32).toString('base64'),
    jwt_signing: crypto.randomBytes(64).toString('base64'),
    session_secret: crypto.randomBytes(32).toString('base64'),
    csrf_secret: crypto.randomBytes(32).toString('base64')
  };
  
  // Store in Supabase Vault
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  for (const [keyType, keyValue] of Object.entries(keys)) {
    const { error } = await supabase
      .from('private.encryption_keys')
      .insert({
        id: `emergency_${keyType}_${Date.now()}`,
        key_data: keyValue,
        algorithm: 'AES-GCM',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
      });
    
    if (error) {
      console.error(`Failed to store ${keyType}:`, error);
      throw error;
    }
  }
  
  console.log('Emergency keys generated and stored successfully');
  return keys;
}

module.exports = { generateEmergencyKeys };
```

### OAuth Token Re-encryption Script
```javascript
// scripts/re-encrypt-oauth-tokens.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

async function reEncryptOAuthTokens(newKeyId) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // Get new encryption key
  const { data: newKey, error: keyError } = await supabase
    .from('private.encryption_keys')
    .select('key_data')
    .eq('id', newKeyId)
    .single();
  
  if (keyError) throw keyError;
  
  // Get all OAuth tokens
  const { data: tokens, error: tokensError } = await supabase
    .from('private.oauth_tokens')
    .select('*');
  
  if (tokensError) throw tokensError;
  
  // Re-encrypt each token
  for (const token of tokens) {
    try {
      // Decrypt with old key (assuming we have access)
      const decryptedAccessToken = await decryptToken(token.encrypted_access_token, token.encryption_key_id);
      const decryptedRefreshToken = token.encrypted_refresh_token ? 
        await decryptToken(token.encrypted_refresh_token, token.encryption_key_id) : null;
      
      // Encrypt with new key
      const newEncryptedAccessToken = await encryptToken(decryptedAccessToken, newKey.key_data);
      const newEncryptedRefreshToken = decryptedRefreshToken ? 
        await encryptToken(decryptedRefreshToken, newKey.key_data) : null;
      
      // Update database
      const { error: updateError } = await supabase
        .from('private.oauth_tokens')
        .update({
          encrypted_access_token: newEncryptedAccessToken,
          encrypted_refresh_token: newEncryptedRefreshToken,
          encryption_key_id: newKeyId,
          updated_at: new Date().toISOString()
        })
        .eq('id', token.id);
      
      if (updateError) throw updateError;
      
      console.log(`Re-encrypted token for user ${token.user_id}`);
    } catch (error) {
      console.error(`Failed to re-encrypt token ${token.id}:`, error);
      // Continue with other tokens
    }
  }
  
  console.log('OAuth token re-encryption completed');
}

async function encryptToken(plaintext, key) {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, Buffer.from(key, 'base64'));
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  });
}

async function decryptToken(encryptedData, keyId) {
  // Implementation depends on how tokens were originally encrypted
  // This is a simplified version
  const data = JSON.parse(encryptedData);
  // ... decryption logic
  return decryptedText;
}

module.exports = { reEncryptOAuthTokens };
```

### Key Validation Script
```javascript
// scripts/validate-key-rotation.js
const { createClient } = require('@supabase/supabase-js');

async function validateKeyRotation() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const validationResults = {
    database_keys: await validateDatabaseKeys(supabase),
    oauth_tokens: await validateOAuthTokens(supabase),
    jwt_functionality: await validateJWTFunctionality(),
    session_security: await validateSessionSecurity()
  };
  
  const allValid = Object.values(validationResults).every(result => result.valid);
  
  if (allValid) {
    console.log('✅ Key rotation validation successful');
  } else {
    console.error('❌ Key rotation validation failed');
    console.error('Failed validations:', 
      Object.entries(validationResults)
        .filter(([_, result]) => !result.valid)
        .map(([name, result]) => ({ name, error: result.error }))
    );
  }
  
  return validationResults;
}

async function validateDatabaseKeys(supabase) {
  try {
    // Check if new keys are properly stored
    const { data: keys, error } = await supabase
      .from('private.encryption_keys')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    return {
      valid: keys.length > 0,
      keyCount: keys.length,
      latestKey: keys[0]?.created_at
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function validateOAuthTokens(supabase) {
  try {
    // Test decryption of a sample OAuth token
    const { data: tokens, error } = await supabase
      .from('private.oauth_tokens')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    
    if (tokens.length === 0) {
      return { valid: true, message: 'No OAuth tokens to validate' };
    }
    
    // Try to decrypt the token (simplified check)
    const token = tokens[0];
    const canDecrypt = await testTokenDecryption(token);
    
    return { valid: canDecrypt };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

module.exports = { validateKeyRotation };
```

## Security Considerations

### Access Control During Rotation
- Limit key access to authorized personnel only
- Use multi-person authorization for critical key operations
- Log all key access and rotation activities
- Implement break-glass procedures for emergency access

### Key Lifecycle Management
```bash
# Key generation with proper entropy
node scripts/generate-keys.js --entropy-source /dev/urandom --key-length 256

# Key storage with encryption at rest
node scripts/store-keys.js --encrypt-at-rest --access-control strict

# Key rotation scheduling
node scripts/schedule-rotation.js --interval quarterly --auto-approve false

# Key destruction verification
node scripts/verify-key-destruction.js --secure-delete --verify-overwrite
```

### Audit and Compliance

#### Key Rotation Audit Trail
```javascript
// scripts/audit-key-rotation.js
async function auditKeyRotation(rotationId) {
  const auditEvents = [
    'key_generation_initiated',
    'old_key_backup_created',
    'new_key_stored',
    'data_re_encryption_started',
    'data_re_encryption_completed',
    'old_key_deactivated',
    'rotation_validated',
    'rotation_completed'
  ];
  
  const auditResults = {};
  
  for (const event of auditEvents) {
    const { data, error } = await supabase
      .from('private.audit_logs')
      .select('*')
      .eq('action', event)
      .eq('resource_id', rotationId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    auditResults[event] = {
      found: data && data.length > 0,
      timestamp: data?.[0]?.created_at,
      details: data?.[0]?.new_values
    };
  }
  
  return auditResults;
}
```

## Monitoring and Alerting

### Key Rotation Monitoring
```javascript
// scripts/monitor-key-rotation.js
async function monitorKeyRotation() {
  // Check for keys approaching expiration
  const expiringKeys = await checkExpiringKeys();
  
  // Monitor rotation job progress
  const rotationProgress = await checkRotationProgress();
  
  // Verify key usage patterns
  const keyUsageAnomalies = await detectKeyUsageAnomalies();
  
  // Send alerts if needed
  if (expiringKeys.length > 0) {
    await sendAlert('keys_expiring_soon', { keys: expiringKeys });
  }
  
  if (rotationProgress.failed > 0) {
    await sendAlert('rotation_failures', { failures: rotationProgress.failed });
  }
  
  return {
    expiringKeys,
    rotationProgress,
    keyUsageAnomalies
  };
}
```

### Performance Impact Monitoring
```bash
# Monitor encryption/decryption performance
node scripts/monitor-crypto-performance.js --duration 3600

# Check for rotation-related slowdowns
node scripts/check-rotation-impact.js --baseline-period "24h"

# Validate system performance post-rotation
npm run test:performance:post-rotation
```

## Recovery Procedures

### Failed Key Rotation Recovery
```bash
# Rollback to previous keys
node scripts/rollback-key-rotation.js --rotation-id "rot-20240115-001"

# Restore from key backup
node scripts/restore-keys-from-backup.js --backup-id "backup-20240115-001"

# Verify rollback success
node scripts/verify-key-rollback.js --full-validation
```

### Key Compromise Recovery
```bash
# Immediate key invalidation
node scripts/invalidate-compromised-keys.js --key-ids "key1,key2,key3"

# Emergency re-encryption
node scripts/emergency-re-encryption.js --all-data

# Forensic key analysis
node scripts/analyze-key-compromise.js --compromised-keys "key1,key2,key3"
```

This comprehensive encryption key rotation procedure ensures secure key management throughout the application lifecycle while maintaining system availability and data integrity.