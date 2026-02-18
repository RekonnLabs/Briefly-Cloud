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

// ─────────────────────────────────────────────────────────────────────────────
// Provenance types — every response carries provenance metadata
// ─────────────────────────────────────────────────────────────────────────────
type ProvenanceType = 'grounded' | 'general' | 'ungrounded'

interface ProvenanceMetadata {
  type: ProvenanceType
  contextCount: number
  citationsFound: number
  sources: string[]
  model: string
  disclaimer?: string
}

/**
 * Normalize a source string for comparison.
 * Sources come as "filename.txt #3" from context-retrieval.
 * LLM may cite as "filename.txt", "filename.txt #3", or just "filename".
 * We strip chunk indices and extensions for fuzzy matching.
 */
function normalizeSource(raw: string): string {
  return raw
    .trim()
    .replace(/\s*#\d+$/i, '')     // strip chunk index: "foo.txt #3" → "foo.txt"
    .toLowerCase()
}

/**
 * Validate provenance: if context was provided, the LLM MUST cite at least one
 * source that actually exists in the retrieved context. Hallucinated citations
 * (filenames not in the retrieved set) do NOT count.
 */
function validateProvenance(
  responseText: string,
  contextSnippets: ContextSnippet[],
  model: string
): ProvenanceMetadata {
  const contextCount = contextSnippets.length
  const sourceNames = contextSnippets
    .map(s => s.source)
    .filter((s): s is string => !!s)
  const uniqueSources = [...new Set(sourceNames)]

  // Build a set of normalized source names from the ACTUAL retrieved context
  const retrievedSourcesNormalized = new Set(
    uniqueSources.map(normalizeSource)
  )

  // Extract all [Source: ...] citations from the LLM response
  const citationPattern = /\[Source:\s*([^\]]+)\]/gi
  const rawCitations: string[] = []
  let match: RegExpExecArray | null
  while ((match = citationPattern.exec(responseText)) !== null) {
    rawCitations.push(match[1].trim())
  }

  // Validate each citation against the actual retrieved source list
  // A citation only counts if it matches a real retrieved source
  const validatedCitations = rawCitations.filter(citation => {
    const normalized = normalizeSource(citation)
    return retrievedSourcesNormalized.has(normalized)
  })
  const hallucinatedCitations = rawCitations.filter(citation => {
    const normalized = normalizeSource(citation)
    return !retrievedSourcesNormalized.has(normalized)
  })

  if (hallucinatedCitations.length > 0) {
    console.warn('[provenance:hallucinated-citations]', {
      hallucinated: hallucinatedCitations,
      validRetrievedSources: uniqueSources
    })
  }

  if (contextCount === 0) {
    // No documents were retrieved — this is a general-knowledge answer
    return {
      type: 'general',
      contextCount: 0,
      citationsFound: 0,
      sources: [],
      model,
      disclaimer: 'This answer is based on general knowledge, not your uploaded documents.'
    }
  }

  if (validatedCitations.length === 0) {
    // Context was provided but the LLM failed to cite ANY valid source — UNGROUNDED
    // (raw citations may exist but they don't match retrieved sources)
    return {
      type: 'ungrounded',
      contextCount,
      citationsFound: 0,
      sources: uniqueSources,
      model,
      disclaimer: rawCitations.length > 0
        ? 'Warning: The response cited sources that were not in the retrieved documents. This answer may not be grounded in your documents.'
        : 'Warning: Document context was available but the response did not cite any sources. This answer may not be grounded in your documents.'
    }
  }

  // Context was provided AND the LLM cited at least one VALIDATED source — grounded
  return {
    type: 'grounded',
    contextCount,
    citationsFound: validatedCitations.length,
    sources: uniqueSources,
    model
  }
}

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  boost: z.boolean().optional().default(false),
})

