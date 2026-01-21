/**
 * Model Execution with Fallback Logic
 * 
 * Implements the fallback semantics from the routing policy:
 * - Pro tier: GPT-5.1 → GPT-5-mini on specific errors
 * - Free tier: GPT-5-mini only (no fallback)
 * - Bounded retry logic (one retry max)
 */

import { Model } from './models'
import OpenAI from 'openai'

export interface ModelExecutionResult {
  content: string
  model: Model
  fallbackUsed: boolean
  fallbackReason?: string
  inputTokens?: number
  outputTokens?: number
}

export interface ModelExecutionError {
  code: string
  message: string
  shouldFallback: boolean
}

/**
 * Determine if an error should trigger fallback
 */
function shouldFallbackOnError(error: any): ModelExecutionError {
  const errorMessage = error?.message || String(error)
  const errorCode = error?.code || error?.status || 'unknown'
  
  // 404: Model not found (OpenAI renamed/deprecated)
  if (errorCode === 404 || errorMessage.includes('does not exist')) {
    return {
      code: '404_model_not_found',
      message: errorMessage,
      shouldFallback: true
    }
  }
  
  // 429: Rate limit on specific model
  if (errorCode === 429 || errorMessage.includes('rate limit')) {
    return {
      code: '429_rate_limit',
      message: errorMessage,
      shouldFallback: true
    }
  }
  
  // 5xx: Transient model error
  if (errorCode >= 500 && errorCode < 600) {
    return {
      code: `${errorCode}_server_error`,
      message: errorMessage,
      shouldFallback: true
    }
  }
  
  // Do NOT fallback on:
  // - 401: Invalid auth (fix the API key)
  // - 400: Bad request (fix the request)
  // - Safety refusal (that's a policy result, not a reliability issue)
  return {
    code: String(errorCode),
    message: errorMessage,
    shouldFallback: false
  }
}

/**
 * Execute model with fallback logic
 */
export async function executeModelWithFallback(
  primaryModel: Model,
  fallbackModel: Model | null,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  openaiClient: OpenAI,
  tier: string
): Promise<ModelExecutionResult> {
  console.log('[model-executor] Executing model:', {
    primaryModel,
    fallbackModel,
    tier,
    messageCount: messages.length
  })
  
  // Determine if model uses max_completion_tokens or max_tokens
  const isGPT5 = primaryModel.startsWith('gpt-5')
  const tokenParam = isGPT5 ? 'max_completion_tokens' : 'max_tokens'
  
  try {
    // Try primary model
    const response = await openaiClient.chat.completions.create({
      model: primaryModel,
      messages,
      temperature: 0.7,
      [tokenParam]: 1000,
    } as any)
    
    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from model')
    }
    
    console.log('[model-executor] Primary model succeeded:', {
      model: primaryModel,
      contentLength: content.length,
      usage: response.usage
    })
    
    return {
      content,
      model: primaryModel,
      fallbackUsed: false,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens
    }
  } catch (primaryError) {
    const errorAnalysis = shouldFallbackOnError(primaryError)
    
    console.error('[model-executor] Primary model failed:', {
      primaryModel,
      errorCode: errorAnalysis.code,
      shouldFallback: errorAnalysis.shouldFallback,
      fallbackAvailable: !!fallbackModel
    })
    
    // If no fallback available or error doesn't warrant fallback, throw
    if (!fallbackModel || !errorAnalysis.shouldFallback) {
      throw primaryError
    }
    
    // Try fallback model (one retry only)
    console.log('[model-executor] Attempting fallback:', {
      fallbackModel,
      reason: errorAnalysis.code
    })
    
    try {
      const isFallbackGPT5 = fallbackModel.startsWith('gpt-5')
      const fallbackTokenParam = isFallbackGPT5 ? 'max_completion_tokens' : 'max_tokens'
      
      const fallbackResponse = await openaiClient.chat.completions.create({
        model: fallbackModel,
        messages,
        temperature: 0.7,
        [fallbackTokenParam]: 1000,
      } as any)
      
      const content = fallbackResponse.choices[0]?.message?.content
      if (!content) {
        throw new Error('Empty response from fallback model')
      }
      
      console.log('[model-executor] Fallback model succeeded:', {
        fallbackModel,
        contentLength: content.length,
        usage: fallbackResponse.usage
      })
      
      return {
        content,
        model: fallbackModel,
        fallbackUsed: true,
        fallbackReason: errorAnalysis.code,
        inputTokens: fallbackResponse.usage?.prompt_tokens,
        outputTokens: fallbackResponse.usage?.completion_tokens
      }
    } catch (fallbackError) {
      console.error('[model-executor] Fallback model also failed:', {
        fallbackModel,
        error: fallbackError
      })
      
      // Both models failed - throw the fallback error
      throw fallbackError
    }
  }
}

/**
 * Get fallback model for a given primary model and tier
 */
export function getFallbackModel(primaryModel: Model, tier: string): Model | null {
  // Free tier: no fallback (keep it simple, cheap, predictable)
  if (tier === 'free') {
    return null
  }
  
  // Pro tier: GPT-5.1 → GPT-5-mini
  if (tier === 'pro' && primaryModel === Model.GPT_5_1) {
    return Model.GPT_5_MINI
  }
  
  // Accuracy tier: GPT-5.2 → GPT-5.1, GPT-5.1 → GPT-5-mini
  if (tier === 'accuracy') {
    if (primaryModel === Model.GPT_5_2) {
      return Model.GPT_5_1
    }
    if (primaryModel === Model.GPT_5_1) {
      return Model.GPT_5_MINI
    }
  }
  
  // No fallback for other cases
  return null
}
