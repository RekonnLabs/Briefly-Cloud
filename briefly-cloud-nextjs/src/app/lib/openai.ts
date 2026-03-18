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

// ─── Chat model configuration ────────────────────────────────────────────────
// Defaults verified against OpenAI pricing page March 2026.
// Override via Vercel env vars — no code deploy needed to swap models.
//
//   CHAT_MODEL_PRO   default: gpt-5.4-mini  ($0.75/$4.50 per 1M tokens)
//   CHAT_MODEL_FREE  default: gpt-5.4-nano  ($0.20/$1.25 per 1M tokens)
//   CHAT_MODEL_BOOST default: gpt-5.4       ($2.50/$15.00 per 1M tokens)
//   CHAT_MODEL_BYOK  default: user-provided
// ─────────────────────────────────────────────────────────────────────────────
export const FREE_CHAT_MODEL      = 'gpt-5-nano'
export const PRO_CHAT_MODEL       = 'gpt-5-mini'
export const BOOST_CHAT_MODEL     = 'gpt-5'
export const CLASSIFIER_MODEL     = 'gpt-5-nano'

export const CHAT_MODELS = {
  free:     process.env.CHAT_MODEL_FREE  || FREE_CHAT_MODEL,
  pro:      process.env.CHAT_MODEL_PRO   || PRO_CHAT_MODEL,
  pro_byok: process.env.CHAT_MODEL_BYOK  || 'user-provided',
  boost:    process.env.CHAT_MODEL_BOOST || BOOST_CHAT_MODEL,
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
// Rich response from generateChatCompletion — includes usage + traceability
export interface ChatCompletionResult {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  openai_request_id: string | null
  model: string
  system_fingerprint: string | null
}

export async function generateChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string,
  explicitModel?: string // NEW: Allow explicit model override from router
): Promise<ChatCompletionResult> {
  console.log('[OpenAI] generateChatCompletion ENTERED', {
    tier,
    messageCount: messages.length,
    hasUserApiKey: !!userApiKey,
    hasEnvApiKey: !!process.env.OPENAI_API_KEY,
    explicitModel
  })
  
  // Validate API key availability
  if (!process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.')
  }

  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  // Use explicit model from router if provided, otherwise fall back to tier-based resolution
  const model = explicitModel || resolveChatModel(tier)
  
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
      hasContent: !!response.choices[0]?.message?.content,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      requestId: response.id,
      systemFingerprint: response.system_fingerprint
    })
    
    const content = response.choices[0]?.message?.content
    if (!content || content.trim().length === 0) {
      console.error('[OpenAI] Empty response received!', {
        response: JSON.stringify(response, null, 2)
      })
      return {
        content: 'No response generated',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        openai_request_id: response.id || null,
        model: response.model || model,
        system_fingerprint: response.system_fingerprint || null
      }
    }
    
    return {
      content,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0
      },
      openai_request_id: response.id || null,
      model: response.model || model,
      system_fingerprint: response.system_fingerprint || null
    }
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

// Stream chat completion with real SSE token delivery
// onToken callback fires for each content token as it arrives
// Returns ChatCompletionResult with actual usage after stream completes
export async function streamChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string,
  modelOverride?: string,
  onToken?: (token: string) => void
): Promise<ChatCompletionResult> {
  // Validate API key availability
  if (!process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.')
  }

  const client = userApiKey ? createUserOpenAIClient(userApiKey) : openai
  const model = modelOverride || resolveChatModel(tier)
  
  try {
    // GPT-5 models use max_completion_tokens instead of max_tokens
    // GPT-5 models only support default temperature (1), so we omit it
    const isGPT5 = model.startsWith('gpt-5')
    const streamParams: any = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },  // get usage in final chunk
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
    
    let fullContent = ''
    let finalModel = model
    let systemFingerprint: string | null = null
    let requestId: string | null = null
    let promptTokens = 0
    let completionTokens = 0
    let totalTokens = 0

    for await (const chunk of stream) {
      // Capture request ID from first chunk
      if (!requestId && chunk.id) requestId = chunk.id
      if (chunk.model) finalModel = chunk.model
      if (chunk.system_fingerprint) systemFingerprint = chunk.system_fingerprint

      // Accumulate usage from final chunk (stream_options: include_usage)
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens
        completionTokens = chunk.usage.completion_tokens ?? completionTokens
        totalTokens = chunk.usage.total_tokens ?? totalTokens
      }

      const token = chunk.choices[0]?.delta?.content
      if (token) {
        fullContent += token
        onToken?.(token)
      }
    }

    if (!fullContent || fullContent.trim().length === 0) {
      console.error('[OpenAI] Empty stream response received')
      return {
        content: 'No response generated',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        openai_request_id: requestId,
        model: finalModel,
        system_fingerprint: systemFingerprint
      }
    }

    return {
      content: fullContent,
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
      openai_request_id: requestId,
      model: finalModel,
      system_fingerprint: systemFingerprint
    }

  } catch (error: any) {
    console.error('Error streaming chat completion:', error)
    
    // Extract error details
    const errorCode = error?.error?.code || error?.code
    const errorParam = error?.error?.param || error?.param
    const errorMessage = error?.error?.message || error?.message || String(error)
    const status = error?.status || error?.statusCode
    
    console.error('[OpenAI] Stream error details:', { status, code: errorCode, param: errorParam, message: errorMessage })
    
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
