export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier } from '@/app/lib/openai'
import { supabaseApp } from '@/app/lib/supabase-clients'
import { usersRepo } from '@/app/lib/repos/users-repo'
import { chunksRepo } from '@/app/lib/repos/chunks-repo'
import { cacheManager, CACHE_KEYS } from '@/app/lib/cache'
import { withPerformanceMonitoring, withApiPerformanceMonitoring } from '@/app/lib/stubs/performance'
import { logReq, logErr } from '@/app/lib/server/log'
import { handleSchemaError, logSchemaError, extractSchemaContext, withSchemaErrorHandling } from '@/app/lib/errors/schema-errors'

// Briefly Voice v1 imports
import { buildMessages, buildDeveloper, type ContextSnippet } from '@/app/lib/prompt/promptBuilder'
import { BUDGETS, getBudgetForTier, type ChatBudget } from '@/app/lib/prompt/budgets'
import { enforce as lintResponse } from '@/app/lib/prompt/responseLinter'
import { routeModel, analyzeQuery, getModelConfig, type UserTier } from '@/app/lib/prompt/modelRouter'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  boost: z.boolean().optional().default(false),
})

async function chatHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  const rid = logReq({ route: '/api/chat', method: 'POST', userId: user?.id })
  
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ApiResponse.badRequest('Invalid JSON payload')
  }

  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { message, conversationId, stream, boost } = parsed.data

  try {
    const startTime = Date.now()

    // Get user profile from app schema to determine tier
    const userProfile = await withSchemaErrorHandling(
      () => usersRepo.getById(user.id),
      {
        schema: 'app',
        operation: 'get_user_profile',
        table: 'users',
        userId: user.id,
        correlationId: rid,
        ...extractSchemaContext(request, 'get_user_profile', 'app', 'users')
      }
    )
    if (!userProfile) {
      return ApiResponse.unauthorized('User profile not found')
    }

    // Prepare conversation in app schema
    let convoId = conversationId
    if (!convoId) {
      const { data } = await withSchemaErrorHandling(
        () => supabaseApp
          .from('conversations')
          .insert({ user_id: user.id, title: message.slice(0, 80) })
          .select('id')
          .single(),
        {
          schema: 'app',
          operation: 'create_conversation',
          table: 'conversations',
          userId: user.id,
          correlationId: rid,
          ...extractSchemaContext(request, 'create_conversation', 'app', 'conversations')
        }
      )
      convoId = data?.id
    }

    // Save user message in app schema
    if (convoId) {
      await withSchemaErrorHandling(
        () => supabaseApp
          .from('chat_messages')
          .insert({ conversation_id: convoId, user_id: user.id, role: 'user', content: message }),
        {
          schema: 'app',
          operation: 'save_user_message',
          table: 'chat_messages',
          userId: user.id,
          correlationId: rid,
          ...extractSchemaContext(request, 'save_user_message', 'app', 'chat_messages')
        }
      )
    }

    // Get budget based on user tier from app schema
    const tier = userProfile.subscription_tier as UserTier
  const budgetType = getBudgetForTier(tier)
  const budget = BUDGETS[budgetType]

  // Enhanced context retrieval with guardrails
  const { getContextWithFallback, generateNeedMoreInfoResponse } = await import('@/app/lib/prompt/context-retrieval')
  const contextResult = await withApiPerformanceMonitoring(() =>
    getContextWithFallback(user.id, message, budget)
  )

  const { contextSnippets, shouldUseNeedMoreInfo, retrievalStats } = contextResult
  const safeContextSnippets = Array.isArray(contextSnippets) ? contextSnippets : []

  // If we should use "need more info" response, return early
  if (shouldUseNeedMoreInfo) {
    const needMoreInfoResponse = generateNeedMoreInfoResponse(message)
    
    // Save assistant message in app schema
    if (convoId) {
      await withSchemaErrorHandling(
        () => supabaseApp
          .from('chat_messages')
          .insert({ 
            conversation_id: convoId,
            user_id: user.id,
            role: 'assistant', 
            content: needMoreInfoResponse,
            sources: [],
            metadata: {
              needMoreInfo: true,
              retrievalStats,
              modelRoute: 'need-more-info'
            }
          }),
        {
          schema: 'app',
          operation: 'save_assistant_message',
          table: 'chat_messages',
          userId: user.id,
          correlationId: rid,
          ...extractSchemaContext(request, 'save_assistant_message', 'app', 'chat_messages')
        }
      )
    }

    return ApiResponse.success({
      conversation_id: convoId,
      response: needMoreInfoResponse,
      sources: [],
      modelRoute: 'need-more-info',
      routing: {
        model: 'need-more-info',
        reason: 'insufficient context',
        estimatedCost: 0
      },
      telemetry: {
        inputTokens: 0,
        outputTokens: Math.ceil(needMoreInfoResponse.length / 4),
        latency: Date.now() - startTime,
        contextCount: 0,
        needMoreInfo: true,
        retrievalStats
      }
    })
  }

  // Get conversation history summary from app schema
  let historySummary: string | undefined
  if (convoId) {
    const { data: recentMessages } = await withSchemaErrorHandling(
      () => supabaseApp
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', convoId)
        .eq('user_id', user.id) // Ensure user isolation
        .order('created_at', { ascending: false })
        .limit(4), // Last 2 exchanges
      {
        schema: 'app',
        operation: 'get_conversation_history',
        table: 'chat_messages',
        userId: user.id,
        correlationId: rid,
        ...extractSchemaContext(request, 'get_conversation_history', 'app', 'chat_messages')
      }
    )
    
    if (recentMessages && recentMessages.length > 0) {
      historySummary = recentMessages
        .reverse()
        .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
        .join(' | ')
    }
  }
  
  // Analyze query for routing signals
  const routingSignals = analyzeQuery(message, safeContextSnippets, [])
  
  // Route to appropriate model
  const routing = routeModel(tier, boost, routingSignals)
  const modelConfig = getModelConfig(routing.model)

  // Build messages using Briefly Voice v1
  const developerTask = "Answer the user's question using the provided context. Be helpful and cite sources when referencing documents."
  const developerShape = "Format: Direct answer, key points as bullets, actionable next steps."
  
  const messages = buildMessages({
    developerTask,
    developerShape,
    safeContextSnippets,
    historySummary,
    userMessage: message
  })

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(msg => msg && typeof msg.content === 'string' && typeof msg.role === 'string')) {
    console.error('Invalid chat message payload', {
      userId: user.id,
      conversationId: convoId,
    })
    return ApiResponse.internalError('Failed to prepare chat messages')
  }

  // Generate response using routed model
  // Note: Currently using non-streaming mode for both cases to avoid streaming complexity
  // TODO: Implement proper streaming response when stream=true
  console.log('[chat-handler] About to call generateChatCompletion', {
    tier,
    messageCount: messages.length,
    model: routing.model
  })
  
  const rawResponse = await withApiPerformanceMonitoring(() =>
    generateChatCompletion(messages as any, tier)
  )
  
  console.log('[chat-handler] generateChatCompletion returned', {
    responseLength: rawResponse?.length || 0,
    hasContent: !!rawResponse
  })

  // Apply Briefly Voice linting
  const lintResult = lintResponse(rawResponse)
  const finalResponse = lintResult.output

  // Calculate metrics
  const latency = Date.now() - startTime
  const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
  const outputTokens = Math.ceil(finalResponse.length / 4)

  // Log telemetry
  console.log('Chat completion telemetry:', {
    modelRoute: routing.model,
    inputTokens,
    outputTokens,
    latency,
    contextCount: safeContextSnippets.length,
    linterApplied: lintResult.rewritten,
    boost,
    tier,
    userId: user.id,
    retrievalStats
  })

  // Save assistant response in app schema
  if (convoId) {
    await withSchemaErrorHandling(
      () => supabaseApp
        .from('chat_messages')
        .insert({ 
          conversation_id: convoId,
          user_id: user.id,
          role: 'assistant', 
          content: finalResponse, 
          sources: safeContextSnippets.map(snippet => ({ 
            source: snippet.source,
            content: snippet.content.substring(0, 200), // Truncate for storage
            relevance_score: snippet.relevance 
          })),
          metadata: {
            modelRoute: routing.model,
            inputTokens,
            outputTokens,
            latency,
            linterApplied: lintResult.rewritten,
            retrievalStats
          }
        }),
      {
        schema: 'app',
        operation: 'save_final_assistant_message',
        table: 'chat_messages',
        userId: user.id,
        correlationId: rid,
        ...extractSchemaContext(request, 'save_final_assistant_message', 'app', 'chat_messages')
      }
    )
  }

  if (stream) {
    // For streaming responses, return the linted content as a stream
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
        'X-Model-Route': routing.model,
      },
    })
  }

  return ApiResponse.success({
    conversation_id: convoId,
    response: finalResponse,
    sources: safeContextSnippets.map(snippet => ({
      content: snippet.content,
      source: snippet.source,
      relevance_score: snippet.relevance
    })),
    modelRoute: routing.model,
    routing: {
      model: routing.model,
      reason: routing.reason,
      estimatedCost: routing.estimatedCost
    },
    telemetry: {
      inputTokens,
      outputTokens,
      latency,
      contextCount: safeContextSnippets.length,
      linterApplied: lintResult.rewritten,
      retrievalStats
    }
  })
  
  } catch (error) {
    // Handle schema-specific errors
    if (error.name === 'SchemaError') {
      logSchemaError(error)
      logErr(rid, 'chat-handler-schema', error, { userId: user?.id, message: message?.slice(0, 100) })
      return ApiResponse.serverError(`Chat processing failed: ${error.message}`, 'CHAT_SCHEMA_ERROR', rid)
    }
    
    logErr(rid, 'chat-handler', error, { userId: user?.id, message: message?.slice(0, 100) })
    return ApiResponse.serverError('Chat processing failed', 'CHAT_ERROR', rid)
  }
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(chatHandler, {
    rateLimit: rateLimitConfigs.chat,
    logging: { enabled: true, includeBody: true },
  })
)



