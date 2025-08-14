/**
 * Row Level Security (RLS) Test Utilities
 * 
 * Helper functions and utilities for testing RLS policies and authorization
 */

import { createClient } from '@supabase/supabase-js';

export interface RLSPolicy {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: 'PERMISSIVE' | 'RESTRICTIVE';
  roles: string[];
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  qual: string;
  with_check: string;
}

export interface TableInfo {
  schemaname: string;
  tablename: string;
  rowsecurity: boolean;
  owner: string;
}

export interface AuthorizationTestCase {
  name: string;
  userId: string;
  targetUserId?: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  expectedResult: 'allow' | 'deny';
  data?: any;
}

export class RLSTestUtils {
  private static readonly PROTECTED_TABLES = [
    'app.users',
    'app.files',
    'app.document_chunks',
    'app.conversations',
    'app.chat_messages',
    'app.usage_logs',
    'app.rate_limits',
    'private.oauth_tokens',
    'private.audit_logs',
    'private.encryption_keys'
  ];

  /**
   * Get all RLS policies for a specific table
   */
  static async getRLSPolicies(supabase: any, tableName: string): Promise<RLSPolicy[]> {
    const { data, error } = await supabase.rpc('get_table_policies', {
      table_name: tableName
    });

    if (error) {
      throw new Error(`Failed to get RLS policies for ${tableName}: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Check if RLS is enabled on a table
   */
  static async isRLSEnabled(supabase: any, tableName: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('check_table_rls', {
      table_name: tableName
    });

    if (error) {
      throw new Error(`Failed to check RLS status for ${tableName}: ${error.message}`);
    }

    return data?.rowsecurity === true;
  }

  /**
   * Validate RLS policy syntax and security
   */
  static validateRLSPolicy(policy: RLSPolicy): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check if policy uses auth context
    if (!policy.qual.includes('auth.uid()') && !policy.qual.includes('get_user_')) {
      issues.push('Policy does not use authentication context');
    }

    // Check for potential SQL injection vulnerabilities
    if (policy.qual.includes("'") && !policy.qual.includes('auth.uid()')) {
      issues.push('Policy may be vulnerable to SQL injection');
    }

    // Check if policy is too permissive
    if (policy.qual === 'true' || policy.qual === '1=1') {
      issues.push('Policy is too permissive (allows all access)');
    }

    // Check for proper user isolation
    if (!policy.qual.includes('user_id') && !policy.qual.includes('owner_id')) {
      issues.push('Policy may not properly isolate user data');
    }

    // Validate with_check clause for INSERT/UPDATE
    if (['INSERT', 'UPDATE', 'ALL'].includes(policy.cmd)) {
      if (!policy.with_check || policy.with_check === 'true') {
        issues.push('with_check clause is missing or too permissive');
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate test cases for authorization testing
   */
  static generateAuthorizationTestCases(): AuthorizationTestCase[] {
    return [
      // User accessing own data (should allow)
      {
        name: 'User accessing own files',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'files',
        expectedResult: 'allow'
      },
      {
        name: 'User updating own file',
        userId: 'user-1',
        operation: 'UPDATE',
        table: 'files',
        expectedResult: 'allow',
        data: { name: 'updated-file.pdf' }
      },
      {
        name: 'User deleting own file',
        userId: 'user-1',
        operation: 'DELETE',
        table: 'files',
        expectedResult: 'allow'
      },

      // Cross-user access (should deny)
      {
        name: 'User accessing other user files',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'SELECT',
        table: 'files',
        expectedResult: 'deny'
      },
      {
        name: 'User updating other user file',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'UPDATE',
        table: 'files',
        expectedResult: 'deny',
        data: { name: 'hacked-file.pdf' }
      },
      {
        name: 'User deleting other user file',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'DELETE',
        table: 'files',
        expectedResult: 'deny'
      },

      // Conversation access tests
      {
        name: 'User accessing own conversations',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'conversations',
        expectedResult: 'allow'
      },
      {
        name: 'User accessing other user conversations',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'SELECT',
        table: 'conversations',
        expectedResult: 'deny'
      },

      // Chat message access tests
      {
        name: 'User accessing own chat messages',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'chat_messages',
        expectedResult: 'allow'
      },
      {
        name: 'User accessing other user chat messages',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'SELECT',
        table: 'chat_messages',
        expectedResult: 'deny'
      },

      // Usage logs access tests
      {
        name: 'User accessing own usage logs',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'usage_logs',
        expectedResult: 'allow'
      },
      {
        name: 'User accessing other user usage logs',
        userId: 'user-1',
        targetUserId: 'user-2',
        operation: 'SELECT',
        table: 'usage_logs',
        expectedResult: 'deny'
      },

      // Private table access tests (should all deny for regular users)
      {
        name: 'User accessing OAuth tokens',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'oauth_tokens',
        expectedResult: 'deny'
      },
      {
        name: 'User accessing audit logs',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'audit_logs',
        expectedResult: 'deny'
      },
      {
        name: 'User accessing encryption keys',
        userId: 'user-1',
        operation: 'SELECT',
        table: 'encryption_keys',
        expectedResult: 'deny'
      }
    ];
  }

  /**
   * Test RLS policy enforcement for a specific test case
   */
  static async testRLSEnforcement(
    supabase: any,
    testCase: AuthorizationTestCase
  ): Promise<{
    passed: boolean;
    actualResult: 'allow' | 'deny' | 'error';
    error?: string;
    data?: any;
  }> {
    try {
      // Set user context for the test
      await this.setUserContext(supabase, testCase.userId);

      let result;
      const targetUserId = testCase.targetUserId || testCase.userId;

      switch (testCase.operation) {
        case 'SELECT':
          result = await supabase
            .from(testCase.table)
            .select('*')
            .eq('user_id', targetUserId)
            .limit(1);
          break;

        case 'INSERT':
          result = await supabase
            .from(testCase.table)
            .insert({
              user_id: targetUserId,
              ...testCase.data
            })
            .select();
          break;

        case 'UPDATE':
          result = await supabase
            .from(testCase.table)
            .update(testCase.data || {})
            .eq('user_id', targetUserId)
            .select();
          break;

        case 'DELETE':
          result = await supabase
            .from(testCase.table)
            .delete()
            .eq('user_id', targetUserId);
          break;

        default:
          throw new Error(`Unsupported operation: ${testCase.operation}`);
      }

      const actualResult = result.error ? 'deny' : 'allow';
      const passed = actualResult === testCase.expectedResult;

      return {
        passed,
        actualResult,
        data: result.data,
        error: result.error?.message
      };

    } catch (error) {
      return {
        passed: false,
        actualResult: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Set user context for RLS testing
   */
  static async setUserContext(supabase: any, userId: string): Promise<void> {
    // This would typically involve setting the JWT token or user context
    // For testing, we might use a special RPC function
    await supabase.rpc('set_test_user_context', { user_id: userId });
  }

  /**
   * Generate malicious test cases for security testing
   */
  static generateMaliciousTestCases(): Array<{
    name: string;
    payload: any;
    expectedBlocked: boolean;
  }> {
    return [
      {
        name: 'SQL Injection in user_id',
        payload: {
          user_id: "'; DROP TABLE files; --"
        },
        expectedBlocked: true
      },
      {
        name: 'Boolean SQL injection',
        payload: {
          user_id: "' OR '1'='1"
        },
        expectedBlocked: true
      },
      {
        name: 'Union-based SQL injection',
        payload: {
          user_id: "' UNION SELECT * FROM private.oauth_tokens --"
        },
        expectedBlocked: true
      },
      {
        name: 'Time-based SQL injection',
        payload: {
          user_id: "'; SELECT pg_sleep(10); --"
        },
        expectedBlocked: true
      },
      {
        name: 'Cross-schema access attempt',
        payload: {
          user_id: "user-1'; SELECT * FROM information_schema.tables; --"
        },
        expectedBlocked: true
      },
      {
        name: 'Function call injection',
        payload: {
          user_id: "user-1'; SELECT version(); --"
        },
        expectedBlocked: true
      }
    ];
  }

  /**
   * Test RLS bypass attempts
   */
  static async testRLSBypassAttempts(supabase: any): Promise<{
    totalAttempts: number;
    blockedAttempts: number;
    successfulBypasses: number;
    details: Array<{
      attempt: string;
      blocked: boolean;
      error?: string;
    }>;
  }> {
    const maliciousTestCases = this.generateMaliciousTestCases();
    const results = [];
    let blockedAttempts = 0;

    for (const testCase of maliciousTestCases) {
      try {
        const result = await supabase
          .from('files')
          .select('*')
          .eq('user_id', testCase.payload.user_id)
          .limit(1);

        const blocked = !!result.error;
        if (blocked) blockedAttempts++;

        results.push({
          attempt: testCase.name,
          blocked,
          error: result.error?.message
        });

      } catch (error) {
        // Exception thrown - attempt was blocked
        blockedAttempts++;
        results.push({
          attempt: testCase.name,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      totalAttempts: maliciousTestCases.length,
      blockedAttempts,
      successfulBypasses: maliciousTestCases.length - blockedAttempts,
      details: results
    };
  }

  /**
   * Validate all protected tables have proper RLS
   */
  static async validateAllTablesRLS(supabase: any): Promise<{
    totalTables: number;
    protectedTables: number;
    unprotectedTables: string[];
    policyIssues: Array<{
      table: string;
      issues: string[];
    }>;
  }> {
    const unprotectedTables: string[] = [];
    const policyIssues: Array<{ table: string; issues: string[] }> = [];

    for (const table of this.PROTECTED_TABLES) {
      const tableName = table.split('.')[1]; // Remove schema prefix
      
      try {
        // Check if RLS is enabled
        const rlsEnabled = await this.isRLSEnabled(supabase, tableName);
        
        if (!rlsEnabled) {
          unprotectedTables.push(table);
          continue;
        }

        // Get and validate policies
        const policies = await this.getRLSPolicies(supabase, tableName);
        
        if (policies.length === 0) {
          policyIssues.push({
            table,
            issues: ['No RLS policies defined']
          });
          continue;
        }

        // Validate each policy
        for (const policy of policies) {
          const validation = this.validateRLSPolicy(policy);
          if (!validation.valid) {
            policyIssues.push({
              table: `${table}.${policy.policyname}`,
              issues: validation.issues
            });
          }
        }

      } catch (error) {
        policyIssues.push({
          table,
          issues: [`Failed to validate: ${error instanceof Error ? error.message : 'Unknown error'}`]
        });
      }
    }

    return {
      totalTables: this.PROTECTED_TABLES.length,
      protectedTables: this.PROTECTED_TABLES.length - unprotectedTables.length,
      unprotectedTables,
      policyIssues
    };
  }

  /**
   * Generate comprehensive RLS test report
   */
  static async generateRLSTestReport(supabase: any): Promise<{
    summary: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
      successRate: number;
    };
    tableValidation: any;
    authorizationTests: any[];
    bypassAttempts: any;
    recommendations: string[];
  }> {
    // Run all RLS tests
    const authorizationTestCases = this.generateAuthorizationTestCases();
    const authorizationResults = [];

    for (const testCase of authorizationTestCases) {
      const result = await this.testRLSEnforcement(supabase, testCase);
      authorizationResults.push({
        testCase,
        result
      });
    }

    // Validate table RLS configuration
    const tableValidation = await this.validateAllTablesRLS(supabase);

    // Test bypass attempts
    const bypassAttempts = await this.testRLSBypassAttempts(supabase);

    // Calculate summary
    const passedTests = authorizationResults.filter(r => r.result.passed).length;
    const totalTests = authorizationResults.length;

    // Generate recommendations
    const recommendations = this.generateRLSRecommendations(
      tableValidation,
      authorizationResults,
      bypassAttempts
    );

    return {
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      tableValidation,
      authorizationTests: authorizationResults,
      bypassAttempts,
      recommendations
    };
  }

  /**
   * Generate RLS security recommendations
   */
  static generateRLSRecommendations(
    tableValidation: any,
    authorizationResults: any[],
    bypassAttempts: any
  ): string[] {
    const recommendations: string[] = [];

    // Check unprotected tables
    if (tableValidation.unprotectedTables.length > 0) {
      recommendations.push(
        `Enable RLS on unprotected tables: ${tableValidation.unprotectedTables.join(', ')}`
      );
    }

    // Check policy issues
    if (tableValidation.policyIssues.length > 0) {
      recommendations.push(
        'Fix RLS policy issues found in table validation'
      );
    }

    // Check failed authorization tests
    const failedTests = authorizationResults.filter(r => !r.result.passed);
    if (failedTests.length > 0) {
      recommendations.push(
        `Review and fix ${failedTests.length} failed authorization tests`
      );
    }

    // Check bypass attempts
    if (bypassAttempts.successfulBypasses > 0) {
      recommendations.push(
        `CRITICAL: ${bypassAttempts.successfulBypasses} RLS bypass attempts succeeded - immediate review required`
      );
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('RLS configuration appears secure - continue regular testing');
    }

    return recommendations;
  }

  /**
   * Create test data for RLS testing
   */
  static generateTestData(): {
    users: any[];
    files: any[];
    conversations: any[];
    chatMessages: any[];
  } {
    const users = [
      { id: 'user-1', email: 'user1@example.com', subscription_tier: 'free' },
      { id: 'user-2', email: 'user2@example.com', subscription_tier: 'pro' },
      { id: 'admin-1', email: 'admin@example.com', subscription_tier: 'pro_byok' }
    ];

    const files = [
      { id: 'file-1', user_id: 'user-1', name: 'user1-doc.pdf', size: 1024 },
      { id: 'file-2', user_id: 'user-1', name: 'user1-private.docx', size: 2048 },
      { id: 'file-3', user_id: 'user-2', name: 'user2-doc.pdf', size: 1536 }
    ];

    const conversations = [
      { id: 'conv-1', user_id: 'user-1', title: 'User 1 Chat' },
      { id: 'conv-2', user_id: 'user-2', title: 'User 2 Chat' }
    ];

    const chatMessages = [
      { id: 'msg-1', conversation_id: 'conv-1', user_id: 'user-1', content: 'Hello' },
      { id: 'msg-2', conversation_id: 'conv-2', user_id: 'user-2', content: 'Hi there' }
    ];

    return {
      users,
      files,
      conversations,
      chatMessages
    };
  }
}

/**
 * RLS Test Fixtures
 */
export const RLSTestFixtures = {
  validRLSPolicies: [
    {
      schemaname: 'app',
      tablename: 'files',
      policyname: 'files_isolation_policy',
      permissive: 'PERMISSIVE' as const,
      roles: ['authenticated'],
      cmd: 'ALL' as const,
      qual: '(user_id = auth.uid())',
      with_check: '(user_id = auth.uid())'
    },
    {
      schemaname: 'app',
      tablename: 'conversations',
      policyname: 'conversations_isolation_policy',
      permissive: 'PERMISSIVE' as const,
      roles: ['authenticated'],
      cmd: 'ALL' as const,
      qual: '(user_id = auth.uid())',
      with_check: '(user_id = auth.uid())'
    }
  ],

  insecureRLSPolicies: [
    {
      schemaname: 'app',
      tablename: 'files',
      policyname: 'insecure_policy',
      permissive: 'PERMISSIVE' as const,
      roles: ['authenticated'],
      cmd: 'ALL' as const,
      qual: 'true', // Too permissive
      with_check: 'true'
    },
    {
      schemaname: 'app',
      tablename: 'conversations',
      policyname: 'no_auth_policy',
      permissive: 'PERMISSIVE' as const,
      roles: ['authenticated'],
      cmd: 'ALL' as const,
      qual: '1=1', // No authentication check
      with_check: '1=1'
    }
  ],

  sqlInjectionPayloads: [
    "'; DROP TABLE files; --",
    "' OR '1'='1",
    "' UNION SELECT * FROM private.oauth_tokens --",
    "'; SELECT pg_sleep(10); --",
    "' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --"
  ]
};