// ─────────────────────────────────────────────────────────────────────────────
// Best-effort telemetry helper: wraps any async operation so failures are
// logged but NEVER propagate to the caller. Retrieval is critical;
// telemetry is best-effort.
// ─────────────────────────────────────────────────────────────────────────────
async function bestEffort<T>(
  label: string,
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[best-effort:${label}] Non-critical operation failed — swallowed`, {
      error: err instanceof Error ? err.message : String(err),
      correlationId
    })
    return undefined
  }
}

async function chatHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  const rid = logReq({ route: '/api/chat', method: 'POST', userId: user?.id })
  
  if (!user) {
    console.error('[api:chat] Authentication failed - no user in context')
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  console.log('[api:auth-success] User authenticated', {
    userId: user.id,
    email: user.email,
    correlationId: rid
  })

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

    // ── Get user profile (CRITICAL — needed for tier routing) ──────────
    const userProfile = await withSchemaErrorHandling(
      () => usersRepo.getById(user.id),
      {
        schema: 'app',
        operation: 'get_user_profile',
        table: 'profiles',
        userId: user.id,
        correlationId: rid,
        ...extractSchemaContext(request, 'get_user_profile', 'app', 'profiles')
      }
    )
    if (!userProfile) {
      return ApiResponse.unauthorized('User profile not found')
    }

    // ── Check chat usage limits (CRITICAL — enforce tier quotas) ─────
    try {
      const limits = await usersRepo.checkUsageLimits(user.id)
      if (!limits.canChat) {
        return ApiResponse.forbidden(
          'You have reached your chat message limit for this billing period. ' +
          'Please upgrade your plan or wait for the next cycle.',
          'CHAT_LIMIT_REACHED'
        )
      }
      console.log('[chat:limits]', {
        canChat: limits.canChat,
        chatMessagesRemaining: limits.chatMessagesRemaining,
        correlationId: rid
      })
    } catch (limitErr) {
      // If limit check fails, allow the request through (fail-open for now)
      // but log it so we can monitor
      console.warn('[chat:limits] Limit check failed — allowing request (fail-open)', {
        error: limitErr instanceof Error ? limitErr.message : String(limitErr),
        correlationId: rid
      })
    }

    // ── Create / reuse conversation (BEST-EFFORT — chat still works without persistence) ──
    let convoId = conversationId
    if (!convoId) {
      const result = await bestEffort('create_conversation', async () => {
        const { data, error } = await supabaseApp
          .from('conversations')
          .insert({ owner_id: user.id, title: message.slice(0, 80) })
          .select('id')
          .single()
        if (error) throw error
        return data?.id as string | undefined
      }, rid)
      convoId = result
    }

    // ── Save user message (BEST-EFFORT) ────────────────────────────────
    if (convoId) {
      await bestEffort('save_user_message', async () => {
        const { error } = await supabaseApp
          .from('messages')
          .insert({
            conversation_id: convoId,
            owner_id: user.id,
            role: 'user',
            content: message
          })
        if (error) throw error
      }, rid)
    }

    // ── Context retrieval (CRITICAL — this is the core RAG path) ───────
    const tier = userProfile.subscription_tier as UserTier
    const budgetType = getBudgetForTier(tier)
    const budget = BUDGETS[budgetType]

    const { getContextWithFallback } = await import('@/app/lib/prompt/context-retrieval')
    const contextResult = await getContextWithFallback(user.id, message, budget)

    const { contextSnippets, shouldUseNeedMoreInfo, retrievalStats } = contextResult
    const safeContextSnippets = Array.isArray(contextSnippets) ? contextSnippets : []

    console.log('[chat:context-decision]', {
      hasDocumentContext: safeContextSnippets.length > 0,
      contextCount: safeContextSnippets.length,
      correlationId: rid
    })

    // ── Get conversation history (BEST-EFFORT) ─────────────────────────
    let historySummary: string | undefined
    if (convoId) {
      const historyResult = await bestEffort('get_conversation_history', async () => {
        const { data, error } = await supabaseApp
          .from('messages')
          .select('role, content')
          .eq('conversation_id', convoId)
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(4)
        if (error) throw error
        return data
      }, rid)

      if (historyResult && historyResult.length > 0) {
        historySummary = historyResult
          .reverse()
          .map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 100)}`)
          .join(' | ')
      }
    }
    
    // ── Model routing (CRITICAL) ───────────────────────────────────────
    const routingSignals = analyzeQuery(message, safeContextSnippets, [])
    const routing = routeModel(tier, boost, routingSignals)
    const modelConfig = getModelConfig(routing.model)
    
    console.log('[api:model-selected]', {
      model: routing.model,
      tier,
      boost,
      reason: routing.reason,
      correlationId: rid
    })

    // ── Build prompt (CRITICAL) ────────────────────────────────────────
    const developerTask = "You are Briefly, an AI assistant that helps users understand their documents. Answer the user's question. When document context is provided, ground your answer in those documents and cite sources. When no document context is available, answer the question using your general knowledge — be helpful and conversational."
    const developerShape = "Format: Direct answer first, then supporting details. Use bullet points for lists. Cite document sources with [Source: filename] when referencing uploaded documents."
    
    const messages = buildMessages({
      developerTask,
      developerShape,
      contextSnippets: safeContextSnippets,
      historySummary,
      userMessage: message
    })

    if (!Array.isArray(messages) || messages.length === 0 || !messages.every(msg => msg && typeof msg.content === 'string' && typeof msg.role === 'string')) {
      console.error('Invalid chat message payload', { userId: user.id, conversationId: convoId })
      return ApiResponse.internalError('Failed to prepare chat messages')
    }

    // ── LLM generation (CRITICAL) ──────────────────────────────────────
    console.log('[chat-handler] About to call generateChatCompletion', {
      tier,
      messageCount: messages.length,
      model: routing.model,
      hasDocumentContext: safeContextSnippets.length > 0
    })
    
    const rawResponse = await generateChatCompletion(messages as any, tier, undefined, routing.model)
    
    console.log('[chat-handler] generateChatCompletion returned', {
      responseLength: rawResponse?.length || 0,
      hasContent: !!rawResponse
    })

    // ── Apply Briefly Voice linting ────────────────────────────────────
    const lintResult = lintResponse(rawResponse)
    const finalResponse = lintResult.output

    // ── Provenance validation (CRITICAL — enforces trust) ──────────────
    const provenance = validateProvenance(finalResponse, safeContextSnippets, routing.model)

    console.log('[chat:provenance]', {
      type: provenance.type,
      contextCount: provenance.contextCount,
      citationsFound: provenance.citationsFound,
      sources: provenance.sources,
      correlationId: rid
    })

    // ── Calculate metrics ──────────────────────────────────────────────
    const latency = Date.now() - startTime
    const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
    const outputTokens = Math.ceil(finalResponse.length / 4)

    // ── Telemetry logging (BEST-EFFORT) ────────────────────────────────
    console.log('Chat completion telemetry:', {
      modelRoute: routing.model,
      inputTokens,
      outputTokens,
      latency,
      contextCount: safeContextSnippets.length,
      provenance: provenance.type,
      citationsFound: provenance.citationsFound,
      linterApplied: lintResult.rewritten,
      boost,
      tier,
      userId: user.id,
      retrievalStats
    })

    // ── Save assistant response (BEST-EFFORT — uses correct table: app.messages) ──
    // NOTE: cost_usd is an ESTIMATE derived from routing.estimatedCost (our internal
    // pricing table based on model + token counts). It is NOT sourced from the
    // provider's usage response. Treat as approximate for analytics, not billing.
    if (convoId) {
      await bestEffort('save_assistant_message', async () => {
        const { error } = await supabaseApp
          .from('messages')
          .insert({
            conversation_id: convoId,
            owner_id: user.id,
            role: 'assistant',
            content: finalResponse,
            model: routing.model,
            tokens_in: inputTokens,
            tokens_out: outputTokens,
            cost_usd: routing.estimatedCost  // estimated, not provider-sourced
          })
        if (error) throw error
      }, rid)
    }

    // ── Increment chat_messages_count (BEST-EFFORT, post-success only) ──
    // This runs AFTER successful LLM generation + provenance validation.
    // Uses SQL increment to avoid read-then-write race conditions.
    await bestEffort('increment_chat_count', async () => {
      const { error } = await supabaseApp
        .rpc('increment_chat_count', { p_user_id: user.id })
      if (error) {
        // Fallback to direct update if RPC doesn't exist yet
        const currentCount = userProfile.chat_messages_count || 0
        await usersRepo.updateUsage(user.id, {
          chat_messages_count: currentCount + 1
        })
      }
    }, rid)

    // ── Build response ─────────────────────────────────────────────────
    if (stream) {
      // Structured JSON envelope for streaming responses
      // The frontend parses this to extract content + provenance
      // v: envelope version — increment when changing provenance schema
      const responsePayload = JSON.stringify({
        v: 1,
        content: finalResponse,
        provenance: {
          type: provenance.type,
          contextCount: provenance.contextCount,
          citationsFound: provenance.citationsFound,
          sources: provenance.sources,
          disclaimer: provenance.disclaimer || null
        },
        conversationId: convoId || null
      })

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(responsePayload))
          controller.close()
        },
      })

      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Model-Route': routing.model,
          'X-Provenance': provenance.type,
          'X-Context-Count': String(provenance.contextCount),
        },
      })
    }

    // Non-streaming JSON response
    return ApiResponse.success({
      v: 1,
      conversation_id: convoId,
      response: finalResponse,
      provenance: {
        type: provenance.type,
        contextCount: provenance.contextCount,
        citationsFound: provenance.citationsFound,
        sources: provenance.sources,
        disclaimer: provenance.disclaimer || null
      },
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
        provenance: provenance.type,
        linterApplied: lintResult.rewritten,
        retrievalStats
      }
    })
  
  } catch (error: any) {
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
