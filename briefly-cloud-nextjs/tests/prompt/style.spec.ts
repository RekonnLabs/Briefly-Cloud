/**
 * Briefly Voice v1 - Style Tests
 * 
 * Tests to ensure consistent voice application and response formatting
 * across all LLM interactions. These tests validate the core style requirements.
 */

import { describe, it, expect } from '@jest/globals'
import { enforce as lintResponse, quickValidate } from '@/lib/prompt/responseLinter'
import { buildMessages, buildSimpleMessages } from '@/lib/prompt/promptBuilder'
import { buildSystem } from '@/lib/voice/brieflyVoice'

describe('Briefly Voice v1 Style Tests', () => {
  describe('Response Linter', () => {
    it('should ensure "Next steps" block is present', () => {
      // Mock LLM response without next steps
      const mockResponse = `
Here's how to upload documents to Briefly:

You can upload documents by clicking the upload button in the dashboard. The system supports PDF, DOCX, and TXT files up to 50MB for free users.

• Navigate to your dashboard
• Click the "Upload Documents" button
• Select your files
• Wait for processing to complete

The documents will be processed and made available for chat within 2-5 minutes.
      `.trim()

      const linted = lintResponse(mockResponse)
      
      expect(linted.rewritten).toBe(true)
      expect(linted.output.toLowerCase()).toContain('next steps')
      expect(linted.improvements).toContain('Added "Next steps" section')
    })

    it('should convert long paragraphs to bullets', () => {
      // Mock LLM response with long paragraphs
      const mockResponse = `
To upload documents, you need to first navigate to your dashboard where you'll find the upload section. From there, you can select multiple files at once and the system will process them automatically. The processing time depends on file size and complexity but usually takes between 2-5 minutes for most documents.

After uploading, you can start chatting with your documents immediately. The system will search through your uploaded content to provide relevant answers to your questions.
      `.trim()

      const linted = lintResponse(mockResponse)
      
      expect(linted.rewritten).toBe(true)
      expect(linted.output).toContain('•')
      expect(linted.improvements).toContain('Converted long paragraphs to bullet points')
    })

    it('should improve missing context requests', () => {
      // Mock LLM response indicating missing context
      const mockResponse = `
I don't have enough information to answer your question about document processing. Could you provide more details about what specific aspect you're asking about?
      `.trim()

      const linted = lintResponse(mockResponse)
      
      expect(linted.rewritten).toBe(true)
      expect(linted.output).toContain("I'd be happy to help with more specific information")
      expect(linted.improvements).toContain('Improved missing context request')
    })
  })

  describe('Voice Consistency', () => {
    it('should build consistent system messages', () => {
      const systemMessage = buildSystem()
      
      expect(systemMessage.role).toBe('system')
      expect(systemMessage.content).toContain('Briefly')
      expect(systemMessage.content).toContain('professional')
      expect(systemMessage.content).toContain('concise')
      expect(systemMessage.content).toContain('Next steps')
    })

    it('should build properly structured messages', () => {
      const messages = buildSimpleMessages(
        "How do I upload documents?",
        "Help the user understand document upload process",
        "Provide step-by-step instructions with clear next steps"
      )
      
      expect(messages).toHaveLength(3) // system, developer, user
      expect(messages[0].role).toBe('system')
      expect(messages[1].role).toBe('developer')
      expect(messages[2].role).toBe('user')
      
      // Check system message contains voice elements
      expect(messages[0].content).toContain('Briefly')
      
      // Check developer message is concise
      expect(messages[1].content.length).toBeLessThan(200)
      
      // Check user message is preserved
      expect(messages[2].content).toBe("How do I upload documents?")
    })
  })

  describe('Quality Validation', () => {
    it('should validate response structure and quality', () => {
      const goodResponse = `
Upload documents by following these steps:

• Go to your dashboard
• Click "Upload Documents"
• Select your files (PDF, DOCX, TXT)
• Wait for processing

**Next steps:**
• Start chatting with your documents
• Try asking specific questions about the content
      `.trim()

      const validation = quickValidate(goodResponse)
      
      expect(validation.hasNextSteps).toBe(true)
      expect(validation.hasStructure).toBe(true)
      expect(validation.isReasonableLength).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    it('should identify quality issues in poor responses', () => {
      const poorResponse = `
Well, it depends on what you're trying to do. There are many factors to consider when uploading documents. It's complicated because different file types have different requirements and the system handles them in various ways depending on your subscription tier and the complexity of the content you're trying to upload.
      `.trim()

      const validation = quickValidate(poorResponse)
      
      expect(validation.hasNextSteps).toBe(false)
      expect(validation.hasStructure).toBe(false)
      expect(validation.issues.length).toBeGreaterThan(0)
      expect(validation.issues.some(issue => 
        issue.includes('vague language')
      )).toBe(true)
    })

    it('should handle edge cases gracefully', () => {
      // Test very short response
      const shortResponse = "Yes."
      const shortValidation = quickValidate(shortResponse)
      expect(shortValidation.isReasonableLength).toBe(false)

      // Test very long response
      const longResponse = "A".repeat(2000)
      const longValidation = quickValidate(longResponse)
      expect(longValidation.issues.some(issue => 
        issue.includes('too long')
      )).toBe(true)

      // Test empty response
      const emptyResponse = ""
      const emptyValidation = quickValidate(emptyResponse)
      expect(emptyValidation.isReasonableLength).toBe(false)
    })
  })

  describe('Integration Tests', () => {
    it('should maintain voice consistency across different message types', () => {
      const contextSnippets = [
        {
          content: "Document upload supports PDF, DOCX, and TXT files.",
          source: "user-guide.pdf",
          relevance: 0.9
        }
      ]

      const messages = buildMessages({
        developerTask: "Help user with document upload",
        developerShape: "Provide clear instructions",
        contextSnippets,
        userMessage: "How do I upload files?"
      })

      // Should have system, context, and user messages
      expect(messages.length).toBeGreaterThanOrEqual(3)
      
      // System message should maintain voice
      const systemMsg = messages.find(m => m.role === 'system')
      expect(systemMsg?.content).toContain('Briefly')
      
      // Context should be properly formatted
      const contextMsg = messages.find(m => 
        m.role === 'user' && m.content.includes('Context:')
      )
      expect(contextMsg?.content).toContain('user-guide.pdf')
    })
  })
})