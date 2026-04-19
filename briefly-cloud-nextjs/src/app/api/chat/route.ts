export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { enforceRateLimit } from '@/app/lib/usage/rate-limiter'
import { logger } from '@/app/lib/logger'
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
// In-memory fallback rate limiter — used when Supabase is unreachable
// Intentionally stricter than normal limits (1/3 of pro tier)
// ─────────────────────────────────────────────────────────────────────────────
const _fallbackCounts = new Map<string, { count: number; resetAt: number }>()
function inMemoryFallback(userId: string, action: string, maxPerMinute: number): boolean {
  const key = `${userId}:${action}`
  const now = Date.now()
  const record = _fallbackCounts.get(key)
  if (!record || now > record.resetAt) {
    _fallbackCounts.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (record.count >= maxPerMinute) return false
  record.count++
  return true
}

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
    .replace(/\s*#\d+$/i, '')              // strip chunk index: "doc.txt #3" → "doc.txt"
    .replace(/\.[a-z]{2,5}$/i, '')          // strip extension: "doc.docx" → "doc"
    .replace(/[_\s-]?\d{4}[_\s-]?/g, '') // strip year: "report_2026" → "report"
    .replace(/[_\s]+/g, '_')               // normalize separators
    .replace(/^_+|_+$/g, '')               // trim leading/trailing underscores
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

  // Extract all [Source: ...] citations from the LLM response.
  // Llama may combine multiple citations in one bracket:
  //   GPT style:   [Source: A] [Source: B]        → two separate brackets
  //   Llama style: [Source: A, Source: B]          → one bracket, comma-separated
  // We handle both by splitting each bracket's content on ", Source:" after extraction.
  const citationPattern = /\[Source:\s*([^\]]+)\]/gi
  const rawCitations: string[] = []
  let match: RegExpExecArray | null
  while ((match = citationPattern.exec(responseText)) !== null) {
    // Split on ", Source:" (with optional whitespace) to handle combined citations
    const parts = match[1].split(/,\s*Source:\s*/i)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) rawCitations.push(trimmed)
    }
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

    // ── Intent detection (zero LLM calls — rule-based only, synchronous) ─────
    const { detectIntent } = await import('@/app/lib/prompt/intentRouter')
    const intent = detectIntent(message)
    console.log('[chat:intent]', {
      mode: intent.mode,
      confidence: intent.confidence,
      signals: intent.signals,
      correlationId: rid
    })

    // ── Parallel pre-stream DB reads ───────────────────────────────────────
    // These three reads are fully independent — run concurrently instead of
    // sequentially to cut ~1.5-2s of pre-stream latency on cold starts.
    // create_conversation is also kicked off here in parallel; its promise is
    // awaited below only when convoId is actually needed.
    const { getUserLimits } = await import('@/app/lib/usage/quota-enforcement')

    const createConvoPromise = !conversationId
      ? bestEffort('create_conversation', async () => {
          const { data, error } = await supabaseApp
            .from('conversations')
            .insert({ owner_id: user.id, title: message.slice(0, 80) })
            .select('id')
            .single()
          if (error) throw error
          return data?.id as string | undefined
        }, rid)
      : Promise.resolve(conversationId)

    const [userProfile, limitsResult, userLimits] = await Promise.all([
      withSchemaErrorHandling(
        () => usersRepo.getById(user.id),
        {
          schema: 'app',
          operation: 'get_user_profile',
          table: 'profiles',
          userId: user.id,
          correlationId: rid,
          ...extractSchemaContext(request, 'get_user_profile', 'app', 'profiles')
        }
      ),
      usersRepo.checkUsageLimits(user.id).catch((err: unknown) => {
        console.warn('[chat:limits] Limit check failed — allowing request (fail-open)', {
          error: err instanceof Error ? err.message : String(err),
          correlationId: rid
        })
        return null
      }),
      getUserLimits(user.id).catch(() => null),
    ])

    if (!userProfile) {
      return ApiResponse.unauthorized('User profile not found')
    }

    // Enforce quota gate (fail-open if limitsResult is null)
    if (limitsResult && !limitsResult.canChat) {
      return ApiResponse.forbidden(
        'You have reached your chat message limit for this billing period. ' +
        'Please upgrade your plan or wait for the next cycle.',
        'CHAT_LIMIT_REACHED'
      )
    }
    if (limitsResult) {
      console.log('[chat:limits]', {
        canChat: limitsResult.canChat,
        chatMessagesRemaining: limitsResult.chatMessagesRemaining,
        correlationId: rid
      })
    }

    // ── Rate limit enforcement (System B — Supabase-backed, fail-closed) ──────
    // Runs after quota gate, before any paid API call.
    // On Supabase error: apply stricter in-memory fallback (5/min) rather than
    // letting the request through unthrottled.
    try {
      await enforceRateLimit(user.id, 'chat_message', 'minute')
    } catch (err: any) {
      if (err?.code === 'RATE_LIMIT_EXCEEDED' || err?.statusCode === 429) {
        return ApiResponse.tooManyRequests(
          err.message || 'Rate limit exceeded',
          { retryAfter: err.details?.retryAfter ?? 60 }
        )
      }
      // Supabase unreachable — apply in-memory fallback (5 req/min)
      logger.warn('[rate-limit:supabase-unreachable]', { userId: user.id, action: 'chat_message', correlationId: rid })
      if (!inMemoryFallback(user.id, 'chat_message', 5)) {
        return ApiResponse.tooManyRequests('Rate limit exceeded (service degraded)', { retryAfter: 60 })
      }
    }

    // Resolve conversation ID (create_conversation was already in-flight)
    let convoId = await createConvoPromise

    // ── Save user message (fire-and-forget — bestEffort already swallows errors) ─
    if (convoId) {
      bestEffort('save_user_message', async () => {
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
      // Intentionally NOT awaited — fires in background, never blocks the stream
    }

    // ── Tier resolution (uses userLimits already fetched above) ─────────────
    const rawTier = userProfile.subscription_tier as UserTier
    const effectiveTierStr = userLimits?.effective_tier ?? rawTier
    const tier = (effectiveTierStr === 'pro' ? 'pro' : rawTier) as UserTier
    const budgetType = getBudgetForTier(tier)
    const budget = BUDGETS[budgetType]

    // ── LLM generation ─────────────────────────────────────────────────
    // STREAMING PATH: Real SSE — tokens arrive progressively from OpenAI
    // Retrieval, memory, and prompt-build all happen INSIDE the stream callback
    // so the start event fires immediately (~10ms) before the ~1800ms retrieval.
    if (stream) {
      const encoder = new TextEncoder()

      // Declare routing OUTSIDE the stream so NextResponse headers can reference it.
      // The default is overwritten inside start() once routeModel() runs.
      let routing: ReturnType<typeof routeModel> = { model: 'gpt-5-mini', reason: 'default' }

      const readable = new ReadableStream({
        async start(controller) {
          // Declare variables used across the stream scope
          let safeContextSnippets: ContextSnippet[] = []
          let retrievalStats: Record<string, unknown> = {}
          let memoryMessages: any[] = []
          let memoryStats = {
            memoryEnabled: false,
            memoryCandidates: 0,
            memoryIncluded: 0,
            memoryTokensEstimated: 0,
            memoryGate: 'none' as const
          }
          let effectiveIntentMode = intent.mode
          let effectiveTaskInstruction: string | undefined
          let messages: any[] = []

          try {
            // 1. Send start event IMMEDIATELY — typing indicator appears in UI at ~10ms
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'start', conversationId: convoId || null })}\n\n`
            ))

            // 2. Context retrieval + memory in parallel
            // Retrieval (embedding + pgvector) and memory selection are fully independent.
            // Running them concurrently saves the slower of the two (~300-600ms).
            const { getContextWithFallback } = await import('@/app/lib/prompt/context-retrieval')

            // Memory budget uses a conservative default while retrieval is in-flight;
            // it will be tightened below once contextTokensUsed is known.
            const memoryBudgetDefault = MEMORY_TOKEN_BUDGET

            const [contextResult, memoryResult] = await Promise.all([
              getContextWithFallback(user.id, message, budget, intent.mode, intent.topK),
              bestEffort('select_memory', () =>
                selectMemory(user.id, convoId, message, memoryBudgetDefault)
              , rid)
            ])

            const { contextSnippets, shouldUseNeedMoreInfo, retrievalStats: rs } = contextResult
            safeContextSnippets = Array.isArray(contextSnippets) ? contextSnippets : []
            retrievalStats = rs

            console.log('[chat:context-decision]', {
              hasDocumentContext: safeContextSnippets.length > 0,
              contextCount: safeContextSnippets.length,
              intentMode: intent.mode,
              correlationId: rid,
              retrievalStats
            })

            // Trim memory if context consumed more tokens than expected
            const contextTokensUsed = safeContextSnippets.reduce(
              (sum, s) => sum + Math.ceil((s.content?.length || 0) / 4), 0
            )
            const memoryBudget = Math.max(200, MEMORY_TOKEN_BUDGET - Math.max(0, contextTokensUsed - budget.contextTokenLimit))

            memoryMessages = (memoryResult?.messages || []).slice(0, Math.ceil(memoryBudget / 200))
            memoryStats = memoryResult?.stats || memoryStats

            console.log('[chat:memory]', {
              enabled: memoryStats.memoryEnabled,
              candidates: memoryStats.memoryCandidates,
              included: memoryStats.memoryIncluded,
              tokensEstimated: memoryStats.memoryTokensEstimated,
              gate: memoryStats.memoryGate,
              memoryBudget,
              correlationId: rid
            })

            // 4. Task dispatch (CRITICAL — for non-qa modes)
            const taskResult = dispatchTask(intent.mode, message, safeContextSnippets)
            if (taskResult) {
              console.log('[chat:task-dispatch]', {
                mode: taskResult.mode,
                meta: taskResult.meta,
                correlationId: rid
              })
            }

            // 5. Intent safety: all non-qa modes downgraded to qa
            // Root cause confirmed across comparison, summary, report, extraction modes:
            // task systemInstructions with rigid "REQUIRED OUTPUT FORMAT" blocks stack on
            // top of the base system prompt and cause GPT-5-mini to produce zero tokens
            // (inputTokens: 0, outputTokens: 0, 14-16s latency). The base qa mode with
            // document context handles summaries, comparisons, and extractions naturally
            // without structured task prompts — the LLM is capable enough on its own.
            const NON_QA_MODES = new Set(['comparison', 'summary', 'report', 'extraction'])
            effectiveIntentMode = NON_QA_MODES.has(intent.mode) ? 'qa' : intent.mode
            effectiveTaskInstruction = undefined

            if (NON_QA_MODES.has(intent.mode)) {
              console.log('[chat:intent-downgrade]', {
                from: intent.mode,
                to: 'qa',
                reason: 'task-prompt-causes-zero-token-output-gpt5mini',
                contextCount: safeContextSnippets.length,
                correlationId: rid
              })
            }

            // 6. Model routing (CRITICAL)
            const routingSignals = analyzeQuery(message, safeContextSnippets, [])
            routing = routeModel(tier, boost, routingSignals)
            const modelConfig = getModelConfig(routing.model)

            console.log('[api:model-selected]', {
              model: routing.model,
              tier,
              boost,
              reason: routing.reason,
              correlationId: rid
            })

            // 7. Build prompt (CRITICAL)
            messages = buildMessages({
              contextSnippets: safeContextSnippets,
              memoryMessages: memoryMessages.length > 0 ? memoryMessages : undefined,
              userMessage: message,
              intentMode: effectiveIntentMode,
              taskInstruction: effectiveTaskInstruction
            })

            if (!Array.isArray(messages) || messages.length === 0 || !messages.every(msg => msg && typeof msg.content === 'string' && typeof msg.role === 'string')) {
              console.error('Invalid chat message payload', { userId: user.id, conversationId: convoId })
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Failed to prepare chat messages' })}\n\n`
              ))
              controller.close()
              return
            }

            // 8. Stream content tokens — onToken fires per token
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
              },
              modelConfig.maxTokens  // pass through from modelRouter — was hardcoded 1000 in openai.ts
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
                    latency_ms: latency,
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

    // ── NON-STREAMING PATH ─────────────────────────────────────────────────────
    // Retrieval and memory run in parallel (same optimization as streaming path)
    const { getContextWithFallback } = await import('@/app/lib/prompt/context-retrieval')

    const [contextResult, memoryResultNS] = await Promise.all([
      getContextWithFallback(user.id, message, budget, intent.mode, intent.topK),
      bestEffort('select_memory', () =>
        selectMemory(user.id, convoId, message, MEMORY_TOKEN_BUDGET)
      , rid)
    ])

    const { contextSnippets, shouldUseNeedMoreInfo, retrievalStats } = contextResult
    const safeContextSnippets = Array.isArray(contextSnippets) ? contextSnippets : []

    console.log('[chat:context-decision]', {
      hasDocumentContext: safeContextSnippets.length > 0,
      contextCount: safeContextSnippets.length,
      intentMode: intent.mode,
      correlationId: rid,
      retrievalStats
    })

    const contextTokensUsed = safeContextSnippets.reduce(
      (sum, s) => sum + Math.ceil((s.content?.length || 0) / 4), 0
    )
    const memoryBudget = Math.max(200, MEMORY_TOKEN_BUDGET - Math.max(0, contextTokensUsed - budget.contextTokenLimit))

    const memoryMessages = (memoryResultNS?.messages || []).slice(0, Math.ceil(memoryBudget / 200))
    const memoryStats = memoryResultNS?.stats || {
      memoryEnabled: false,
      memoryCandidates: 0,
      memoryIncluded: 0,
      memoryTokensEstimated: 0,
      memoryGate: 'none' as const
    }

    const taskResult = dispatchTask(intent.mode, message, safeContextSnippets)
    const NON_QA_MODES_NS = new Set(['comparison', 'summary', 'report', 'extraction'])
    let effectiveIntentMode = NON_QA_MODES_NS.has(intent.mode) ? 'qa' : intent.mode
    let effectiveTaskInstruction: string | undefined = undefined

    if (NON_QA_MODES_NS.has(intent.mode)) {
      console.log('[chat:intent-downgrade]', {
        from: intent.mode,
        to: 'qa',
        reason: 'task-prompt-causes-zero-token-output-gpt5mini',
        contextCount: safeContextSnippets.length,
        correlationId: rid
      })
    }

    const routingSignals = analyzeQuery(message, safeContextSnippets, [])
    const routing = routeModel(tier, boost, routingSignals)
    const modelConfig = getModelConfig(routing.model)

    console.log('[chat-handler] Non-streaming path', {
      tier,
      model: routing.model,
      intentMode: intent.mode
    })

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
    
    const llmResult: ChatCompletionResult = await generateChatCompletion(messages as any, tier, undefined, routing.model, modelConfig.maxTokens)

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
            latency_ms: latency,
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
    // System A rateLimitConfigs removed — System B (usage/rate-limiter.ts) is now
    // wired directly inside chatHandler with fail-closed Supabase enforcement.
    logging: { enabled: true, includeBody: true },
  })
)
