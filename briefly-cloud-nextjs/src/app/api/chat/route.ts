import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier } from '@/app/lib/openai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { cacheManager, CACHE_KEYS } from '@/app/lib/cache'
import { withPerformanceMonitoring, withApiPerformanceMonitoring } from '@/app/lib/performance'

// Briefly Voice v1 imports
import { buildMessages, buildDeveloper, type ContextSnippet } from '@/lib/prompt/promptBuilder'
import { BUDGETS } from '@/lib/prompt/budgets'
import { enforce as lintResponse } from '@/lib/prompt/responseLinter'
import { routeModel, analyzeQuery, getModelConfig, type UserTier } from '@/lib/prompt/modelRouter'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  boost: z.boolean().optional().default(false),
})

async function chatHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({}))
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { message, conversationId, stream, boost } = parsed.data

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

  // Retrieve context via new vector search with performance monitoring
  const { searchDocuments } = await import('@/app/lib/vector/document-processor')
  const contextResults = await withApiPerformanceMonitoring(() =>
    searchDocuments(user.id, message, {
      limit: BUDGETS.TOP_K, // Use budget-aware limit
      threshold: 0.7,
    })
  )

  // Convert context to Briefly Voice format
  const contextSnippets: ContextSnippet[] = contextResults.map(r => ({
    content: r.content,
    source: `${r.fileName} #${r.chunkIndex}`,
    relevance: r.similarity
  }))

  // Get conversation history summary (simplified for now)
  let historySummary: string | undefined
  if (convoId) {
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: false })
      .limit(4) // Last 2 exchanges
    
    if (recentMessages && recentMessages.length > 0) {
      historySummary = recentMessages
        .reverse()
        .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
        .join(' | ')
    }
  }

  // Analyze query for routing signals
  const tier = (user.subscription_tier || 'free') as UserTier
  const routingSignals = analyzeQuery(message, contextSnippets, [])
  
  // Route to appropriate model
  const routing = routeModel(tier, boost, routingSignals)
  const modelConfig = getModelConfig(routing.model)

  // Build messages using Briefly Voice v1
  const developerTask = "Answer the user's question using the provided context. Be helpful and cite sources when referencing documents."
  const developerShape = "Format: Direct answer, key points as bullets, actionable next steps."
  
  const messages = buildMessages({
    developerTask,
    developerShape,
    contextSnippets,
    historySummary,
    userMessage: message
  })

  // Generate response using routed model
  let rawResponse: string
  
  if (stream) {
    const streamResp = await withApiPerformanceMonitoring(() =>
      streamChatCompletion(messages as any, tier)
    )
    
    // For streaming, we'll collect the response and then lint it
    // This is a simplified approach - in production you might want to stream and lint simultaneously
    let collectedResponse = ''
    for await (const chunk of streamResp) {
      const content = typeof chunk === 'string' ? chunk : chunk.choices?.[0]?.delta?.content || ''
      collectedResponse += content
    }
    rawResponse = collectedResponse
  } else {
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

  // Log telemetry
  console.log('Chat completion telemetry:', {
    modelRoute: routing.model,
    inputTokens,
    outputTokens,
    latency,
    contextCount: contextSnippets.length,
    linterApplied: lintResult.rewritten,
    boost,
    tier,
    userId: user.id
  })

  // Save assistant response
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
          relevance_score: r.relevanceScore 
        })),
        metadata: {
          modelRoute: routing.model,
          inputTokens,
          outputTokens,
          latency,
          linterApplied: lintResult.rewritten
        }
      })
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
    sources: contextResults,
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
      contextCount: contextSnippets.length,
      linterApplied: lintResult.rewritten
    }
  })
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(chatHandler, {
    rateLimit: rateLimitConfigs.chat,
    logging: { enabled: true, includeBody: true },
  })
)



