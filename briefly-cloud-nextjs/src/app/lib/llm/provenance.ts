/**
 * Response Provenance Metadata
 * 
 * Tracks the origin and decision-making process for each AI response.
 * Provides transparency and debugging information.
 */

import { Model, SubscriptionTier } from './models'
import { TaskType } from './task-classifier'
import { RetrievalConfidence } from './retrieval-confidence'

export interface ResponseProvenance {
  // Model routing
  modelUsed: Model | null
  tier: SubscriptionTier
  accuracyMode: boolean
  
  // Task classification
  taskType: TaskType
  taskConfidence: number
  
  // Retrieval
  retrievalAttempted: boolean
  retrievalSufficient: boolean
  retrievalLevel: 'high' | 'medium' | 'low' | 'none'
  chunksRetrieved: number
  topRelevanceScore: number
  
  // Decision reasoning
  routingReasoning: string
  fallbackUsed: boolean
  fallbackReason?: string
  
  // Timestamps
  classificationDuration: number
  retrievalDuration: number
  generationDuration: number
  totalDuration: number
  
  // Token usage
  inputTokens: number
  outputTokens: number
  estimatedCost: number
}

export interface ProvenanceBuilder {
  tier: SubscriptionTier
  accuracyMode: boolean
  startTime: number
  
  // Intermediate data
  taskType?: TaskType
  taskConfidence?: number
  classificationEndTime?: number
  
  retrievalAttempted?: boolean
  retrievalConfidence?: RetrievalConfidence
  retrievalEndTime?: number
  
  modelUsed?: Model | null
  routingReasoning?: string
  fallbackUsed?: boolean
  fallbackReason?: string
  
  inputTokens?: number
  outputTokens?: number
  generationEndTime?: number
}

/**
 * Create a new provenance builder
 */
export function createProvenanceBuilder(
  tier: SubscriptionTier,
  accuracyMode: boolean = false
): ProvenanceBuilder {
  return {
    tier,
    accuracyMode,
    startTime: Date.now()
  }
}

/**
 * Record task classification
 */
export function recordClassification(
  builder: ProvenanceBuilder,
  taskType: TaskType,
  taskConfidence: number
): void {
  builder.taskType = taskType
  builder.taskConfidence = taskConfidence
  builder.classificationEndTime = Date.now()
}

/**
 * Record retrieval results
 */
export function recordRetrieval(
  builder: ProvenanceBuilder,
  retrievalConfidence: RetrievalConfidence
): void {
  builder.retrievalAttempted = true
  builder.retrievalConfidence = retrievalConfidence
  builder.retrievalEndTime = Date.now()
}

/**
 * Record model routing decision
 */
export function recordRouting(
  builder: ProvenanceBuilder,
  modelUsed: Model | null,
  routingReasoning: string,
  fallbackUsed: boolean = false,
  fallbackReason?: string
): void {
  builder.modelUsed = modelUsed
  builder.routingReasoning = routingReasoning
  builder.fallbackUsed = fallbackUsed
  builder.fallbackReason = fallbackReason
}

/**
 * Record generation completion
 */
export function recordGeneration(
  builder: ProvenanceBuilder,
  inputTokens: number,
  outputTokens: number
): void {
  builder.inputTokens = inputTokens
  builder.outputTokens = outputTokens
  builder.generationEndTime = Date.now()
}

/**
 * Build final provenance metadata
 */
export function buildProvenance(builder: ProvenanceBuilder): ResponseProvenance {
  const now = Date.now()
  const totalDuration = now - builder.startTime
  
  const classificationDuration = builder.classificationEndTime 
    ? builder.classificationEndTime - builder.startTime 
    : 0
  
  const retrievalDuration = builder.retrievalEndTime && builder.classificationEndTime
    ? builder.retrievalEndTime - builder.classificationEndTime
    : 0
  
  const generationDuration = builder.generationEndTime && builder.retrievalEndTime
    ? builder.generationEndTime - builder.retrievalEndTime
    : 0
  
  const estimatedCost = calculateCost(
    builder.modelUsed,
    builder.inputTokens || 0,
    builder.outputTokens || 0
  )
  
  return {
    modelUsed: builder.modelUsed || null,
    tier: builder.tier,
    accuracyMode: builder.accuracyMode,
    
    taskType: builder.taskType || TaskType.GENERAL_KNOWLEDGE,
    taskConfidence: builder.taskConfidence || 0,
    
    retrievalAttempted: builder.retrievalAttempted || false,
    retrievalSufficient: builder.retrievalConfidence?.isSufficient || false,
    retrievalLevel: builder.retrievalConfidence?.level || 'none',
    chunksRetrieved: builder.retrievalConfidence?.score.totalChunks || 0,
    topRelevanceScore: builder.retrievalConfidence?.score.topScore || 0,
    
    routingReasoning: builder.routingReasoning || 'No routing decision made',
    fallbackUsed: builder.fallbackUsed || false,
    fallbackReason: builder.fallbackReason,
    
    classificationDuration,
    retrievalDuration,
    generationDuration,
    totalDuration,
    
    inputTokens: builder.inputTokens || 0,
    outputTokens: builder.outputTokens || 0,
    estimatedCost
  }
}

/**
 * Calculate estimated cost based on model and token usage
 */
function calculateCost(
  model: Model | null,
  inputTokens: number,
  outputTokens: number
): number {
  if (!model) return 0
  
  // Prices per 1M tokens
  const prices: Record<Model, { input: number; output: number }> = {
    [Model.GPT_5_2]: { input: 1.75, output: 14.00 },
    [Model.GPT_5_1]: { input: 1.25, output: 10.00 },
    [Model.GPT_5]: { input: 1.25, output: 10.00 },
    [Model.GPT_5_MINI]: { input: 0.25, output: 2.00 },
    [Model.GPT_5_NANO]: { input: 0.05, output: 0.40 }
  }
  
  const modelPrices = prices[model]
  if (!modelPrices) return 0
  
  const inputCost = (inputTokens / 1_000_000) * modelPrices.input
  const outputCost = (outputTokens / 1_000_000) * modelPrices.output
  
  return inputCost + outputCost
}

/**
 * Format provenance for logging
 */
export function formatProvenanceForLog(provenance: ResponseProvenance): Record<string, unknown> {
  return {
    model: provenance.modelUsed || 'none',
    tier: provenance.tier,
    taskType: provenance.taskType,
    retrievalLevel: provenance.retrievalLevel,
    retrievalSufficient: provenance.retrievalSufficient,
    chunksRetrieved: provenance.chunksRetrieved,
    topScore: provenance.topRelevanceScore.toFixed(3),
    routing: provenance.routingReasoning,
    fallback: provenance.fallbackUsed,
    fallbackReason: provenance.fallbackReason || 'none',
    tokens: {
      input: provenance.inputTokens,
      output: provenance.outputTokens,
      cost: `$${provenance.estimatedCost.toFixed(6)}`
    },
    timing: {
      classification: `${provenance.classificationDuration}ms`,
      retrieval: `${provenance.retrievalDuration}ms`,
      generation: `${provenance.generationDuration}ms`,
      total: `${provenance.totalDuration}ms`
    }
  }
}
