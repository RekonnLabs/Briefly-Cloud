import OpenAI from 'openai'

// Default OpenAI client using system API key - lazy initialization
let _openai: OpenAI | null = null

export const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    if (!_openai) {
      _openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        project: process.env.OPENAI_PROJECT_ID,
      })
    }
    return _openai[prop as keyof OpenAI]
  }
})

// Create OpenAI client with user's API key (for BYOK tier)
export function createUserOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey: apiKey,
    project: process.env.OPENAI_PROJECT_ID,
  })
}

// Embedding configuration
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

// Feature flag and env-based chat model mapping
const FEATURE_GPT5 = String(process.env.FEATURE_GPT5 || 'true').toLowerCase() === 'true'

// Canonical GPT-5 model configuration
export const FREE_CHAT_MODEL = 'gpt-5-mini'
export const PRO_CHAT_MODEL = 'gpt-5.1'
export const PRO_FALLBACK_MODEL = 'gpt-5-mini'
export const CLASSIFIER_MODEL = 'gpt-5-nano'

// Legacy GPT-4 fallbacks (only used when FEATURE_GPT5=false)
function legacyFallbackFree(): string {
  return process.env.FALLBACK_MODEL_FREE || 'gpt-4.1-nano'
}

function legacyFallbackPro(): string {
  return process.env.FALLBACK_MODEL_PRO || 'gpt-4o'
}

export const CHAT_MODELS = {
  free: process.env.CHAT_MODEL_FREE || (FEATURE_GPT5 ? FREE_CHAT_MODEL : legacyFallbackFree()),
  pro: process.env.CHAT_MODEL_PRO || (FEATURE_GPT5 ? PRO_CHAT_MODEL : legacyFallbackPro()),
  pro_byok: process.env.CHAT_MODEL_BYOK || 'user-provided',
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
    
    // GPT-5 models use max_completion_tokens instead of max_tokens
    // GPT-5 models only support default temperature (1), so we omit it
    const isGPT5 = model.startsWith('gpt-5')
    const completionParams: any = {
      model,
      messages,
    }
    
    // Only add temperature for non-GPT-5 models
    if (!isGPT5) {
      completionParams.temperature = 0.7
    }
    
    // Use appropriate token limit parameter
    if (isGPT5) {
      completionParams.max_completion_tokens = 1000
    } else {
      completionParams.max_tokens = 1000
    }
    
    const response = await client.chat.completions.create(completionParams)
    
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
  } catch (error: any) {
    console.error('Error generating chat completion:', error)
    
    // Extract error details
    const errorCode = error?.error?.code || error?.code
    const errorType = error?.error?.type || error?.type
    const errorParam = error?.error?.param || error?.param
    const errorMessage = error?.error?.message || error?.message || String(error)
    const status = error?.status || error?.statusCode
    
    console.error('[OpenAI] Error details:', {
      status,
      code: errorCode,
      type: errorType,
      param: errorParam,
      message: errorMessage
    })
    
    // Handle specific error types
    if (status === 400 && errorCode === 'unsupported_value') {
      throw new Error(`Invalid parameter for model "${model}": ${errorParam} - ${errorMessage}`)
    }
    
    if (status === 401 || errorMessage.includes('API key') || errorMessage.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key. Please check your API key configuration.')
    }
    
    if (status === 403 || errorMessage.includes('access')) {
      throw new Error(`Access denied to model "${model}". Please check your API access level.`)
    }
    
    if (status === 404 || errorCode === 'model_not_found') {
      throw new Error(`Model "${model}" not found. The model may have been renamed or deprecated.`)
    }
    
    if (status === 429 || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('OpenAI API quota or rate limit exceeded. Please check your billing and usage limits.')
    }
    
    throw new Error(`Failed to generate chat response: ${errorMessage}`)
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
    // GPT-5 models use max_completion_tokens instead of max_tokens
    // GPT-5 models only support default temperature (1), so we omit it
    const isGPT5 = model.startsWith('gpt-5')
    const streamParams: any = {
      model,
      messages,
      stream: true,
    }
    
    // Only add temperature for non-GPT-5 models
    if (!isGPT5) {
      streamParams.temperature = 0.7
    }
    
    // Use appropriate token limit parameter
    if (isGPT5) {
      streamParams.max_completion_tokens = 1000
    } else {
      streamParams.max_tokens = 1000
    }
    
    const stream = await client.chat.completions.create(streamParams)
    
    return stream
  } catch (error: any) {
    console.error('Error streaming chat completion:', error)
    
    // Extract error details
    const errorCode = error?.error?.code || error?.code
    const errorType = error?.error?.type || error?.type
    const errorParam = error?.error?.param || error?.param
    const errorMessage = error?.error?.message || error?.message || String(error)
    const status = error?.status || error?.statusCode
    
    console.error('[OpenAI] Stream error details:', {
      status,
      code: errorCode,
      type: errorType,
      param: errorParam,
      message: errorMessage
    })
    
    // Handle specific error types
    if (status === 400 && errorCode === 'unsupported_value') {
      throw new Error(`Invalid parameter for model "${model}": ${errorParam} - ${errorMessage}`)
    }
    
    if (status === 401 || errorMessage.includes('API key') || errorMessage.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key. Please check your API key configuration.')
    }
    
    if (status === 403 || errorMessage.includes('access')) {
      throw new Error(`Access denied to model "${model}". Please check your API access level.`)
    }
    
    if (status === 404 || errorCode === 'model_not_found') {
      throw new Error(`Model "${model}" not found. The model may have been renamed or deprecated.`)
    }
    
    if (status === 429 || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('OpenAI API quota or rate limit exceeded. Please check your billing and usage limits.')
    }
    
    throw new Error(`Failed to stream chat response: ${errorMessage}`)
  }
}
