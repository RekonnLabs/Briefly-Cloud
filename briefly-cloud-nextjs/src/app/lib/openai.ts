import OpenAI from 'openai'

// Default OpenAI client using system API key - lazy initialization
let _openai: OpenAI | null = null

export const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    if (!_openai) {
      _openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      })
    }
    return _openai[prop as keyof OpenAI]
  }
})

// Create OpenAI client with user's API key (for BYOK tier)
export function createUserOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey: apiKey,
  })
}

// Embedding configuration
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

// Feature flag and env-based chat model mapping
const FEATURE_GPT5 = String(process.env.FEATURE_GPT5 || 'true').toLowerCase() === 'true'

function fallbackFree(): string {
  // Prefer 4.1-nano if available, then 3.5
  return process.env.FALLBACK_MODEL_FREE || 'gpt-4.1-nano'
}

function fallbackPro(): string {
  return process.env.FALLBACK_MODEL_PRO || 'gpt-4o'
}

function fallbackByok(): string {
  return process.env.FALLBACK_MODEL_BYOK || 'gpt-4o'
}

export const CHAT_MODELS = {
  free: process.env.CHAT_MODEL_FREE || (FEATURE_GPT5 ? 'gpt-5-nano' : fallbackFree()),
  pro: process.env.CHAT_MODEL_PRO || (FEATURE_GPT5 ? 'gpt-5-mini' : fallbackPro()),
  pro_byok: process.env.CHAT_MODEL_BYOK || (FEATURE_GPT5 ? 'gpt-5-mini' : fallbackByok()),
} as const

export type SubscriptionTier = keyof typeof CHAT_MODELS

export function resolveChatModel(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free':
      return CHAT_MODELS.free
    case 'pro':
      return CHAT_MODELS.pro
    case 'pro_byok':
      return CHAT_MODELS.pro_byok
    default:
      return CHAT_MODELS.free
  }
}

// Generate embeddings for text chunks
export async function generateEmbeddings(
  texts: string[],
  userApiKey?: string
): Promise<number[][]> {
  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    })
    
    return response.data.map(item => item.embedding)
  } catch (error) {
    console.error('Error generating embeddings:', error)
    throw new Error('Failed to generate embeddings')
  }
}

// Generate chat completion
export async function generateChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string
): Promise<string> {
  console.log('[OpenAI] generateChatCompletion ENTERED', {
    tier,
    messageCount: messages.length,
    hasUserApiKey: !!userApiKey,
    hasEnvApiKey: !!process.env.OPENAI_API_KEY
  })
  
  // Validate API key availability
  if (!process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.')
  }

  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  const model = resolveChatModel(tier)
  
  try {
    console.log('[OpenAI] Calling chat.completions.create with:', {
      model,
      messageCount: messages.length,
      tier
    })
    
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    })
    
    console.log('[OpenAI] Response received:', {
      model: response.model,
      choices: response.choices.length,
      finishReason: response.choices[0]?.finish_reason,
      contentLength: response.choices[0]?.message?.content?.length || 0,
      hasContent: !!response.choices[0]?.message?.content
    })
    
    const content = response.choices[0]?.message?.content
    if (!content || content.trim().length === 0) {
      console.error('[OpenAI] Empty response received!', {
        response: JSON.stringify(response, null, 2)
      })
      return 'No response generated'
    }
    
    return content
  } catch (error) {
    console.error('Error generating chat completion:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Invalid OpenAI API key. Please check your API key configuration.')
      }
      if (error.message.includes('quota')) {
        throw new Error('OpenAI API quota exceeded. Please check your billing and usage limits.')
      }
      if (error.message.includes('model')) {
        throw new Error(`OpenAI model "${model}" not available. Please check your API access.`)
      }
    }
    
    throw new Error('Failed to generate chat response. Please try again.')
  }
}

// Stream chat completion (for better UX)
export async function streamChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string
) {
  // Validate API key availability
  if (!process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.')
  }

  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  const model = resolveChatModel(tier)
  
  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
      stream: true,
    })
    
    return stream
  } catch (error) {
    console.error('Error streaming chat completion:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Invalid OpenAI API key. Please check your API key configuration.')
      }
      if (error.message.includes('quota')) {
        throw new Error('OpenAI API quota exceeded. Please check your billing and usage limits.')
      }
      if (error.message.includes('model')) {
        throw new Error(`OpenAI model "${model}" not available. Please check your API access.`)
      }
    }
    
    throw new Error('Failed to stream chat response. Please try again.')
  }
}
