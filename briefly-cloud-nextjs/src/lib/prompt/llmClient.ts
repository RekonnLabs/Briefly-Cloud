/**
 * Briefly Voice v1 - LLM Client
 * 
 * Unified client for all LLM interactions using Briefly Voice system.
 * Handles routing, budgets, linting, and telemetry consistently.
 */

import { generateChatCompletion, streamChatCompletion, type SubscriptionTier } from '@/app/lib/openai'
import { buildMessages, type ContextSnippet, type ChatMessage } from './promptBuilder'
import { BUDGETS, getOutputBudget } from './budgets'
import { enforce as lintResponse, type LintResult } from './responseLinter'
import { routeModel, analyzeQuery, getModelConfig, type UserTier, type RoutingSignals } from './modelRouter'

export interface LLMRequest {
  userMessage: string
  contextSnippets?: ContextSnippet[]
  historySummary?: string
  toolsUsed?: string[]
  developerTask?: string
  developerShape?: string
  tier: UserTier
  boost?: boolean
  stream?: boolean
  userApiKey?: string
}

export interface LLMResponse {
  text: string
  modelRoute: string
  routing: {
    model: string
    reason: string
    estimatedCost: 'low' | 'medium' | 'high'
  }
  telemetry: {
    inputTokens: number
    outputTokens: number
    latency: number
    contextCount: number
    linterApplied: boolean
  }
  lintResult?: LintResult
}

export interface StreamLLMResponse extends Omit<LLMResponse, 'text'> {
  stream: AsyncIterable<string>
}

/**
 * Generate LLM response using Briefly Voice v1 system
 */
export async function generateReply(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now()
  
  const {
    userMessage,
    contextSnippets = [],
    historySummary,
    toolsUsed = [],
    developerTask,
    developerShape,
    tier,
    boost = false,
    userApiKey
  } = request

  // Analyze query for routing signals
  const routingSignals: RoutingSignals = analyzeQuery(userMessage, contextSnippets, toolsUsed)
  
  // Route to appropriate model
  const routing = routeModel(tier, boost, routingSignals)
  const modelConfig = getModelConfig(routing.model)

  // Build messages using Briefly Voice system
  const messages = buildMessages({
    developerTask,
    developerShape,
    toolsUsed,
    contextSnippets: contextSnippets.slice(0, BUDGETS.TOP_K), // Respect budget
    historySummary,
    userMessage
  })

  // Generate response
  const subscriptionTier = mapUserTierToSubscription(tier)
  const rawResponse = await generateChatCompletion(
    messages as any,
    subscriptionTier,
    userApiKey
  )

  // Apply linting
  const lintResult = lintResponse(rawResponse)
  const finalResponse = lintResult.output

  // Calculate metrics
  const latency = Date.now() - startTime
  const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
  const outputTokens = Math.ceil(finalResponse.length / 4)

  // Log telemetry
  logTelemetry({
    modelRoute: routing.model,
    inputTokens,
    outputTokens,
    latency,
    contextCount: contextSnippets.length,
    linterApplied: lintResult.rewritten,
    boost,
    tier
  })

  return {
    text: finalResponse,
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
    },
    lintResult
  }
}

/**
 * Generate streaming LLM response using Briefly Voice v1 system
 */
export async function generateStreamingReply(request: LLMRequest): Promise<StreamLLMResponse> {
  const startTime = Date.now()
  
  const {
    userMessage,
    contextSnippets = [],
    historySummary,
    toolsUsed = [],
    developerTask,
    developerShape,
    tier,
    boost = false,
    userApiKey
  } = request

  // Analyze query for routing signals
  const routingSignals: RoutingSignals = analyzeQuery(userMessage, contextSnippets, toolsUsed)
  
  // Route to appropriate model
  const routing = routeModel(tier, boost, routingSignals)

  // Build messages using Briefly Voice system
  const messages = buildMessages({
    developerTask,
    developerShape,
    toolsUsed,
    contextSnippets: contextSnippets.slice(0, BUDGETS.TOP_K),
    historySummary,
    userMessage
  })

  // Generate streaming response
  const subscriptionTier = mapUserTierToSubscription(tier)
  const streamResponse = await streamChatCompletion(
    messages as any,
    subscriptionTier,
    userApiKey
  )

  // Create async iterable that collects and lints the response
  const stream = createLintedStream(streamResponse, startTime, routing, contextSnippets.length, boost, tier)

  const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)

  return {
    stream,
    modelRoute: routing.model,
    routing: {
      model: routing.model,
      reason: routing.reason,
      estimatedCost: routing.estimatedCost
    },
    telemetry: {
      inputTokens,
      outputTokens: 0, // Will be calculated after streaming
      latency: 0, // Will be calculated after streaming
      contextCount: contextSnippets.length,
      linterApplied: false // Will be determined after linting
    }
  }
}

/**
 * Create a linted stream that applies Briefly Voice formatting
 */
async function* createLintedStream(
  originalStream: any,
  startTime: number,
  routing: any,
  contextCount: number,
  boost: boolean,
  tier: UserTier
): AsyncIterable<string> {
  let collectedResponse = ''
  
  // Collect the full response first
  for await (const chunk of originalStream) {
    const content = typeof chunk === 'string' ? chunk : chunk.choices?.[0]?.delta?.content || ''
    collectedResponse += content
  }
  
  // Apply linting to the complete response
  const lintResult = lintResponse(collectedResponse)
  const finalResponse = lintResult.output
  
  // Calculate final metrics
  const latency = Date.now() - startTime
  const outputTokens = Math.ceil(finalResponse.length / 4)
  
  // Log telemetry
  logTelemetry({
    modelRoute: routing.model,
    inputTokens: 0, // Would need to be passed in
    outputTokens,
    latency,
    contextCount,
    linterApplied: lintResult.rewritten,
    boost,
    tier
  })
  
  // Yield the linted response
  yield finalResponse
}

/**
 * Map UserTier to SubscriptionTier for OpenAI client
 */
function mapUserTierToSubscription(tier: UserTier): SubscriptionTier {
  switch (tier) {
    case 'free': return 'free'
    case 'pro': return 'pro'
    case 'enterprise': return 'pro_byok'
    default: return 'free'
  }
}

/**
 * Log telemetry data
 */
function logTelemetry(data: {
  modelRoute: string
  inputTokens: number
  outputTokens: number
  latency: number
  contextCount: number
  linterApplied: boolean
  boost: boolean
  tier: UserTier
}) {
  console.log('LLM telemetry:', {
    ...data,
    timestamp: new Date().toISOString()
  })
  
  // In production, you might want to send this to analytics service
  // analytics.track('llm_completion', data)
}

/**
 * Quick helper for simple queries without context
 */
export async function askBriefly(
  question: string,
  tier: UserTier = 'free',
  task?: string
): Promise<string> {
  const response = await generateReply({
    userMessage: question,
    tier,
    developerTask: task || "Answer the user's question clearly and helpfully."
  })
  
  return response.text
}

/**
 * Quick helper for context-aware queries
 */
export async function askWithContext(
  question: string,
  contextSnippets: ContextSnippet[],
  tier: UserTier = 'free',
  task?: string
): Promise<string> {
  const response = await generateReply({
    userMessage: question,
    contextSnippets,
    tier,
    developerTask: task || "Answer the user's question using the provided context. Cite sources when relevant."
  })
  
  return response.text
}