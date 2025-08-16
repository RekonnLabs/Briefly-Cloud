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
  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  const model = resolveChatModel(tier)
  
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    })
    
    return response.choices[0]?.message?.content || 'No response generated'
  } catch (error) {
    console.error('Error generating chat completion:', error)
    throw new Error('Failed to generate chat response')
  }
}

// Stream chat completion (for better UX)
export async function streamChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string
) {
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
    throw new Error('Failed to stream chat response')
  }
}