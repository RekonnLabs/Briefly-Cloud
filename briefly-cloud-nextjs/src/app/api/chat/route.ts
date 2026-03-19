export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier, type ChatCompletionResult } from '@/app/lib/openai'
import { computeCost } from '@/app/lib/prompt/modelRouter'
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
import { selectMemory, MEMORY_TOKEN_BUDGET } from '@/app/lib/prompt/conversationMemory'
import { dispatchTask } from '@/app/lib/tasks'

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
 *
 * IMPORTANT: This must run on the COMPLETE assembled response, not partial tokens.
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
      // If limit check fails, allow the request through (fail-open)
      console.warn('[chat:limits] Limit check failed — allowing request (fail-open)', {
        error: limitErr instanceof Error ? limitErr.message : String(limitErr),
        correlationId: rid
      })
    }

    // ── Intent detection (zero LLM calls — rule-based only) ───────────
    const { detectIntent } = await import('@/app/lib/prompt/intentRouter')
    const intent = detectIntent(message)
    console.log('[chat:intent]', {
      mode: intent.mode,
      confidence: intent.confidence,
      signals: intent.signals,
      correlationId: rid
    })

    // ── Create / reuse conversation (BEST-EFFORT) ──────────────────────
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
            content: message,
            correlation_id: rid
          })
        if (error) throw error
      }, rid)
    }

    // ── Context retrieval (CRITICAL — core RAG path) ───────────────────
    // Use effective_tier from v_user_limits so trial users (subscription_tier='free'
    // with an active trial_end_date) get Pro-level model routing, not the nano model.
    // Raw subscription_tier='free' would route them to the cheapest model mid-trial.
    const rawTier = userProfile.subscription_tier as UserTier
    const { getUserLimits } = await import('@/app/lib/usage/quota-enforcement')
    const userLimits = await getUserLimits(user.id).catch(() => null)
    const effectiveTierStr = userLimits?.effective_tier ?? rawTier
    const tier = (effectiveTierStr === 'pro' ? 'pro' : rawTier) as UserTier
    const budgetType = getBudgetForTier(tier)
    const budget = BUDGETS[budgetType]

    const { getContextWithFallback } = await import('@/app/lib/prompt/context-retrieval')
    const contextResult = await getContextWithFallback(user.id, message, budget, intent.mode, intent.topK)

    const { contextSnippets, shouldUseNeedMoreInfo, retrievalStats } = contextResult
    const safeContextSnippets = Array.isArray(contextSnippets) ? contextSnippets : []

    console.log('[chat:context-decision]', {
      hasDocumentContext: safeContextSnippets.length > 0,
      contextCount: safeContextSnippets.length,
      intentMode: intent.mode,
      correlationId: rid,
      retrievalStats
    })

    // ── Conversation Memory (BEST-EFFORT) ──────────────────────────────
    const contextTokensUsed = safeContextSnippets.reduce(
      (sum, s) => sum + Math.ceil((s.content?.length || 0) / 4), 0
    )
    const memoryBudget = Math.max(200, MEMORY_TOKEN_BUDGET - Math.max(0, contextTokensUsed - budget.contextTokenLimit))

    const memoryResult = await bestEffort('select_memory', () =>
      selectMemory(user.id, convoId, message, memoryBudget)
    , rid)

    const memoryMessages = memoryResult?.messages || []
    const memoryStats = memoryResult?.stats || {
      memoryEnabled: false,
      memoryCandidates: 0,
      memoryIncluded: 0,
      memoryTokensEstimated: 0,
      memoryGate: 'none' as const
    }

    console.log('[chat:memory]', {
      enabled: memoryStats.memoryEnabled,
      candidates: memoryStats.memoryCandidates,
      included: memoryStats.memoryIncluded,
      tokensEstimated: memoryStats.memoryTokensEstimated,
      gate: memoryStats.memoryGate,
      memoryBudget,
      correlationId: rid
    })
    
    // ── Task dispatch (CRITICAL — for non-qa modes) ─────────────────
    const taskResult = dispatchTask(intent.mode, message, safeContextSnippets)
    if (taskResult) {
      console.log('[chat:task-dispatch]', {
        mode: taskResult.mode,
        meta: taskResult.meta,
        correlationId: rid
      })
    }

    // ── Intent safety: downgrade comparison→qa when fewer than 2 distinct source docs ──
    // Root cause: the comparison mode system prompt ("do not use external knowledge")
    // directly contradicts the single-doc task instruction ("inform user comparison
    // requires 2 docs"). GPT-5 resolves the contradiction by producing zero tokens.
    // Fix: route single-document comparison queries through qa mode instead.
    let effectiveIntentMode = intent.mode
    let effectiveTaskInstruction = taskResult?.systemInstruction

    if (intent.mode === 'comparison') {
      const distinctSources = new Set(
        safeContextSnippets
          .map(s => s.source?.replace(/\s*#\d+$/i, '').trim())
          .filter(Boolean)
      ).size

      if (distinctSources < 2) {
        effectiveIntentMode = 'qa'
        effectiveTaskInstruction = undefined
        console.log('[chat:intent-downgrade]', {
          from: 'comparison',
          to: 'qa',
          reason: 'fewer-than-2-source-documents',
          distinctSources,
          contextCount: safeContextSnippets.length,
          correlationId: rid
        })
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
    const messages = buildMessages({
      contextSnippets: safeContextSnippets,
      memoryMessages: memoryMessages.length > 0 ? memoryMessages : undefined,
      userMessage: message,
      intentMode: effectiveIntentMode,
      taskInstruction: effectiveTaskInstruction
    })

    if (!Array.isArray(messages) || messages.length === 0 || !messages.every(msg => msg && typeof msg.content === 'string' && typeof msg.role === 'string')) {
      console.error('Invalid chat message payload', { userId: user.id, conversationId: convoId })
      return ApiResponse.internalError('Failed to prepare chat messages')
    }

    // ── LLM generation ─────────────────────────────────────────────────
    // STREAMING PATH: Real SSE — tokens arrive progressively from OpenAI
    if (stream) {
      const encoder = new TextEncoder()

      const readable = new ReadableStream({
        async start(controller) {
          try {
            // 1. Send start event immediately so the frontend knows we're alive
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'start', conversationId: convoId || null })}\n\n`
            ))

            // 2. Stream content tokens from OpenAI — onToken fires per token
            let fullContent = ''
            const streamResult = await streamChatCompletion(
              messages as any,
              tier,
              undefined,
              routing.model,
              (token: string) => {
                fullContent += token
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'token', content: token })}\n\n`
                ))
              }
            )

            // 3. Run linting + provenance on COMPLETE assembled content
            const lintResult = lintResponse(fullContent)
            const finalContent = lintResult.output
            const provenance = validateProvenance(finalContent, safeContextSnippets, streamResult.model || routing.model)

            console.log('[chat:provenance]', {
              type: provenance.type,
              contextCount: provenance.contextCount,
              citationsFound: provenance.citationsFound,
              intentMode: intent.mode,
              correlationId: rid
            })

            // 4. Send done event with full provenance metadata
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                v: 1,
                content: finalContent,
                provenance: {
                  type: provenance.type,
                  contextCount: provenance.contextCount,
                  citationsFound: provenance.citationsFound,
                  sources: provenance.sources,
                  disclaimer: provenance.disclaimer || null,
                  intentMode: intent.mode,
                  memory: {
                    enabled: memoryStats.memoryEnabled,
                    included: memoryStats.memoryIncluded,
                    tokensEstimated: memoryStats.memoryTokensEstimated,
                    gate: memoryStats.memoryGate
                  }
                },
                conversationId: convoId || null
              })}\n\n`
            ))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()

            // 5. Post-stream telemetry (best-effort, after response sent to user)
            const latency = Date.now() - startTime
            const inputTokens = streamResult.usage.prompt_tokens
            const outputTokens = streamResult.usage.completion_tokens
            const tokensContext = safeContextSnippets.reduce(
              (sum, s) => sum + Math.ceil((s.content?.length || 0) / 4), 0
            )
            const costUsd = computeCost(streamResult.model || routing.model, inputTokens, outputTokens)

            console.log('Chat completion telemetry (stream):', {
              modelRoute: routing.model,
              actualModel: streamResult.model,
              inputTokens,
              outputTokens,
              tokensContext,
              costUsd,
              latency,
              contextCount: safeContextSnippets.length,
              provenance: provenance.type,
              intentMode: intent.mode,
              citationsFound: provenance.citationsFound,
              linterApplied: lintResult.rewritten,
              boost,
              tier,
              userId: user.id,
              openaiRequestId: streamResult.openai_request_id,
              correlationId: rid,
              retrievalStats
            })

            if (convoId) {
              await bestEffort('save_assistant_message', async () => {
                const { error } = await supabaseApp
                  .from('messages')
                  .insert({
                    conversation_id: convoId,
                    owner_id: user.id,
                    role: 'assistant',
                    content: finalContent,
                    model: streamResult.model || routing.model,
                    tokens_in: inputTokens,
                    tokens_out: outputTokens,
                    tokens_context: tokensContext,
                    cost_usd: costUsd,
                    correlation_id: rid,
                    openai_request_id: streamResult.openai_request_id,
                    intent_mode: intent.mode,
                    provenance: {
                      type: provenance.type,
                      contextCount: provenance.contextCount,
                      citationsFound: provenance.citationsFound,
                      sources: provenance.sources,
                      disclaimer: provenance.disclaimer || null,
                      intentMode: intent.mode,
                      intentConfidence: intent.confidence,
                      retrievalStats,
                      memoryEnabled: memoryStats.memoryEnabled,
                      memoryCandidates: memoryStats.memoryCandidates,
                      memoryIncluded: memoryStats.memoryIncluded,
                      memoryTokensEstimated: memoryStats.memoryTokensEstimated,
                      memoryGate: memoryStats.memoryGate
                    }
                  })
                if (error) throw error
              }, rid)
            }

            await bestEffort('increment_chat_count', async () => {
              const { error } = await supabaseApp
                .rpc('increment_chat_count', { p_user_id: user.id })
              if (error) {
                const currentCount = userProfile.chat_messages_count || 0
                await usersRepo.updateUsage(user.id, { chat_messages_count: currentCount + 1 })
              }
            }, rid)

          } catch (err) {
            console.error('[chat:stream-error]', err)
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`
            ))
            controller.close()
          }
        }
      })

      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Model-Route': routing.model,
          'X-Intent-Mode': intent.mode,
        },
      })
    }

    // ── NON-STREAMING PATH ─────────────────────────────────────────────
    console.log('[chat-handler] Non-streaming path', {
      tier,
      messageCount: messages.length,
      model: routing.model,
      intentMode: intent.mode
    })
    
    const llmResult: ChatCompletionResult = await generateChatCompletion(messages as any, tier, undefined, routing.model)

    const lintResult = lintResponse(llmResult.content)
    const finalResponse = lintResult.output
    const provenance = validateProvenance(finalResponse, safeContextSnippets, routing.model)

    console.log('[chat:provenance]', {
      type: provenance.type,
      contextCount: provenance.contextCount,
      citationsFound: provenance.citationsFound,
      intentMode: intent.mode,
      correlationId: rid
    })

    const latency = Date.now() - startTime
    const inputTokens = llmResult.usage.prompt_tokens
    const outputTokens = llmResult.usage.completion_tokens
    const tokensContext = safeContextSnippets.reduce(
      (sum, s) => sum + Math.ceil((s.content?.length || 0) / 4), 0
    )
    const costUsd = computeCost(llmResult.model || routing.model, inputTokens, outputTokens)

    console.log('Chat completion telemetry (non-stream):', {
      modelRoute: routing.model,
      actualModel: llmResult.model,
      inputTokens, outputTokens, tokensContext, costUsd, latency,
      contextCount: safeContextSnippets.length,
      provenance: provenance.type,
      intentMode: intent.mode,
      linterApplied: lintResult.rewritten,
      boost, tier, userId: user.id,
      openaiRequestId: llmResult.openai_request_id,
      correlationId: rid, retrievalStats
    })

    if (convoId) {
      await bestEffort('save_assistant_message', async () => {
        const { error } = await supabaseApp
          .from('messages')
          .insert({
            conversation_id: convoId,
            owner_id: user.id,
            role: 'assistant',
            content: finalResponse,
            model: llmResult.model || routing.model,
            tokens_in: inputTokens,
            tokens_out: outputTokens,
            tokens_context: tokensContext,
            cost_usd: costUsd,
            correlation_id: rid,
            openai_request_id: llmResult.openai_request_id,
            intent_mode: intent.mode,
            provenance: {
              type: provenance.type,
              contextCount: provenance.contextCount,
              citationsFound: provenance.citationsFound,
              sources: provenance.sources,
              disclaimer: provenance.disclaimer || null,
              intentMode: intent.mode,
              intentConfidence: intent.confidence,
              retrievalStats,
              memoryEnabled: memoryStats.memoryEnabled,
              memoryCandidates: memoryStats.memoryCandidates,
              memoryIncluded: memoryStats.memoryIncluded,
              memoryTokensEstimated: memoryStats.memoryTokensEstimated,
              memoryGate: memoryStats.memoryGate
            }
          })
        if (error) throw error
      }, rid)
    }

    await bestEffort('increment_chat_count', async () => {
      const { error } = await supabaseApp
        .rpc('increment_chat_count', { p_user_id: user.id })
      if (error) {
        const currentCount = userProfile.chat_messages_count || 0
        await usersRepo.updateUsage(user.id, { chat_messages_count: currentCount + 1 })
      }
    }, rid)

    return ApiResponse.success({
      v: 1,
      conversation_id: convoId,
      response: finalResponse,
      provenance: {
        type: provenance.type,
        contextCount: provenance.contextCount,
        citationsFound: provenance.citationsFound,
        sources: provenance.sources,
        disclaimer: provenance.disclaimer || null,
        intentMode: intent.mode
      },
      sources: safeContextSnippets.map(snippet => ({
        content: snippet.content,
        source: snippet.source,
        relevance_score: snippet.relevance
      })),
      modelRoute: routing.model,
      routing: {
        model: llmResult.model || routing.model,
        reason: routing.reason,
        costUsd
      },
      telemetry: {
        inputTokens, outputTokens, tokensContext, costUsd, latency,
        contextCount: safeContextSnippets.length,
        provenance: provenance.type,
        intentMode: intent.mode,
        linterApplied: lintResult.rewritten,
        openaiRequestId: llmResult.openai_request_id,
        correlationId: rid, retrievalStats
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
