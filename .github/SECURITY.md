# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Briefly Cloud, please report it responsibly:

1. **Do not** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: [security@briefly.cloud](mailto:security@briefly.cloud)
3. Include detailed information about the vulnerability
4. Allow up to 48 hours for initial response
5. Allow up to 7 days for vulnerability assessment and fix

## Security Measures

### Automated Security Testing

Our CI/CD pipeline includes:

- **Bandit**: Python security linter for common security issues
- **Safety**: Python dependency vulnerability scanner
- **npm audit**: Node.js dependency vulnerability scanner
- **Semgrep**: Static analysis for security patterns
- **Custom Security Tests**: Authentication, authorization, and data isolation tests

### Security Features

- **Authentication**: Supabase OAuth 2.0 with JWT tokens
- **Authorization**: Role-based access control with user isolation
- **Data Protection**: User-specific ChromaDB collections
- **Rate Limiting**: Per-user request limiting
- **Usage Tracking**: Comprehensive audit logging
- **Environment Security**: Production configuration hardening

### Security Regression Testing

All code changes are automatically tested for:

1. Authentication bypass prevention
2. User data isolation
3. Usage limit enforcement
4. Rate limiting functionality
5. Audit logging completeness
6. Production configuration security

### Dependency Management

- Automated dependency updates via Dependabot
- Regular security scanning of all dependencies
- Immediate patching of critical vulnerabilities

## Security Incident Response

In case of a security incident:

1. Immediate assessment and containment
2. User notification within 24 hours if data is affected
3. Root cause analysis and remediation
4. Post-incident review and process improvement

## Contact

For security-related questions or concerns:
- Email: security@briefly.cloud
- Response time: 48 hours maximum
- Severity assessment: 24 hours for critical issues