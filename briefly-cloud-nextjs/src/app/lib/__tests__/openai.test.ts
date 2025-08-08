import { generateEmbedding, generateChatCompletion, getChatModelForTier } from '../openai'
import { CHAT_MODELS } from '../openai'

// Mock OpenAI
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn(),
    },
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  })),
}))

describe('OpenAI Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Model Configuration', () => {
    it('should have correct default models', () => {
      expect(CHAT_MODELS.FREE).toBe('gpt-5-nano')
      expect(CHAT_MODELS.PRO).toBe('gpt-5-mini')
      expect(CHAT_MODELS.BYOK).toBe('gpt-5-mini')
    })

    it('should use environment variables for model overrides', () => {
      const originalEnv = process.env
      process.env.CHAT_MODEL_FREE = 'gpt-4.1-nano'
      process.env.CHAT_MODEL_PRO = 'gpt-4.1-mini'
      process.env.CHAT_MODEL_BYOK = 'gpt-4.1-mini'

      // Re-import to get updated values
      jest.resetModules()
      const { CHAT_MODELS: UpdatedModels } = require('../openai')

      expect(UpdatedModels.FREE).toBe('gpt-4.1-nano')
      expect(UpdatedModels.PRO).toBe('gpt-4.1-mini')
      expect(UpdatedModels.BYOK).toBe('gpt-4.1-mini')

      process.env = originalEnv
    })
  })

  describe('getChatModelForTier', () => {
    it('should return correct model for free tier', () => {
      const model = getChatModelForTier('free')
      expect(model).toBe('gpt-5-nano')
    })

    it('should return correct model for pro tier', () => {
      const model = getChatModelForTier('pro')
      expect(model).toBe('gpt-5-mini')
    })

    it('should return correct model for BYOK tier', () => {
      const model = getChatModelForTier('pro_byok')
      expect(model).toBe('gpt-5-mini')
    })

    it('should handle fallback when GPT-5 is unavailable', () => {
      const originalEnv = process.env
      process.env.FEATURE_GPT5 = 'false'

      jest.resetModules()
      const { getChatModelForTier: getModel } = require('../openai')

      const freeModel = getModel('free')
      const proModel = getModel('pro')
      const byokModel = getModel('pro_byok')

      expect(freeModel).toBe('gpt-4.1-nano')
      expect(proModel).toBe('gpt-4.1-mini')
      expect(byokModel).toBe('gpt-4.1-mini')

      process.env = originalEnv
    })
  })

  describe('generateEmbedding', () => {
    it('should generate embeddings successfully', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockEmbeddingsCreate = mockOpenAI().embeddings.create

      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          {
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
            index: 0,
          },
        ],
      })

      const text = 'Test text for embedding'
      const embedding = await generateEmbedding(text)

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: text,
      })
      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
    })

    it('should handle embedding errors', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockEmbeddingsCreate = mockOpenAI().embeddings.create

      mockEmbeddingsCreate.mockRejectedValue(new Error('OpenAI API error'))

      await expect(generateEmbedding('test')).rejects.toThrow('OpenAI API error')
    })
  })

  describe('generateChatCompletion', () => {
    it('should generate chat completion successfully', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockChatCreate = mockOpenAI().chat.completions.create

      mockChatCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'This is a test response',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })

      const messages = [
        { role: 'user', content: 'Hello, how are you?' },
      ]
      const model = 'gpt-5-mini'

      const result = await generateChatCompletion(messages, model)

      expect(mockChatCreate).toHaveBeenCalledWith({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      })
      expect(result.content).toBe('This is a test response')
      expect(result.usage).toBeDefined()
    })

    it('should handle streaming responses', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockChatCreate = mockOpenAI().chat.completions.create

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [
              {
                delta: { content: 'Hello' },
                finish_reason: null,
              },
            ],
          }
          yield {
            choices: [
              {
                delta: { content: ' World' },
                finish_reason: 'stop',
              },
            ],
          }
        },
      }

      mockChatCreate.mockResolvedValue(mockStream)

      const messages = [
        { role: 'user', content: 'Say hello' },
      ]
      const model = 'gpt-5-mini'

      const result = await generateChatCompletion(messages, model, true)

      expect(mockChatCreate).toHaveBeenCalledWith({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
      })
      expect(result).toBeDefined()
    })

    it('should handle chat completion errors', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockChatCreate = mockOpenAI().chat.completions.create

      mockChatCreate.mockRejectedValue(new Error('OpenAI API error'))

      const messages = [
        { role: 'user', content: 'Hello' },
      ]

      await expect(generateChatCompletion(messages, 'gpt-5-mini')).rejects.toThrow('OpenAI API error')
    })

    it('should handle BYOK model selection', async () => {
      const mockOpenAI = require('openai').OpenAI
      const mockChatCreate = mockOpenAI().chat.completions.create

      mockChatCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'BYOK response',
              role: 'assistant',
            },
          },
        ],
      })

      const messages = [
        { role: 'user', content: 'Test BYOK' },
      ]

      // Test with custom model for BYOK
      const result = await generateChatCompletion(messages, 'gpt-4', false, {
        provider: 'openai',
        apiKey: 'custom-api-key',
      })

      expect(mockChatCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      })
      expect(result.content).toBe('BYOK response')
    })
  })
})
