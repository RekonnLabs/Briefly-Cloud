/**
 * Enhanced Chat API with Feature Flag Integration
 * 
 * Example of how to integrate feature flags into API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { withFeatureFlagAPI, getFeatureFlagResult } from '@/app/lib/feature-flag-middleware'
import { FEATURE_FLAGS } from '@/app/lib/feature-flags'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier } from '@/app/lib/openai'
import { createClient } from '@supabase/supabase-js'
import { withApiPerformanceMonitoring } from '@/app/lib/performance'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  useAdvancedFeatures: z.boolean().optional().default(false),
})

async function enhancedChatHandler(request: NextRequest, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({}))
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { message, conversationId, stream, useAdvancedFeatures } = parsed.data

  // Get feature flag results from middleware
  const featureFlagResult = getFeatureFlagResult(request)
  const isStreamingEnabled = featureFlagResult?.enabled || false
  const streamingConfig = featureFlagResult?.config || {}

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

  // Prepare conversation
  let convoId = conversationId
  if (!convoId) {
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select('id')
      .single()
    convoId = data?.id
  }

  // Save user message
  if (convoId) {
    await supabase
      .from('chat_messages')
      .insert({ conversation_id: convoId, role: 'user', content: message })
  }

  // Enhanced vector search with feature flag
  let contextResults
  if (useAdvancedFeatures) {
    // Check if advanced chunking is enabled for this user
    const advancedChunkingResponse = await fetch(`${request.nextUrl.origin}/api/feature-flags/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({
        feature_name: FEATURE_FLAGS.ADVANCED_CHUNKING
      })
    })

    const advancedChunkingResult = await advancedChunkingResponse.json()
    
    if (advancedChunkingResult.enabled) {
      // Use enhanced search parameters
      contextResults = await withApiPerformanceMonitoring(() =>
        searchDocumentContext(message, user.id, {
          limit: 8, // More results with advanced chunking
          threshold: 0.6, // Lower threshold for better recall
          useSemanticReranking: true, // Advanced feature
        })
      )
    } else {
      // Standard search
      contextResults = await withApiPerformanceMonitoring(() =>
        searchDocumentContext(message, user.id, {
          limit: 5,
          threshold: 0.7,
        })
      )
    }
  } else {
    // Standard search
    contextResults = await withApiPerformanceMonitoring(() =>
      searchDocumentContext(message, user.id, {
        limit: 5,
        threshold: 0.7,
      })
    )
  }

  const contextText = contextResults
    .map((r, i) => `Source ${i + 1} [${r.fileName} #${r.chunkIndex} | score=${r.relevanceScore.toFixed(2)}]\n${r.content}`)
    .join('\n\n')

  // Enhanced system prompt based on feature flags
  let systemPrompt = `You are Briefly, an AI assistant. Use the provided document context when relevant.\n\nContext:\n${contextText || 'No relevant context found.'}\n\nIf the context is insufficient, say so explicitly. Cite filenames when referencing sources.`

  // Check for function calling feature
  const functionCallingResponse = await fetch(`${request.nextUrl.origin}/api/feature-flags/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': request.headers.get('Authorization') || '',
    },
    body: JSON.stringify({
      feature_name: FEATURE_FLAGS.FUNCTION_CALLING
    })
  })

  const functionCallingResult = await functionCallingResponse.json()
  
  if (functionCallingResult.enabled) {
    systemPrompt += `\n\nYou have access to function calling capabilities. You can perform actions like searching for specific information, analyzing data, or retrieving additional context when needed.`
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ] as any

  const tier = (user.subscription_tier || 'free') as SubscriptionTier

  // Use streaming if feature flag is enabled and requested
  if (stream && isStreamingEnabled) {
    const streamResp = await withApiPerformanceMonitoring(() =>
      streamChatCompletion(messages, tier, {
        // Apply streaming configuration from feature flag
        temperature: streamingConfig.temperature || 0.7,
        maxTokens: streamingConfig.maxTokens || 1000,
        enableFunctionCalling: functionCallingResult.enabled,
      })
    )
    
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResp) {
            const chunkData = typeof chunk === 'string' ? chunk : String(chunk)
            controller.enqueue(encoder.encode(chunkData))
          }
        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(encoder.encode('\n\n[Error: Stream interrupted]'))
        } finally {
          controller.close()
        }
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Feature-Streaming': 'enabled',
        'X-Feature-Variant': featureFlagResult?.variant || 'default',
      },
    })
  }

  // Non-streaming response
  const completion = await withApiPerformanceMonitoring(() =>
    generateChatCompletion(messages, tier, {
      enableFunctionCalling: functionCallingResult.enabled,
    })
  )

  if (convoId) {
    await supabase
      .from('chat_messages')
      .insert({ 
        conversation_id: convoId, 
        role: 'assistant', 
        content: completion, 
        sources: contextResults.map(r => ({ 
          file_id: r.fileId, 
          file_name: r.fileName, 
          chunk_index: r.chunkIndex, 
          relevance_score: r.relevanceScore 
        })),
        metadata: {
          feature_flags_used: {
            streaming: isStreamingEnabled,
            advanced_chunking: useAdvancedFeatures,
            function_calling: functionCallingResult.enabled,
          }
        }
      })
  }

  return ApiResponse.success({
    conversation_id: convoId,
    response: completion,
    sources: contextResults,
    feature_info: {
      streaming_available: isStreamingEnabled,
      advanced_features_used: useAdvancedFeatures,
      function_calling_enabled: functionCallingResult.enabled,
    }
  })
}

// Wrap the handler with feature flag middleware for streaming responses
export const POST = withFeatureFlagAPI(
  FEATURE_FLAGS.STREAMING_RESPONSES,
  createProtectedApiHandler(enhancedChatHandler, {
    rateLimit: rateLimitConfigs.chat,
    logging: { enabled: true, includeBody: true },
  }),
  {
    requireAuth: true,
    fallbackMessage: 'Enhanced chat features are not available for your account tier.'
  }
)