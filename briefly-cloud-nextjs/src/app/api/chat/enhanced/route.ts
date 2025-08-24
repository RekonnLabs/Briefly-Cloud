/**
 * Enhanced Chat API with Feature Flag Integration
 * 
 * Example of how to integrate feature flags into API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
// Feature flags removed for MVP
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier } from '@/app/lib/openai'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { withApiPerformanceMonitoring } from '@/app/lib/performance'

// Briefly Voice v1 imports
import { buildMessages, type ContextSnippet } from '@/lib/prompt/promptBuilder'
import { BUDGETS } from '@/lib/prompt/budgets'
import { enforce as lintResponse } from '@/lib/prompt/responseLinter'
import { routeModel, analyzeQuery, getModelConfig, type UserTier } from '@/lib/prompt/modelRouter'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  useAdvancedFeatures: z.boolean().optional().default(false),
  boost: z.boolean().optional().default(false),
})

async function enhancedChatHandler(request: NextRequest, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({}))
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { message, conversationId, stream, useAdvancedFeatures, boost } = parsed.data

  // Get feature flag results from middleware
  const featureFlagResult = getFeatureFlagResult(request)
  const isStreamingEnabled = featureFlagResult?.enabled || false
  const streamingConfig = featureFlagResult?.config || {}

  const supabase = supabaseAdmin
  const startTime = Date.now()

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
      // Use enhanced search parameters with new vector search
      const { searchDocuments } = await import('@/app/lib/vector/document-processor')
      contextResults = await withApiPerformanceMonitoring(() =>
        searchDocuments(user.id, message, {
          limit: Math.min(8, BUDGETS.TOP_K + 2), // More results with advanced chunking, but respect budgets
          threshold: 0.6, // Lower threshold for better recall
        })
      )
    } else {
      // Standard search with new vector search
      const { searchDocuments } = await import('@/app/lib/vector/document-processor')
      contextResults = await withApiPerformanceMonitoring(() =>
        searchDocuments(user.id, message, {
          limit: BUDGETS.TOP_K,
          threshold: 0.7,
        })
      )
    }
  } else {
    // Standard search
    contextResults = await withApiPerformanceMonitoring(() =>
      searchDocumentContext(message, user.id, {
        limit: BUDGETS.TOP_K,
        threshold: 0.7,
      })
    )
  }

  // Convert context to Briefly Voice format
  const contextSnippets: ContextSnippet[] = contextResults.map(r => ({
    content: r.content,
    source: `${r.fileName} #${r.chunkIndex}`,
    relevance: r.relevanceScore || r.similarity
  }))

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
  
  // Get conversation history summary
  let historySummary: string | undefined
  if (convoId) {
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: false })
      .limit(4)
    
    if (recentMessages && recentMessages.length > 0) {
      historySummary = recentMessages
        .reverse()
        .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
        .join(' | ')
    }
  }

  // Analyze query and route to appropriate model
  const tier = (user.subscription_tier || 'free') as UserTier
  const toolsUsed = functionCallingResult.enabled ? ['function_calling'] : []
  const routingSignals = analyzeQuery(message, contextSnippets, toolsUsed)
  
  const routing = routeModel(tier, boost, routingSignals)
  const modelConfig = getModelConfig(routing.model)

  // Build enhanced task description
  let developerTask = "Answer the user's question using the provided context. Be helpful and cite sources when referencing documents."
  if (useAdvancedFeatures) {
    developerTask += " Use advanced analysis and provide comprehensive insights."
  }
  if (functionCallingResult.enabled) {
    developerTask += " You can use function calling for additional data retrieval if needed."
  }

  const developerShape = "Format: Direct answer, detailed analysis as bullets, actionable next steps with specific recommendations."

  // Build messages using Briefly Voice v1
  const messages = buildMessages({
    developerTask,
    developerShape,
    toolsUsed,
    contextSnippets: contextSnippets.slice(0, BUDGETS.TOP_K), // Respect budget
    historySummary,
    userMessage: message
  })

  // Generate response using routed model
  let rawResponse: string
  
  // Use streaming if feature flag is enabled and requested
  if (stream && isStreamingEnabled) {
    const streamResp = await withApiPerformanceMonitoring(() =>
      streamChatCompletion(messages as any, tier)
    )
    
    // Collect streaming response for linting
    let collectedResponse = ''
    for await (const chunk of streamResp) {
      const content = typeof chunk === 'string' ? chunk : chunk.choices?.[0]?.delta?.content || ''
      collectedResponse += content
    }
    rawResponse = collectedResponse
  } else {
    // Non-streaming response
    rawResponse = await withApiPerformanceMonitoring(() =>
      generateChatCompletion(messages as any, tier)
    )
  }

  // Apply Briefly Voice linting
  const lintResult = lintResponse(rawResponse)
  const finalResponse = lintResult.output

  // Calculate metrics
  const latency = Date.now() - startTime
  const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
  const outputTokens = Math.ceil(finalResponse.length / 4)

  // Log enhanced telemetry
  console.log('Enhanced chat completion telemetry:', {
    modelRoute: routing.model,
    inputTokens,
    outputTokens,
    latency,
    contextCount: contextSnippets.length,
    linterApplied: lintResult.rewritten,
    boost,
    tier,
    useAdvancedFeatures,
    functionCallingEnabled: functionCallingResult.enabled,
    streamingEnabled: isStreamingEnabled,
    userId: user.id
  })

  // Save assistant response with enhanced metadata
  if (convoId) {
    await supabase
      .from('chat_messages')
      .insert({ 
        conversation_id: convoId, 
        role: 'assistant', 
        content: finalResponse, 
        sources: contextResults.map(r => ({ 
          file_id: r.fileId, 
          file_name: r.fileName, 
          chunk_index: r.chunkIndex, 
          relevance_score: r.relevanceScore || r.similarity 
        })),
        metadata: {
          modelRoute: routing.model,
          inputTokens,
          outputTokens,
          latency,
          linterApplied: lintResult.rewritten,
          feature_flags_used: {
            streaming: isStreamingEnabled,
            advanced_chunking: useAdvancedFeatures,
            function_calling: functionCallingResult.enabled,
          }
        }
      })
  }

  if (stream && isStreamingEnabled) {
    // Return linted response as stream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(finalResponse))
        controller.close()
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Feature-Streaming': 'enabled',
        'X-Feature-Variant': featureFlagResult?.variant || 'default',
        'X-Model-Route': routing.model,
      },
    })
  }

  return ApiResponse.success({
    conversation_id: convoId,
    response: finalResponse,
    sources: contextResults,
    modelRoute: routing.model,
    routing: {
      model: routing.model,
      reason: routing.reason,
      estimatedCost: routing.estimatedCost
    },
    feature_info: {
      streaming_available: isStreamingEnabled,
      advanced_features_used: useAdvancedFeatures,
      function_calling_enabled: functionCallingResult.enabled,
    },
    telemetry: {
      inputTokens,
      outputTokens,
      latency,
      contextCount: contextSnippets.length,
      linterApplied: lintResult.rewritten
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