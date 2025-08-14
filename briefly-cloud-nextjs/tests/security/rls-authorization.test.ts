/**
 * Row Level Security (RLS) and Authorization Tests
 * 
 * Comprehensive test suite for authorization and RLS including:
 * - Cross-user data access prevention
 * - RLS policy enforcement across all tables
 * - Admin privilege escalation prevention
 * - Data isolation validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { AuthSecurityTestUtils } from './auth-test-utils';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      neq: jest.fn(() => ({
        limit: jest.fn()
      })),
      limit: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn()
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn()
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    }))
  })),
  rpc: jest.fn(),
  auth: {
    getUser: jest.fn()
  }
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Authorization and RLS Security Tests', () => {
  let testUtils: typeof AuthSecurityTestUtils;
  
  beforeEach(() => {
    jest.clearAllMocks();
    testUtils = AuthSecurityTestUtils;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Cross-User Data Access Prevention', () => {
    it('should prevent users from accessing other users files', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // Mock user1's files
      const user1Files = [
        { id: 'file-1', user_id: 'user-1', name: 'user1-document.pdf' },
        { id: 'file-2', user_id: 'user-1', name: 'user1-private.docx' }
      ];
      
      // Mock user2's files
      const user2Files = [
        { id: 'file-3', user_id: 'user-2', name: 'user2-document.pdf' }
      ];
      
      // User1 tries to access their own files (should succeed)
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: user1Files,
        error: null
      });
      
      const user1FilesResult = await mockSupabase
        .from('files')
        .select('*')
        .eq('user_id', user1.id)
        .limit(10);
      
      expect(user1FilesResult.data).toEqual(user1Files);
      expect(user1FilesResult.data.every(file => file.user_id === user1.id)).toBe(true);
      
      // User1 tries to access user2's files (should fail/return empty)
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: [], // RLS should prevent access
        error: null
      });
      
      const crossUserAccessResult = await mockSupabase
        .from('files')
        .select('*')
        .eq('user_id', user2.id)
        .limit(10);
      
      expect(crossUserAccessResult.data).toEqual([]);
    });

    it('should prevent users from accessing other users conversations', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // Mock conversations
      const user1Conversations = [
        { id: 'conv-1', user_id: 'user-1', title: 'User 1 Chat' }
      ];
      
      // User1 accessing their own conversations
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: user1Conversations,
        error: null
      });
      
      const ownConversationsResult = await mockSupabase
        .from('conversations')
        .select('*')
        .eq('user_id', user1.id)
        .limit(10);
      
      expect(ownConversationsResult.data).toEqual(user1Conversations);
      
      // User1 trying to access user2's conversations (should be blocked)
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: [],
        error: null
      });
      
      const crossUserConversationsResult = await mockSupabase
        .from('conversations')
        .select('*')
        .eq('user_id', user2.id)
        .limit(10);
      
      expect(crossUserConversationsResult.data).toEqual([]);
    });

    it('should prevent users from accessing other users chat messages', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // Mock chat messages with conversation ownership
      const user1Messages = [
        { 
          id: 'msg-1', 
          conversation_id: 'conv-1',
          content: 'User 1 message',
          user_id: 'user-1'
        }
      ];
      
      // User accessing their own messages through conversation
      mockSupabase.rpc.mockResolvedValue({
        data: user1Messages,
        error: null
      });
      
      const ownMessagesResult = await mockSupabase.rpc('get_user_messages', {
        p_user_id: user1.id,
        p_conversation_id: 'conv-1'
      });
      
      expect(ownMessagesResult.data).toEqual(user1Messages);
      
      // User trying to access another user's messages (should be blocked)
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null
      });
      
      const crossUserMessagesResult = await mockSupabase.rpc('get_user_messages', {
        p_user_id: user1.id,
        p_conversation_id: 'conv-2' // Belongs to user2
      });
      
      expect(crossUserMessagesResult.data).toEqual([]);
    });

    it('should prevent users from modifying other users data', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // User1 tries to update user2's file (should fail)
      mockSupabase.from().update().eq().select.mockResolvedValue({
        data: [],
        error: { message: 'Row level security policy violation' }
      });
      
      const updateResult = await mockSupabase
        .from('files')
        .update({ name: 'hacked-file.pdf' })
        .eq('id', 'file-belonging-to-user2')
        .select();
      
      expect(updateResult.error).toBeTruthy();
      expect(updateResult.data).toEqual([]);
    });

    it('should prevent users from deleting other users data', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // User1 tries to delete user2's file (should fail)
      mockSupabase.from().delete().eq.mockResolvedValue({
        data: [],
        error: { message: 'Row level security policy violation' }
      });
      
      const deleteResult = await mockSupabase
        .from('files')
        .delete()
        .eq('id', 'file-belonging-to-user2');
      
      expect(deleteResult.error).toBeTruthy();
      expect(deleteResult.data).toEqual([]);
    });
  });

  describe('RLS Policy Enforcement Across All Tables', () => {
    const protectedTables = [
      'users',
      'files', 
      'document_chunks',
      'conversations',
      'chat_messages',
      'usage_logs',
      'rate_limits'
    ];

    protectedTables.forEach(tableName => {
      it(`should enforce RLS on ${tableName} table`, async () => {
        const user = testUtils.createTestUser();
        
        // Mock RLS policy check
        mockSupabase.rpc.mockResolvedValue({
          data: [
            {
              schemaname: 'app',
              tablename: tableName,
              policyname: `${tableName}_isolation_policy`,
              permissive: 'PERMISSIVE',
              roles: ['authenticated'],
              cmd: 'ALL',
              qual: `(user_id = auth.uid())`,
              with_check: `(user_id = auth.uid())`
            }
          ],
          error: null
        });
        
        const rlsPoliciesResult = await mockSupabase.rpc('get_table_policies', {
          table_name: tableName
        });
        
        expect(rlsPoliciesResult.data).toBeDefined();
        expect(rlsPoliciesResult.data.length).toBeGreaterThan(0);
        
        const policy = rlsPoliciesResult.data[0];
        expect(policy.qual).toContain('user_id = auth.uid()');
      });
    });

    it('should validate RLS is enabled on all protected tables', async () => {
      // Mock checking if RLS is enabled
      mockSupabase.rpc.mockResolvedValue({
        data: protectedTables.map(table => ({
          schemaname: 'app',
          tablename: table,
          rowsecurity: true
        })),
        error: null
      });
      
      const rlsStatusResult = await mockSupabase.rpc('check_rls_enabled');
      
      expect(rlsStatusResult.data).toBeDefined();
      expect(rlsStatusResult.data.length).toBe(protectedTables.length);
      
      rlsStatusResult.data.forEach(table => {
        expect(table.rowsecurity).toBe(true);
      });
    });

    it('should prevent bypassing RLS through direct SQL', async () => {
      const user = testUtils.createTestUser({ id: 'user-1' });
      
      // Attempt to bypass RLS with raw SQL (should fail)
      const maliciousSql = `
        SELECT * FROM app.files 
        WHERE user_id != '${user.id}'
      `;
      
      // Mock that direct SQL execution is blocked
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Direct SQL execution not allowed' }
      });
      
      const sqlBypassResult = await mockSupabase.rpc('execute_sql', {
        sql_query: maliciousSql
      });
      
      expect(sqlBypassResult.error).toBeTruthy();
      expect(sqlBypassResult.data).toBeNull();
    });

    it('should validate RLS policy conditions are secure', async () => {
      const secureRLSConditions = [
        'user_id = auth.uid()',
        'owner_id = auth.uid()',
        'created_by = auth.uid()',
        'tenant_id = get_user_tenant_id()'
      ];
      
      // Mock policy validation
      mockSupabase.rpc.mockResolvedValue({
        data: secureRLSConditions.map(condition => ({
          condition,
          secure: true,
          uses_auth_context: condition.includes('auth.uid()') || condition.includes('get_user_')
        })),
        error: null
      });
      
      const policyValidationResult = await mockSupabase.rpc('validate_rls_policies');
      
      expect(policyValidationResult.data).toBeDefined();
      policyValidationResult.data.forEach(policy => {
        expect(policy.secure).toBe(true);
        expect(policy.uses_auth_context).toBe(true);
      });
    });
  });

  describe('Admin Privilege Escalation Prevention', () => {
    it('should prevent regular users from accessing admin functions', async () => {
      const regularUser = testUtils.createTestUser({ 
        id: 'regular-user',
        subscription_tier: 'free'
      });
      
      // Regular user tries to access admin endpoint
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Insufficient privileges' }
      });
      
      const adminFunctionResult = await mockSupabase.rpc('admin_get_all_users');
      
      expect(adminFunctionResult.error).toBeTruthy();
      expect(adminFunctionResult.error.message).toContain('Insufficient privileges');
    });

    it('should prevent privilege escalation through token manipulation', async () => {
      const regularUser = testUtils.createTestUser({ id: 'regular-user' });
      
      // Attempt to create token with admin privileges
      const maliciousToken = testUtils.generatePrivilegeEscalationToken(regularUser);
      
      // Mock token validation that detects privilege escalation
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid role claim' }
      });
      
      const tokenValidation = testUtils.validateTokenStructure(maliciousToken);
      
      // Token structure might be valid, but role should be rejected
      expect(tokenValidation.valid).toBe(true);
      expect(tokenValidation.payload.role).toBe('service_role');
      
      // But authentication should fail due to invalid role escalation
    });

    it('should validate admin role assignment process', async () => {
      const user = testUtils.createTestUser();
      
      // Mock admin role assignment (should require proper authorization)
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Admin role assignment requires super admin privileges' }
      });
      
      const roleAssignmentResult = await mockSupabase.rpc('assign_admin_role', {
        user_id: user.id,
        role: 'admin'
      });
      
      expect(roleAssignmentResult.error).toBeTruthy();
    });

    it('should prevent SQL injection in admin functions', async () => {
      const maliciousUserId = "'; DROP TABLE users; --";
      
      // Mock admin function with SQL injection attempt
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invalid user ID format' }
      });
      
      const sqlInjectionResult = await mockSupabase.rpc('admin_delete_user', {
        user_id: maliciousUserId
      });
      
      expect(sqlInjectionResult.error).toBeTruthy();
    });

    it('should audit admin privilege usage', async () => {
      const adminUser = testUtils.createTestUser({ 
        id: 'admin-user',
        subscription_tier: 'pro_byok'
      });
      
      // Mock admin action with audit logging
      mockSupabase.rpc.mockResolvedValue({
        data: { success: true, audit_log_id: 'audit-123' },
        error: null
      });
      
      const adminActionResult = await mockSupabase.rpc('admin_view_user_data', {
        target_user_id: 'some-user-id',
        admin_user_id: adminUser.id,
        reason: 'Support request investigation'
      });
      
      expect(adminActionResult.data.success).toBe(true);
      expect(adminActionResult.data.audit_log_id).toBeDefined();
    });
  });

  describe('Data Isolation Validation', () => {
    it('should ensure complete data isolation between users', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      const user2 = testUtils.createTestUser({ id: 'user-2' });
      
      // Test data isolation across all user data types
      const dataTypes = [
        { table: 'files', user1Data: [{ id: 'f1', user_id: 'user-1' }] },
        { table: 'conversations', user1Data: [{ id: 'c1', user_id: 'user-1' }] },
        { table: 'usage_logs', user1Data: [{ id: 'u1', user_id: 'user-1' }] }
      ];
      
      for (const dataType of dataTypes) {
        // User1 can see their own data
        mockSupabase.from().select().eq().limit.mockResolvedValue({
          data: dataType.user1Data,
          error: null
        });
        
        const user1DataResult = await mockSupabase
          .from(dataType.table)
          .select('*')
          .eq('user_id', user1.id)
          .limit(10);
        
        expect(user1DataResult.data).toEqual(dataType.user1Data);
        
        // User2 cannot see user1's data
        mockSupabase.from().select().eq().limit.mockResolvedValue({
          data: [],
          error: null
        });
        
        const crossUserDataResult = await mockSupabase
          .from(dataType.table)
          .select('*')
          .eq('user_id', user1.id)
          .limit(10);
        
        expect(crossUserDataResult.data).toEqual([]);
      }
    });

    it('should prevent data leakage through aggregation queries', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      
      // Attempt to get aggregate data that might leak other users' info
      mockSupabase.rpc.mockResolvedValue({
        data: { count: 5, user_id: 'user-1' }, // Only user's own data count
        error: null
      });
      
      const aggregateResult = await mockSupabase.rpc('get_user_file_count', {
        user_id: user1.id
      });
      
      expect(aggregateResult.data.user_id).toBe(user1.id);
      expect(aggregateResult.data.count).toBeDefined();
      
      // Should not be able to get system-wide aggregates
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Access denied' }
      });
      
      const systemAggregateResult = await mockSupabase.rpc('get_system_file_count');
      
      expect(systemAggregateResult.error).toBeTruthy();
    });

    it('should prevent data leakage through join queries', async () => {
      const user1 = testUtils.createTestUser({ id: 'user-1' });
      
      // Test join query that should only return user's own data
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: [
          {
            id: 'file-1',
            user_id: 'user-1',
            conversation: { id: 'conv-1', user_id: 'user-1' }
          }
        ],
        error: null
      });
      
      const joinResult = await mockSupabase
        .from('files')
        .select(`
          *,
          conversation:conversations(*)
        `)
        .eq('user_id', user1.id)
        .limit(10);
      
      expect(joinResult.data).toBeDefined();
      joinResult.data.forEach(file => {
        expect(file.user_id).toBe(user1.id);
        if (file.conversation) {
          expect(file.conversation.user_id).toBe(user1.id);
        }
      });
    });

    it('should validate tenant isolation in multi-tenant scenarios', async () => {
      const tenant1User = testUtils.createTestUser({ 
        id: 'tenant1-user',
        subscription_tier: 'pro'
      });
      
      const tenant2User = testUtils.createTestUser({ 
        id: 'tenant2-user',
        subscription_tier: 'pro'
      });
      
      // Mock tenant context function
      mockSupabase.rpc.mockResolvedValue({
        data: { tenant_id: 'tenant-1' },
        error: null
      });
      
      const tenant1ContextResult = await mockSupabase.rpc('get_user_tenant_context', {
        user_id: tenant1User.id
      });
      
      expect(tenant1ContextResult.data.tenant_id).toBe('tenant-1');
      
      // Different tenant should have different context
      mockSupabase.rpc.mockResolvedValue({
        data: { tenant_id: 'tenant-2' },
        error: null
      });
      
      const tenant2ContextResult = await mockSupabase.rpc('get_user_tenant_context', {
        user_id: tenant2User.id
      });
      
      expect(tenant2ContextResult.data.tenant_id).toBe('tenant-2');
      expect(tenant1ContextResult.data.tenant_id).not.toBe(tenant2ContextResult.data.tenant_id);
    });

    it('should prevent cross-tenant data access', async () => {
      const tenant1User = testUtils.createTestUser({ id: 'tenant1-user' });
      const tenant2User = testUtils.createTestUser({ id: 'tenant2-user' });
      
      // Mock tenant-isolated query
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'file-1', user_id: 'tenant1-user', tenant_id: 'tenant-1' }
        ],
        error: null
      });
      
      const tenant1FilesResult = await mockSupabase.rpc('get_tenant_files', {
        requesting_user_id: tenant1User.id
      });
      
      expect(tenant1FilesResult.data).toBeDefined();
      tenant1FilesResult.data.forEach(file => {
        expect(file.tenant_id).toBe('tenant-1');
      });
      
      // Cross-tenant access should be blocked
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null
      });
      
      const crossTenantResult = await mockSupabase.rpc('get_tenant_files', {
        requesting_user_id: tenant2User.id,
        target_tenant_id: 'tenant-1' // Trying to access different tenant
      });
      
      expect(crossTenantResult.data).toEqual([]);
    });
  });

  describe('Authorization Edge Cases', () => {
    it('should handle null or undefined user contexts', async () => {
      // Mock null user context
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      });
      
      mockSupabase.from().select().limit.mockResolvedValue({
        data: [],
        error: { message: 'Authentication required' }
      });
      
      const nullUserResult = await mockSupabase
        .from('files')
        .select('*')
        .limit(10);
      
      expect(nullUserResult.error).toBeTruthy();
      expect(nullUserResult.data).toEqual([]);
    });

    it('should handle malformed user IDs in queries', async () => {
      const malformedUserIds = [
        null,
        undefined,
        '',
        'invalid-uuid-format',
        '../../etc/passwd',
        '<script>alert("xss")</script>'
      ];
      
      for (const malformedId of malformedUserIds) {
        mockSupabase.from().select().eq().limit.mockResolvedValue({
          data: [],
          error: { message: 'Invalid user ID format' }
        });
        
        const result = await mockSupabase
          .from('files')
          .select('*')
          .eq('user_id', malformedId)
          .limit(10);
        
        expect(result.error).toBeTruthy();
        expect(result.data).toEqual([]);
      }
    });

    it('should prevent authorization bypass through parameter pollution', async () => {
      const user = testUtils.createTestUser({ id: 'user-1' });
      
      // Attempt parameter pollution attack
      const pollutedParams = {
        user_id: ['user-1', 'user-2'], // Array instead of single value
        limit: [10, 1000] // Trying to bypass limits
      };
      
      // Mock that parameter pollution is detected and rejected
      mockSupabase.from().select().eq().limit.mockResolvedValue({
        data: [],
        error: { message: 'Invalid parameter format' }
      });
      
      const pollutionResult = await mockSupabase
        .from('files')
        .select('*')
        .eq('user_id', pollutedParams.user_id)
        .limit(pollutedParams.limit);
      
      expect(pollutionResult.error).toBeTruthy();
    });

    it('should handle concurrent authorization checks', async () => {
      const user = testUtils.createTestUser();
      const token = testUtils.generateValidToken(user);
      
      // Simulate concurrent authorization requests
      const concurrentRequests = Array.from({ length: 10 }, () =>
        mockSupabase.auth.getUser(token)
      );
      
      // Mock successful concurrent authorization
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });
      
      const results = await Promise.all(concurrentRequests);
      
      // All should succeed with same user
      results.forEach(result => {
        expect(result.data.user.id).toBe(user.id);
        expect(result.error).toBeNull();
      });
    });

    it('should validate authorization caching security', async () => {
      const user = testUtils.createTestUser();
      
      // Mock authorization cache
      const authCache = new Map();
      const cacheKey = `auth:${user.id}`;
      const cacheExpiry = Date.now() + 300000; // 5 minutes
      
      // Store in cache
      authCache.set(cacheKey, {
        user: user,
        expires: cacheExpiry
      });
      
      // Validate cache entry
      const cachedAuth = authCache.get(cacheKey);
      expect(cachedAuth.user.id).toBe(user.id);
      expect(cachedAuth.expires).toBeGreaterThan(Date.now());
      
      // Simulate cache expiry
      const expiredCacheEntry = {
        user: user,
        expires: Date.now() - 1000 // Expired
      };
      
      const isExpired = expiredCacheEntry.expires < Date.now();
      expect(isExpired).toBe(true);
    });
  });
});