import OpenAI from 'openai'

// ─────────────────────────────────────────────────────────────────────────────
// Provider detection
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the model should be served via Groq's LPU inference API */
function isGroqModel(model: string): boolean {
  // openai/gpt-oss-120b is hosted on Groq despite the "openai/" prefix
  return model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma') || model.startsWith('openai/')
}

/** Returns true if the model is in the GPT-5 family (affects token param name) */
function isGPT5Model(model: string): boolean {
  return model.startsWith('gpt-5')
}

// ─────────────────────────────────────────────────────────────────────────────
// Client factories
// ─────────────────────────────────────────────────────────────────────────────

// Default OpenAI client — lazy initialization
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

// Groq client — OpenAI-compatible API, purpose-built LPU hardware
// Delivers ~280 tokens/sec on Llama 3.3 70B vs ~60 tok/sec from OpenAI
let _groq: OpenAI | null = null
function getGroqClient(): OpenAI {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured. Add it to Vercel environment variables.')
    }
    _groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }
  return _groq
}

// BYOK: user-supplied OpenAI key
export function createUserOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    project: process.env.OPENAI_PROJECT_ID,
  })
}

/** Return the correct inference client for a given model */
function getClientForModel(model: string, userApiKey?: string): OpenAI {
  if (userApiKey) return createUserOpenAIClient(userApiKey)
  if (isGroqModel(model)) return getGroqClient()
  return openai
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding configuration — Gemini Embedding 2 (SPEC 4 migration)
// ─────────────────────────────────────────────────────────────────────────────
export const EMBEDDING_MODEL = 'gemini-embedding-2-preview'
export const EMBEDDING_DIMENSIONS = 1536

// ─────────────────────────────────────────────────────────────────────────────
// Chat model configuration
// Override via Vercel env vars — no code deploy needed to swap models.
//
//   CHAT_MODEL_PRO   default: llama-3.3-70b-versatile  (Groq — ~394 TPS)
//   CHAT_MODEL_FREE  default: llama-3.1-8b-instant     (Groq — ~840 TPS, free/trial tier)
//   CHAT_MODEL_BOOST default: openai/gpt-oss-120b      (Groq — ~500 TPS, $0.15/$0.60 per 1M)
//
// Groq pricing: $0.59/$0.79 per 1M (Llama 3.3 70B), $0.05/$0.08 (Llama 3.1 8B), $0.15/$0.60 (gpt-oss-120b)
// Embeddings use Gemini Embedding 2 (gemini-embedding-2-preview) — SPEC 4 migration.
// ─────────────────────────────────────────────────────────────────────────────
export const FREE_CHAT_MODEL  = 'llama-3.1-8b-instant'    // Groq LPU — ~840 TPS
export const PRO_CHAT_MODEL   = 'llama-3.3-70b-versatile' // Groq LPU — ~394 TPS
export const BOOST_CHAT_MODEL = 'openai/gpt-oss-120b'     // Groq — ~500 TPS, $0.15/$0.60
export const CLASSIFIER_MODEL = 'llama-3.1-8b-instant'    // fast + cheap for classification

export const CHAT_MODELS = {
  free:     process.env.CHAT_MODEL_FREE  || FREE_CHAT_MODEL,
  pro:      process.env.CHAT_MODEL_PRO   || PRO_CHAT_MODEL,
  pro_byok: process.env.CHAT_MODEL_BYOK  || 'user-provided',
  boost:    process.env.CHAT_MODEL_BOOST || BOOST_CHAT_MODEL,
} as const

export type SubscriptionTier = keyof typeof CHAT_MODELS

export function resolveChatModel(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free':     return CHAT_MODELS.free
    case 'pro':      return CHAT_MODELS.pro
    case 'pro_byok': return CHAT_MODELS.pro_byok
    default:         return CHAT_MODELS.free
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Embeddings — Gemini Embedding 2 (SPEC 4 migration)
// Uses question-answering task prefix for query-side calls (conversationMemory).
// ─────────────────────────────────────────────────────────────────────────────
export async function generateEmbeddings(
  texts: string[],
  _userApiKey?: string  // BYOK not supported for Gemini embedding; system key used
): Promise<number[][]> {
  const { GoogleGenAI } = await import('@google/genai')
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  try {
    const results: number[][] = []
    for (const text of texts) {
      const res = await genai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: `task: question answering | query: ${text}`,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      })
      results.push(res.embeddings![0].values!)
    }
    return results
  } catch (error) {
    console.error('Error generating embeddings:', error)
    throw new Error('Failed to generate embeddings')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat completion result type
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Build completion params — handles provider differences
//
// GPT-5 (OpenAI):  max_completion_tokens, no temperature
// Groq (Llama):    max_tokens, temperature supported
// Other OpenAI:    max_tokens, temperature supported
// ─────────────────────────────────────────────────────────────────────────────
function buildCompletionParams(model: string, messages: any[], maxTokens: number, stream: boolean): any {
  const groq = isGroqModel(model)
  const gpt5 = isGPT5Model(model)

  const params: any = { model, messages }

  // Token limit — GPT-5 uses max_completion_tokens, everything else uses max_tokens
  if (gpt5) {
    params.max_completion_tokens = maxTokens
  } else {
    params.max_tokens = maxTokens
    params.temperature = 0.7
  }

  if (stream) {
    params.stream = true
    // stream_options with include_usage is OpenAI-only — Groq doesn't support it
    if (!groq) {
      params.stream_options = { include_usage: true }
    }
  }

  return params
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming chat completion
// ─────────────────────────────────────────────────────────────────────────────
export async function generateChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string,
  explicitModel?: string,
  maxTokens: number = 2000
): Promise<ChatCompletionResult> {
  const model = explicitModel || resolveChatModel(tier)
  const client = getClientForModel(model, userApiKey)
  const provider = isGroqModel(model) ? 'groq' : 'openai'

  // API key validation
  if (!isGroqModel(model) && !process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured.')
  }
  if (isGroqModel(model) && !process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured. Add it to Vercel environment variables.')
  }

  console.log('[LLM] generateChatCompletion', { provider, model, tier, maxTokens, messageCount: messages.length })

  try {
    const params = buildCompletionParams(model, messages as any, maxTokens, false)
    const response = await client.chat.completions.create(params)
    const content = response.choices[0]?.message?.content

    if (!content || content.trim().length === 0) {
      console.error('[LLM] Empty response', { provider, model })
      return {
        content: 'No response generated',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        openai_request_id: response.id || null,
        model: response.model || model,
        system_fingerprint: (response as any).system_fingerprint || null
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
      system_fingerprint: (response as any).system_fingerprint || null
    }
  } catch (error: any) {
    handleLLMError(error, model, provider)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming chat completion
// ─────────────────────────────────────────────────────────────────────────────
export async function streamChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: SubscriptionTier,
  userApiKey?: string,
  modelOverride?: string,
  onToken?: (token: string) => void,
  maxTokens: number = 2000
): Promise<ChatCompletionResult> {
  const model = modelOverride || resolveChatModel(tier)
  const client = getClientForModel(model, userApiKey)
  const groq = isGroqModel(model)
  const provider = groq ? 'groq' : 'openai'

  // API key validation
  if (!groq && !process.env.OPENAI_API_KEY && !userApiKey) {
    throw new Error('OpenAI API key not configured.')
  }
  if (groq && !process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured. Add it to Vercel environment variables.')
  }

  console.log('[LLM] streamChatCompletion', { provider, model, tier, maxTokens, messageCount: messages.length })

  try {
    const params = buildCompletionParams(model, messages as any, maxTokens, true)
    const stream = await client.chat.completions.create(params)

    let fullContent = ''
    let finalModel = model
    let systemFingerprint: string | null = null
    let requestId: string | null = null
    let promptTokens = 0
    let completionTokens = 0
    let totalTokens = 0

    for await (const chunk of stream as any) {
      if (!requestId && chunk.id) requestId = chunk.id
      if (chunk.model) finalModel = chunk.model
      if (chunk.system_fingerprint) systemFingerprint = chunk.system_fingerprint

      // Usage in final chunk — OpenAI only (stream_options: include_usage)
      // Groq doesn't send this chunk so this block simply never fires for Groq
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens
        completionTokens = chunk.usage.completion_tokens ?? completionTokens
        totalTokens = chunk.usage.total_tokens ?? totalTokens
      }

      const token = chunk.choices?.[0]?.delta?.content
      if (token) {
        fullContent += token
        onToken?.(token)
      }
    }

    if (!fullContent || fullContent.trim().length === 0) {
      console.error('[LLM] Empty stream response', { provider, model })
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
    handleLLMError(error, model, provider)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared error handler — normalizes OpenAI and Groq error shapes
// ─────────────────────────────────────────────────────────────────────────────
function handleLLMError(error: any, model: string, provider: string): never {
  const errorCode = error?.error?.code || error?.code
  const errorParam = error?.error?.param || error?.param
  const errorMessage = error?.error?.message || error?.message || String(error)
  const status = error?.status || error?.statusCode

  console.error(`[LLM] ${provider} error`, { status, code: errorCode, param: errorParam, message: errorMessage, model })

  if (status === 400 && errorCode === 'unsupported_value') {
    throw new Error(`Invalid parameter for model "${model}": ${errorParam} — ${errorMessage}`)
  }
  if (status === 401 || errorMessage.includes('API key') || errorMessage.includes('Incorrect API key')) {
    throw new Error(`Invalid ${provider} API key. Please check your configuration.`)
  }
  if (status === 403 || errorMessage.includes('access')) {
    throw new Error(`Access denied to model "${model}". Please check your API access level.`)
  }
  if (status === 404 || errorCode === 'model_not_found') {
    throw new Error(`Model "${model}" not found on ${provider}. It may have been renamed or deprecated.`)
  }
  if (status === 429 || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
    throw new Error(`${provider} rate limit or quota exceeded. Please check your billing and usage limits.`)
  }
  throw new Error(`Failed to generate chat response via ${provider}: ${errorMessage}`)
}
