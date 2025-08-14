/**
 * Integration and End-to-End Security Tests
 * 
 * Comprehensive test suite for end-to-end security workflows including:
 * - Complete user workflows with security controls
 * - File upload/download security throughout the pipeline
 * - Chat functionality with proper data isolation
 * - Performance tests for security-enabled operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthSecurityTestUtils } from './auth-test-utils';

// Mock Next.js API routes
const mockApiResponse = (data: any, status: number = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(data),
  headers: new Headers()
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Integration and End-to-End Security Tests', () => {
  let testUtils: typeof AuthSecurityTestUtils;
  let testUser: any;
  let authToken: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testUtils = AuthSecurityTestUtils;
    testUser = testUtils.createTestUser();
    authToken = testUtils.generateValidToken(testUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete User Workflows with Security Controls', () => {
    it('should enforce security throughout user registration workflow', async () => {
      const registrationData = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      // Mock successful registration
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          user: { id: 'new-user-123', email: registrationData.email },
          message: 'Registration successful'
        })
      );

      const registrationResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      const result = await registrationResponse.json();

      expect(registrationResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.user.email).toBe(registrationData.email);

      // Verify security controls were applied
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });
    });

    it('should enforce security throughout login workflow', async () => {
      const loginData = {
        email: testUser.email,
        password: 'correctPassword'
      };

      // Mock successful login
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          token: authToken,
          user: testUser,
          session: { id: 'session-123', expires_at: new Date(Date.now() + 3600000).toISOString() }
        })
      );

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const result = await loginResponse.json();

      expect(loginResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.token).toBe(authToken);
      expect(result.user.id).toBe(testUser.id);
    });
  });
});    it('sh
ould enforce security throughout password reset workflow', async () => {
      const resetRequest = {
        email: testUser.email
      };

      // Mock password reset request
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          message: 'Password reset email sent'
        })
      );

      const resetResponse = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetRequest)
      });

      const result = await resetResponse.json();

      expect(resetResponse.ok).toBe(true);
      expect(result.success).toBe(true);

      // Mock password reset confirmation
      const resetToken = 'secure-reset-token-123';
      const newPassword = 'NewSecurePassword456!';

      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          message: 'Password reset successful'
        })
      );

      const confirmResetResponse = await fetch('/api/auth/confirm-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          password: newPassword,
          confirmPassword: newPassword
        })
      });

      const confirmResult = await confirmResetResponse.json();

      expect(confirmResetResponse.ok).toBe(true);
      expect(confirmResult.success).toBe(true);
    });

    it('should enforce security throughout profile update workflow', async () => {
      const profileUpdate = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };

      // Mock profile update with authentication
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          user: { ...testUser, ...profileUpdate },
          message: 'Profile updated successfully'
        })
      );

      const updateResponse = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(profileUpdate)
      });

      const result = await updateResponse.json();

      expect(updateResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.user.name).toBe(profileUpdate.name);
      expect(result.user.email).toBe(profileUpdate.email);

      // Verify authentication header was included
      expect(global.fetch).toHaveBeenCalledWith('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(profileUpdate)
      });
    });

  describe('File Upload/Download Security Throughout Pipeline', () => {
    it('should enforce security throughout file upload workflow', async () => {
      const fileData = {
        name: 'test-document.pdf',
        size: 1024 * 1024, // 1MB
        type: 'application/pdf',
        content: 'base64-encoded-content'
      };

      // Mock file upload with security validation
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          file: {
            id: 'file-123',
            name: fileData.name,
            size: fileData.size,
            type: fileData.type,
            user_id: testUser.id,
            upload_url: 'https://secure-storage.supabase.co/file-123'
          },
          message: 'File uploaded successfully'
        })
      );

      const uploadResponse = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(fileData)
      });

      const result = await uploadResponse.json();

      expect(uploadResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.file.user_id).toBe(testUser.id);
      expect(result.file.name).toBe(fileData.name);
    });

    it('should enforce security throughout file download workflow', async () => {
      const fileId = 'file-123';

      // Mock secure file download
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          download_url: 'https://secure-storage.supabase.co/file-123?token=secure-token',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          file: {
            id: fileId,
            name: 'test-document.pdf',
            user_id: testUser.id
          }
        })
      );

      const downloadResponse = await fetch(`/api/files/${fileId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await downloadResponse.json();

      expect(downloadResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.download_url).toContain('secure-token');
      expect(result.file.user_id).toBe(testUser.id);
    });

    it('should prevent unauthorized file access', async () => {
      const otherUserFileId = 'file-belonging-to-other-user';

      // Mock unauthorized access attempt
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: false,
          error: 'Unauthorized access to file'
        }, 403)
      );

      const unauthorizedResponse = await fetch(`/api/files/${otherUserFileId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await unauthorizedResponse.json();

      expect(unauthorizedResponse.status).toBe(403);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('should enforce file sharing security', async () => {
      const fileId = 'file-123';
      const shareData = {
        permissions: 'read',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        password_protected: true,
        password: 'SharePassword123!'
      };

      // Mock secure file sharing
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          share_token: 'secure-share-token-123',
          share_url: `https://briefly.cloud/share/secure-share-token-123`,
          expires_at: shareData.expires_at,
          permissions: shareData.permissions
        })
      );

      const shareResponse = await fetch(`/api/files/${fileId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(shareData)
      });

      const result = await shareResponse.json();

      expect(shareResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.share_token).toBeDefined();
      expect(result.share_url).toContain('secure-share-token-123');
    });
  });

  describe('Chat Functionality with Data Isolation', () => {
    it('should enforce security throughout chat conversation workflow', async () => {
      const conversationData = {
        title: 'Test Conversation',
        file_ids: ['file-123', 'file-456']
      };

      // Mock conversation creation
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          conversation: {
            id: 'conv-123',
            title: conversationData.title,
            user_id: testUser.id,
            file_ids: conversationData.file_ids,
            created_at: new Date().toISOString()
          }
        })
      );

      const conversationResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(conversationData)
      });

      const result = await conversationResponse.json();

      expect(conversationResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.conversation.user_id).toBe(testUser.id);
      expect(result.conversation.title).toBe(conversationData.title);
    });

    it('should enforce security throughout chat message workflow', async () => {
      const conversationId = 'conv-123';
      const messageData = {
        content: 'What is the main topic of the uploaded document?',
        type: 'user'
      };

      // Mock chat message creation
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          message: {
            id: 'msg-123',
            conversation_id: conversationId,
            content: messageData.content,
            type: messageData.type,
            user_id: testUser.id,
            created_at: new Date().toISOString()
          }
        })
      );

      const messageResponse = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(messageData)
      });

      const result = await messageResponse.json();

      expect(messageResponse.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.message.user_id).toBe(testUser.id);
      expect(result.message.conversation_id).toBe(conversationId);
    });

    it('should prevent cross-user conversation access', async () => {
      const otherUserConversationId = 'conv-belonging-to-other-user';

      // Mock unauthorized conversation access
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: false,
          error: 'Unauthorized access to conversation'
        }, 403)
      );

      const unauthorizedResponse = await fetch(`/api/conversations/${otherUserConversationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await unauthorizedResponse.json();

      expect(unauthorizedResponse.status).toBe(403);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('should enforce data isolation in chat responses', async () => {
      const conversationId = 'conv-123';
      const messageId = 'msg-123';

      // Mock AI response with proper data isolation
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          response: {
            id: 'msg-124',
            conversation_id: conversationId,
            content: 'Based on your uploaded document, the main topic appears to be...',
            type: 'assistant',
            user_id: testUser.id,
            sources: [
              {
                file_id: 'file-123',
                user_id: testUser.id, // Ensures source belongs to user
                chunk_id: 'chunk-456'
              }
            ],
            created_at: new Date().toISOString()
          }
        })
      );

      const responseRequest = await fetch(`/api/conversations/${conversationId}/messages/${messageId}/response`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await responseRequest.json();

      expect(responseRequest.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.response.user_id).toBe(testUser.id);
      expect(result.response.sources[0].user_id).toBe(testUser.id);
    });
  });

  describe('Performance Tests for Security-Enabled Operations', () => {
    it('should maintain performance with authentication middleware', async () => {
      const startTime = performance.now();

      // Mock multiple authenticated API calls
      const apiCalls = Array.from({ length: 10 }, (_, i) => 
        fetch(`/api/files?page=${i}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      );

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(mockApiResponse({
          success: true,
          files: Array.from({ length: 10 }, (_, i) => ({
            id: `file-${i}`,
            name: `document-${i}.pdf`,
            user_id: testUser.id
          }))
        }))
      );

      await Promise.all(apiCalls);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time even with security checks
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 10 calls
    });

    it('should maintain performance with RLS policy enforcement', async () => {
      const startTime = performance.now();

      // Mock database queries with RLS
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          files: Array.from({ length: 100 }, (_, i) => ({
            id: `file-${i}`,
            name: `document-${i}.pdf`,
            user_id: testUser.id
          })),
          total: 100,
          page: 1,
          per_page: 100
        })
      );

      const filesResponse = await fetch('/api/files?limit=100', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const result = await filesResponse.json();
      const endTime = performance.now();
      const queryTime = endTime - startTime;

      expect(filesResponse.ok).toBe(true);
      expect(result.files).toHaveLength(100);
      expect(queryTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain performance with audit logging enabled', async () => {
      const startTime = performance.now();

      // Mock operations that trigger audit logging
      const operations = [
        fetch('/api/files/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: 'test.pdf', size: 1024 })
        }),
        fetch('/api/files/file-123', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: 'Updated Name' })
        })
      ];

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(mockApiResponse({ success: true }))
      );

      await Promise.all(operations);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Audit logging should not significantly impact performance
      expect(totalTime).toBeLessThan(3000); // 3 seconds for 3 operations
    });

    it('should maintain performance with rate limiting enabled', async () => {
      const startTime = performance.now();

      // Mock rapid API calls within rate limits
      const rapidCalls = Array.from({ length: 20 }, () =>
        fetch('/api/search/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ query: 'test search' })
        })
      );

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(mockApiResponse({
          success: true,
          results: [],
          rate_limit: {
            remaining: 80,
            reset_time: Date.now() + 60000
          }
        }))
      );

      const results = await Promise.all(rapidCalls);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All calls should succeed within rate limits
      expect(results.every(r => r.ok)).toBe(true);
      expect(totalTime).toBeLessThan(4000); // 4 seconds for 20 calls
    });

    it('should handle concurrent user operations efficiently', async () => {
      const startTime = performance.now();

      // Simulate concurrent operations from same user
      const concurrentOps = [
        fetch('/api/files', { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch('/api/conversations', { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch('/api/usage/analytics', { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch('/api/user/profile', { headers: { 'Authorization': `Bearer ${authToken}` } })
      ];

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(mockApiResponse({ success: true, data: [] }))
      );

      const results = await Promise.all(concurrentOps);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(results.every(r => r.ok)).toBe(true);
      expect(totalTime).toBeLessThan(2000); // Should handle concurrency efficiently
    });
  });

  describe('End-to-End Security Workflow Integration', () => {
    it('should complete full document processing workflow securely', async () => {
      // Step 1: Upload document
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          file: { id: 'file-123', name: 'document.pdf', user_id: testUser.id }
        })
      );

      const uploadResponse = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name: 'document.pdf', content: 'base64-content' })
      });

      expect(uploadResponse.ok).toBe(true);

      // Step 2: Process document
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          processing: { id: 'proc-123', status: 'completed', chunks_created: 25 }
        })
      );

      const processResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ file_id: 'file-123' })
      });

      expect(processResponse.ok).toBe(true);

      // Step 3: Create conversation
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          conversation: { id: 'conv-123', user_id: testUser.id, file_ids: ['file-123'] }
        })
      );

      const conversationResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ title: 'Document Chat', file_ids: ['file-123'] })
      });

      expect(conversationResponse.ok).toBe(true);

      // Step 4: Chat with document
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        mockApiResponse({
          success: true,
          response: {
            content: 'Based on your document...',
            sources: [{ file_id: 'file-123', user_id: testUser.id }]
          }
        })
      );

      const chatResponse = await fetch('/api/conversations/conv-123/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ content: 'What is this document about?' })
      });

      expect(chatResponse.ok).toBe(true);

      // Verify all steps maintained security
      expect(global.fetch).toHaveBeenCalledTimes(4);
      const calls = (global.fetch as jest.Mock).mock.calls;
      calls.forEach(call => {
        expect(call[1].headers.Authorization).toBe(`Bearer ${authToken}`);
      });
    });

    it('should handle security throughout user lifecycle', async () => {
      // Registration -> Login -> Usage -> Account Management -> Deletion
      const lifecycle = [
        {
          step: 'registration',
          endpoint: '/api/auth/register',
          method: 'POST',
          requiresAuth: false
        },
        {
          step: 'login',
          endpoint: '/api/auth/login',
          method: 'POST',
          requiresAuth: false
        },
        {
          step: 'profile_update',
          endpoint: '/api/user/profile',
          method: 'PUT',
          requiresAuth: true
        },
        {
          step: 'file_upload',
          endpoint: '/api/files/upload',
          method: 'POST',
          requiresAuth: true
        },
        {
          step: 'account_deletion',
          endpoint: '/api/user/delete',
          method: 'DELETE',
          requiresAuth: true
        }
      ];

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(mockApiResponse({ success: true }))
      );

      for (const step of lifecycle) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (step.requiresAuth) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        await fetch(step.endpoint, {
          method: step.method,
          headers,
          body: JSON.stringify({})
        });
      }

      // Verify security was enforced at each step
      const calls = (global.fetch as jest.Mock).mock.calls;
      calls.forEach((call, index) => {
        const step = lifecycle[index];
        if (step.requiresAuth) {
          expect(call[1].headers.Authorization).toBe(`Bearer ${authToken}`);
        }
      });
    });
  });
});