# Legacy Authentication Files

⚠️ **WARNING: DO NOT USE THESE FILES** ⚠️

This directory contains deprecated authentication configuration files that have been moved here to prevent accidental imports. These files contain dangerous configurations that can cause security vulnerabilities.

## Files in this directory:

### `cookie-config.ts`
- **Status**: DEPRECATED - DO NOT USE
- **Reason**: Contains dangerous cookie configurations with security vulnerabilities
- **Issues**: 
  - `httpOnly: false` allows client-side access to auth cookies
  - Manual cookie handling bypasses Supabase SSR security
  - Custom domain configurations may not work across environments
- **Replacement**: Use Supabase SSR's built-in secure cookie handling in middleware.ts

## What to use instead:

1. **For middleware**: Use `createServerClient()` with proper cookie adapter
2. **For server components**: Use `createServerClientReadOnly()` 
3. **For client components**: Use `createBrowserClient()` from Supabase SSR
4. **For route handlers**: Use `getSupabaseServerMutable()` with cookie adapter

## Security Guidelines:

- Never import files from this legacy directory
- Always use Supabase SSR's secure defaults
- Let Supabase handle cookie configuration automatically
- Use the authentication patterns documented in the steering files

## If you need to reference these files:

These files are kept for reference and testing purposes only. The test suite verifies that they are not imported by active code. If you need to understand why certain patterns were deprecated, you can read the files but never import them.

## Migration completed:

All authentication code has been migrated to use secure Supabase SSR patterns. The authentication system now uses:

- Triple-layer defense architecture
- No RSC cookie writes
- Proper open redirect protection
- Secure cookie propagation
- Enterprise-grade security patterns

For more information, see the authentication security documentation in `.kiro/steering/authentication-security.md`.
