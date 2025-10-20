# Security Best Practices for Developers

## Overview

This document outlines security best practices for developers working on Briefly Cloud. Following these guidelines helps maintain the security posture of our application and protects user data.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Input Validation & Sanitization](#input-validation--sanitization)
3. [Database Security](#database-security)
4. [API Security](#api-security)
5. [File Upload Security](#file-upload-security)
6. [Environment & Configuration](#environment--configuration)
7. [Logging & Monitoring](#logging--monitoring)
8. [Code Review Guidelines](#code-review-guidelines)
9. [Testing Requirements](#testing-requirements)
10. [Incident Response](#incident-response)

## Authentication & Authorization

### ✅ Do's

- **Always validate authentication** on every API endpoint
- **Use Supabase Auth** for authentication - never implement custom auth
- **Implement proper session management** with secure cookies
- **Use Row Level Security (RLS)** for database access control
- **Validate user permissions** before performing operations
- **Log authentication events** for security monitoring

```typescript
// ✅ Good: Proper authentication check
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    // Proceed with authenticated user
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ✅ Good: RLS policy enforcement
const { data, error } = await supabase
  .from('app.files')
  .select('*')
  .eq('user_id', user.id); // RLS automatically enforces this
```

### ❌ Don'ts

- **Never skip authentication** checks in API routes
- **Don't implement custom JWT handling** - use Supabase Auth
- **Don't store sensitive data** in client-side storage
- **Don't use weak session management**

```typescript
// ❌ Bad: No authentication check
export async function GET(request: NextRequest) {
  // Missing authentication - anyone can access
  const data = await supabase.from('app.files').select('*');
  return NextResponse.json(data);
}

// ❌ Bad: Manual user filtering instead of RLS
const { data } = await supabase
  .from('app.files')
  .select('*'); // Returns all files, not user-specific
```

## Input Validation & Sanitization

### ✅ Do's

- **Validate all input** using Zod schemas
- **Sanitize user input** before processing
- **Use parameterized queries** for database operations
- **Validate file uploads** thoroughly
- **Implement rate limiting** on input endpoints

```typescript
// ✅ Good: Input validation with Zod
import { z } from 'zod';

const CreateFileSchema = z.object({
  name: z.string().min(1).max(255),
  content: z.string().max(10000),
  type: z.enum(['pdf', 'docx', 'txt'])
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  try {
    const validatedData = CreateFileSchema.parse(body);
    // Proceed with validated data
  } catch (error) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
}
```

### ❌ Don'ts

- **Don't trust user input** without validation
- **Don't use string concatenation** for SQL queries
- **Don't skip file type validation**

```typescript
// ❌ Bad: No input validation
export async function POST(request: NextRequest) {
  const { name, content } = await request.json();
  // No validation - could be malicious input
  await supabase.from('app.files').insert({ name, content });
}
```

## Database Security

### ✅ Do's

- **Use Row Level Security (RLS)** on all tenant tables
- **Create proper database functions** with SECURITY DEFINER
- **Implement audit logging** for sensitive operations
- **Use the service role key** only in server-side code
- **Validate data at the database level** with constraints

```sql
-- ✅ Good: RLS policy
CREATE POLICY "Users can only access own files" ON app.files
  FOR ALL USING (auth.uid() = user_id);

-- ✅ Good: Security definer function
CREATE OR REPLACE FUNCTION search_user_documents(query_text TEXT)
RETURNS TABLE (id UUID, title TEXT, content TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT f.id, f.title, f.content
  FROM app.files f
  WHERE f.user_id = auth.uid()
    AND f.content ILIKE '%' || query_text || '%';
END;
$;
```

### ❌ Don'ts

- **Don't disable RLS** on tenant tables
- **Don't use the service role key** in client-side code
- **Don't skip audit logging** for sensitive operations

## API Security

### ✅ Do's

- **Implement rate limiting** on all endpoints
- **Use HTTPS only** in production
- **Validate request headers** and content types
- **Implement proper error handling** without information leakage
- **Use security headers** in responses

```typescript
// ✅ Good: Rate limiting middleware
import { RateLimiter } from '@/lib/usage/rate-limiter';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  
  // Check rate limits
  const rateLimiter = new RateLimiter();
  const { allowed, retryAfter } = await rateLimiter.checkRateLimit(
    user.id, 
    'api_call'
  );
  
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { 
        status: 429,
        headers: { 'Retry-After': retryAfter.toString() }
      }
    );
  }
  
  // Proceed with request
}
```

### ❌ Don'ts

- **Don't expose internal errors** to clients
- **Don't skip rate limiting** on public endpoints
- **Don't use HTTP** in production

## File Upload Security

### ✅ Do's

- **Validate file types** and extensions
- **Scan for malware** before processing
- **Limit file sizes** appropriately
- **Use secure file storage** with proper access controls
- **Generate unique file names** to prevent conflicts

```typescript
// ✅ Good: File upload validation
const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }
  
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }
  
  // Additional security checks...
}
```

### ❌ Don'ts

- **Don't trust file extensions** alone
- **Don't skip malware scanning**
- **Don't allow unlimited file sizes**

## Environment & Configuration

### ✅ Do's

- **Use environment variables** for all secrets
- **Validate environment variables** at startup
- **Use different configurations** for different environments
- **Implement security headers** in production
- **Enable HTTPS** and security features

```typescript
// ✅ Good: Environment validation
import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test'])
});

export const env = EnvSchema.parse(process.env);
```

### ❌ Don'ts

- **Don't hardcode secrets** in source code
- **Don't commit .env files** to version control
- **Don't use weak secrets** or default values

## Logging & Monitoring

### ✅ Do's

- **Log security events** for monitoring
- **Use structured logging** with proper levels
- **Implement audit trails** for sensitive operations
- **Monitor for suspicious activity**
- **Set up alerting** for security events

```typescript
// ✅ Good: Security event logging
import { AuditLogger } from '@/lib/audit/audit-logger';

const auditLogger = new AuditLogger();

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  
  try {
    // Perform operation
    const result = await performSensitiveOperation();
    
    // Log successful operation
    await auditLogger.logAction(
      'sensitive_operation',
      'operation_type',
      result.id,
      user.id,
      null,
      result
    );
    
    return NextResponse.json(result);
  } catch (error) {
    // Log failed operation
    await auditLogger.logSecurityEvent(
      'operation_failed',
      user.id,
      { error: error.message }
    );
    
    throw error;
  }
}
```

### ❌ Don'ts

- **Don't log sensitive data** (passwords, tokens, etc.)
- **Don't ignore security events**
- **Don't use console.log** in production

## Code Review Guidelines

### Security Checklist for Code Reviews

#### Authentication & Authorization
- [ ] All API endpoints have authentication checks
- [ ] User permissions are validated before operations
- [ ] RLS policies are properly implemented
- [ ] No hardcoded credentials or secrets

#### Input Validation
- [ ] All user input is validated with Zod schemas
- [ ] File uploads are properly validated
- [ ] SQL injection prevention measures in place
- [ ] XSS prevention implemented

#### Error Handling
- [ ] Errors don't leak sensitive information
- [ ] Proper HTTP status codes used
- [ ] Security events are logged appropriately

#### Configuration
- [ ] Environment variables used for configuration
- [ ] Security headers implemented
- [ ] HTTPS enforced in production

### Review Process

1. **Automated Checks**: Security gates must pass before review
2. **Manual Review**: Focus on security implications
3. **Security Team Review**: Required for sensitive changes
4. **Testing**: Security tests must pass

## Testing Requirements

### Security Test Categories

1. **Authentication Tests**
   - Token validation
   - Session management
   - Authentication bypass prevention

2. **Authorization Tests**
   - RLS policy enforcement
   - Cross-user access prevention
   - Admin privilege validation

3. **Input Validation Tests**
   - SQL injection prevention
   - XSS prevention
   - File upload security

4. **Integration Tests**
   - End-to-end security workflows
   - API security validation

### Writing Security Tests

```typescript
// ✅ Good: Security test example
describe('File Access Security', () => {
  it('should prevent cross-user file access', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    
    // User1 creates a file
    const file = await createFile(user1.id, 'test.txt');
    
    // User2 tries to access user1's file
    const response = await request(app)
      .get(`/api/files/${file.id}`)
      .set('Authorization', `Bearer ${user2.token}`);
    
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Access denied');
  });
});
```

## Incident Response

### When Security Issues Are Found

1. **Immediate Actions**
   - Stop the deployment if in progress
   - Assess the severity and impact
   - Notify the security team immediately

2. **Investigation**
   - Gather logs and evidence
   - Determine root cause
   - Assess data exposure

3. **Remediation**
   - Fix the security issue
   - Deploy the fix
   - Verify the fix works

4. **Post-Incident**
   - Document lessons learned
   - Update security measures
   - Improve detection capabilities

### Reporting Security Issues

- **Internal Issues**: Create GitHub issue with `security-critical` label
- **External Reports**: Email security@rekonnlabs.com
- **Urgent Issues**: Contact security team directly

## Security Tools & Resources

### Required Tools

- **ESLint Security Plugin**: Automated security linting
- **Semgrep**: Static analysis for security vulnerabilities
- **npm audit**: Dependency vulnerability scanning
- **Supabase RLS**: Database-level security
- **Rate Limiting**: API protection

### Recommended Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)

### Training Resources

- Security awareness training (quarterly)
- Secure coding workshops
- Incident response drills
- Security tool training

## Compliance & Standards

### Data Protection
- GDPR compliance for EU users
- Data minimization principles
- User consent management
- Right to deletion implementation

### Security Standards
- SOC 2 Type II compliance
- ISO 27001 alignment
- NIST Cybersecurity Framework
- Industry best practices

## Contact Information

- **Security Team**: security@rekonnlabs.com
- **Security Incidents**: security-incidents@rekonnlabs.com
- **Security Questions**: #security-questions (Slack)

## Updates & Maintenance

This document is reviewed and updated quarterly. Last updated: [Current Date]

For the most current version, always refer to the version in the main branch of the repository.