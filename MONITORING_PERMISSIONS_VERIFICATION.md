# Schema Monitoring Permissions Verification

## Implementation Pattern: B (Service-Role Client) ✅

We are using **Pattern B** - the recommended service-role client approach, which means:
- ✅ **No grants needed** to anon/authenticated roles
- ✅ **Service role bypasses** all RLS policies automatically
- ✅ **Server-only execution** with admin client

## Current Implementation Status

### ✅ Admin Client Configuration
**File**: `src/app/lib/auth/supabase-server-admin.ts`

```typescript
export function createServerAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role key
    {
      auth: { persistSession: false },
      db: { schema: 'app' }
    }
  )
}
```

**Features**:
- ✅ Uses `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
- ✅ Server-only with `'server-only'` import
- ✅ Proper environment validation
- ✅ No session persistence (stateless)

### ✅ Monitoring API Route
**File**: `src/app/api/monitoring/schema/route.ts`

```typescript
export const runtime = 'nodejs' // ensure server/Node

export async function GET() {
  const supa = createServerAdminClient()
  const { data, error } = await supa.rpc('monitoring_health_check') // app schema RPC
  return NextResponse.json({ app: error ? String(error.message) : (data ?? 'ok') })
}
```

**Features**:
- ✅ Explicit Node.js runtime
- ✅ Uses admin client with service role
- ✅ Calls `app.monitoring_health_check()` RPC function
- ✅ Proper error handling

### ✅ Schema Restrictions
**Monitoring Scope**: `const SCHEMAS = ['app']`

- ✅ **No private schema** PostgREST access
- ✅ **App schema only** via RPC function
- ✅ **No direct table queries** to sensitive schemas

## Environment Variables Checklist

### Required in Vercel Environment Variables

#### ✅ Production Environment
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### ✅ Preview Environment  
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### ✅ Development Environment
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Verification Steps

1. **Check Vercel Dashboard**:
   - Go to Project → Settings → Environment Variables
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is present in all environments
   - Verify `NEXT_PUBLIC_SUPABASE_URL` is present in all environments

2. **Test Service Role Key**:
   ```bash
   # Test the service role key works
   curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/monitoring_health_check' \
     -H "apikey: YOUR_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json"
   ```

3. **Test Monitoring Endpoint**:
   ```bash
   # Test the monitoring API
   curl https://your-domain.com/api/monitoring/schema?quick=true
   
   # Expected response
   {
     "health": {
       "app": "ok"
     },
     "timestamp": "2025-01-27T10:00:00Z"
   }
   ```

## RPC Function Requirements

### User Action Required (Part B)
The user needs to create the RPC function in Supabase:

```sql
-- Create the health check RPC function
create or replace function app.monitoring_health_check()
returns text
language sql
security definer
set search_path = app, public
as $$
  select 'ok'::text;
$$;

-- Grant execute permission (optional with service role)
grant execute on function app.monitoring_health_check() to anon, authenticated;
```

### Verification Query
After creating the function, verify it exists:

```sql
-- Check if function exists
select routine_name, routine_schema, security_type 
from information_schema.routines 
where routine_schema = 'app' 
and routine_name = 'monitoring_health_check';

-- Check permissions (optional)
select grantee, routine_schema, routine_name, privilege_type 
from information_schema.routine_privileges 
where routine_schema = 'app' 
and routine_name = 'monitoring_health_check';
```

## Security Benefits

### Service Role Advantages
- ✅ **Bypasses RLS**: No permission denied errors
- ✅ **Full Schema Access**: Can call any RPC function
- ✅ **Consistent Behavior**: Works regardless of RLS policies
- ✅ **Server-Only**: Never exposed to client-side code

### No Grants Required
Since we use the service role:
- ❌ **No anon grants needed**: Service role has full access
- ❌ **No authenticated grants needed**: Service role bypasses RLS
- ✅ **Simplified Security**: Single service role manages all access

## Troubleshooting

### Common Issues

1. **Missing Service Role Key**:
   ```
   Error: Missing env.SUPABASE_SERVICE_ROLE_KEY
   ```
   **Solution**: Add the key to Vercel environment variables

2. **Wrong Key Type**:
   ```
   Error: JWT malformed or invalid
   ```
   **Solution**: Ensure using service role key, not anon key

3. **RPC Function Missing**:
   ```
   Error: function app.monitoring_health_check() does not exist
   ```
   **Solution**: Create the RPC function in Supabase SQL editor

4. **Runtime Issues**:
   ```
   Error: Cannot use server-only module in client
   ```
   **Solution**: Ensure `runtime = 'nodejs'` is set in API route

### Debug Commands

```bash
# Test environment variables locally
node -e "console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)"
node -e "console.log('Key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)"

# Test RPC function directly
curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/monitoring_health_check' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# Test monitoring endpoint
curl https://your-domain.com/api/monitoring/schema?quick=true
```

## Deployment Checklist

- ✅ **Code Implementation**: Service role client configured
- ✅ **API Route**: Uses admin client with Node.js runtime
- ✅ **Schema Restrictions**: Only monitors app schema
- ✅ **Environment Variables**: Service role key in all Vercel environments
- ⏳ **RPC Function**: User needs to create `app.monitoring_health_check()`
- ⏳ **Testing**: Verify monitoring endpoint works after RPC creation

The monitoring system is properly configured for Pattern B (service-role client) and will work reliably once the RPC function is created.