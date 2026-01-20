/**
 * Chat API Route - V2 with Comprehensive Model Routing
 * 
 * Implements the full routing policy with:
 * - Task classification
 * - Retrieval confidence evaluation
 * - Tier-based model selection
 * - Response provenance metadata
 */

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { supabaseApp } from '@/app/lib/supabase-clients'
import { usersRepo } from '@/app/lib/repos/users-repo'
import { withSchemaErrorHandling, extractSchemaContext } from '@/app/lib/errors/schema-errors'
import { logReq, logErr } from '@/app/lib/server/log'
import OpenAI from 'openai'

// New routing system imports
import { Model, SubscriptionTier, MODEL_CONFIGS } from '@/app/lib/llm/models'
import { classifyTask, TaskType } from '@/app/lib/llm/task-classifier'
import { evaluateRetrievalConfidence } from '@/app/lib/llm/retrieval-confidence'
import { routeModel, validateRoutingDecision, type RoutingContext } from '@/app/lib/llm/model-router'
import { 
  createProvenanceBuilder,
  recordClassification,
  recordRetrieval,
  recordRouting,
  recordGeneration,
  buildProvenance,
  formatProvenanceForLog
} from '@/app/lib/llm/provenance'

// Vector search
import { DocumentProcessor } from '@/app/lib/vector/document-processor'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
  accuracyMode: z.boolean().optional().default(false),
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

  const { message, conversationId, stream, accuracyMode } = parsed.data

  try {
    // Get user profile to determine tier
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

    const tier = (userProfile.subscription_tier || 'free') as SubscriptionTier
    
    // Initialize provenance tracking
    const provenance = createProvenanceBuilder(tier, accuracyMode)
    
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Step 1: Classify the task
    console.log('[chat] Step 1: Classifying task...')
    const taskClassification = await classifyTask(message, openai)
    recordClassification(provenance, taskClassification.taskType, taskClassification.confidence)
    
    console.log('[chat] Task classification:', {
      taskType: taskClassification.taskType,
      docIntent: taskClassification.docIntent,
      realtimeIntent: taskClassification.realtimeIntent,
      confidence: taskClassification.confidence
    })

    // Step 2: Perform retrieval if needed
    let retrievalConfidence
    let retrievedChunks: Array<{ relevance: number; content: string; source: string }> = []
    
    if (taskClassification.taskType === TaskType.DOC_GROUNDED) {
      console.log('[chat] Step 2: Performing document retrieval...')
      
      const docProcessor = new DocumentProcessor()
      const searchResults = await docProcessor.searchDocuments(user.id, message, 10)
      
      retrievedChunks = searchResults.map(result => ({
        relevance: result.similarity,
        content: result.content,
        source: result.source
      }))
      
      retrievalConfidence = evaluateRetrievalConfidence(retrievedChunks)
      recordRetrieval(provenance, retrievalConfidence)
      
      console.log('[chat] Retrieval results:', {
        chunksRetrieved: retrievedChunks.length,
        level: retrievalConfidence.level,
        sufficient: retrievalConfidence.isSufficient,
        topScore: retrievalConfidence.score.topScore
      })
    } else {
      // No retrieval needed for non-doc-grounded tasks
      retrievalConfidence = {
        isSufficient: false,
        level: 'none' as const,
        score: {
          topScore: 0,
          matchedChunks: 0,
          averageScore: 0,
          totalChunks: 0
        },
        reasoning: 'Retrieval not attempted for non-doc-grounded task'
      }
      recordRetrieval(provenance, retrievalConfidence)
    }

    // Step 3: Route to appropriate model
    console.log('[chat] Step 3: Routing to model...')
    const routingContext: RoutingContext = {
      tier,
      taskClassification,
      retrievalConfidence,
      accuracyMode
    }
    
    const routingDecision = routeModel(routingContext)
    recordRouting(provenance, routingDecision.model, routingDecision.reasoning)
    
    // Validate routing decision
    const validation = validateRoutingDecision(routingDecision, routingContext)
    if (!validation.valid) {
      console.error('[chat] SAFETY VIOLATION:', validation.error)
      return ApiResponse.internalError('Routing safety violation')
    }
    
    console.log('[chat] Routing decision:', {
      model: routingDecision.model,
      shouldRespond: routingDecision.shouldRespond,
      reasoning: routingDecision.reasoning
    })

    // Step 4: Generate response
    let finalResponse: string
    let inputTokens = 0
    let outputTokens = 0
    
    if (!routingDecision.shouldRespond || !routingDecision.model) {
      // Use predefined response message
      finalResponse = routingDecision.responseMessage || "I'm unable to help with that request."
      outputTokens = Math.ceil(finalResponse.length / 4)
    } else {
      // Generate AI response
      console.log('[chat] Step 4: Generating response with', routingDecision.model)
      
      const modelConfig = MODEL_CONFIGS[routingDecision.model]
      
      // Build messages
      const systemPrompt = buildSystemPrompt(taskClassification.taskType, retrievedChunks)
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
      
      // Generate completion
      const completion = await openai.chat.completions.create({
        model: routingDecision.model,
        messages,
        max_tokens: modelConfig.maxOutputTokens,
        temperature: 0.7,
      })
      
      finalResponse = completion.choices[0]?.message?.content || ''
      inputTokens = completion.usage?.prompt_tokens || 0
      outputTokens = completion.usage?.completion_tokens || 0
    }
    
    recordGeneration(provenance, inputTokens, outputTokens)
    
    // Build final provenance
    const finalProvenance = buildProvenance(provenance)
    console.log('[chat] Provenance:', formatProvenanceForLog(finalProvenance))

    // Save conversation
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

    // Save messages
    if (convoId) {
      await withSchemaErrorHandling(
        () => supabaseApp
          .from('chat_messages')
          .insert([
            { conversation_id: convoId, user_id: user.id, role: 'user', content: message },
            { 
              conversation_id: convoId,
              user_id: user.id,
              role: 'assistant', 
              content: finalResponse,
              sources: retrievedChunks.slice(0, 5).map(chunk => ({
                source: chunk.source,
                content: chunk.content.substring(0, 200),
                relevance_score: chunk.relevance
              })),
              metadata: {
                provenance: finalProvenance
              }
            }
          ]),
        {
          schema: 'app',
          operation: 'save_messages',
          table: 'chat_messages',
          userId: user.id,
          correlationId: rid,
          ...extractSchemaContext(request, 'save_messages', 'app', 'chat_messages')
        }
      )
    }

    // Return response
    if (stream) {
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
          'X-Model-Route': routingDecision.model || 'none',
        },
      })
    }

    return ApiResponse.success({
      conversation_id: convoId,
      response: finalResponse,
      sources: retrievedChunks.slice(0, 5).map(chunk => ({
        content: chunk.content,
        source: chunk.source,
        relevance_score: chunk.relevance
      })),
      provenance: finalProvenance
    })
    
  } catch (error) {
    logErr(rid, 'chat-handler', error, { userId: user?.id, message: message?.slice(0, 100) })
    return ApiResponse.serverError('Chat processing failed', 'CHAT_ERROR', rid)
  }
}

/**
 * Build system prompt based on task type and context
 */
function buildSystemPrompt(taskType: TaskType, retrievedChunks: Array<{ content: string; source: string }>): string {
  if (taskType === TaskType.DOC_GROUNDED && retrievedChunks.length > 0) {
    const contextText = retrievedChunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.source}]\n${chunk.content}`)
      .join('\n\n')
    
    return `You are Briefly, an AI document assistant. Answer the user's question using ONLY the provided context from their documents.

Context from user's documents:
${contextText}

Guidelines:
- Only use information from the provided context
- Cite sources when referencing specific documents
- If the context doesn't contain the answer, say so clearly
- Be concise and helpful`
  }
  
  return `You are Briefly, an AI assistant. Answer the user's question helpfully and concisely.`
}

export const POST = createProtectedApiHandler(chatHandler, {
  rateLimit: rateLimitConfigs.chat,
  logging: { enabled: true, includeBody: true },
})
