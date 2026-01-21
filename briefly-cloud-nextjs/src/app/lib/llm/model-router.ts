/**
 * Model Routing Decision Matrix
 * 
 * Implements the routing policy to select the appropriate model
 * based on task type, tier, and retrieval confidence.
 */

import { Model, SubscriptionTier } from './models'
import { TaskType, TaskClassification } from './task-classifier'
import { RetrievalConfidence } from './retrieval-confidence'

export interface RoutingDecision {
  model: Model | null
  shouldRespond: boolean
  responseMessage?: string
  reasoning: string
}

export interface RoutingContext {
  tier: SubscriptionTier
  taskClassification: TaskClassification
  retrievalConfidence: RetrievalConfidence
  accuracyMode?: boolean
}

/**
 * Main routing function - implements the decision matrix from policy
 */
export function routeModel(context: RoutingContext): RoutingDecision {
  const { tier, taskClassification, retrievalConfidence, accuracyMode } = context
  const { taskType } = taskClassification
  const retrievalSufficient = retrievalConfidence.isSufficient

  console.log('[model-router] Routing decision:', {
    tier,
    taskType,
    retrievalSufficient,
    retrievalLevel: retrievalConfidence.level,
    accuracyMode
  })

  // Route based on tier
  switch (tier) {
    case 'free':
      return routeFreeTier(taskType, retrievalSufficient)
    
    case 'pro':
      return routeProTier(taskType, retrievalSufficient)
    
    case 'accuracy':
      return routeAccuracyTier(taskType, retrievalSufficient, accuracyMode)
    
    default:
      return {
        model: null,
        shouldRespond: true,
        responseMessage: 'Invalid subscription tier',
        reasoning: `Unknown tier: ${tier}`
      }
  }
}

/**
 * Free Tier Routing
 */
function routeFreeTier(taskType: TaskType, retrievalSufficient: boolean): RoutingDecision {
  if (taskType === TaskType.CLASSIFICATION) {
    return {
      model: Model.GPT_5_NANO,
      shouldRespond: true,
      reasoning: 'Free tier: Classification task → GPT-5-NANO'
    }
  }

  if (taskType === TaskType.GENERAL_KNOWLEDGE) {
    return {
      model: Model.GPT_5_MINI,
      shouldRespond: true,
      reasoning: 'Free tier: General knowledge → GPT-5-MINI'
    }
  }

  if (taskType === TaskType.DOC_GROUNDED && retrievalSufficient) {
    return {
      model: Model.GPT_5_MINI,
      shouldRespond: true,
      reasoning: 'Free tier: Doc-grounded with sufficient retrieval → GPT-5-MINI'
    }
  }

  // Free tier: insufficient retrieval or realtime
  return {
    model: null,
    shouldRespond: true,
    responseMessage: "I don't see this information in your connected files. Try uploading more documents or asking a general question.",
    reasoning: 'Free tier: Insufficient retrieval or unsupported task type'
  }
}

/**
 * Pro Tier Routing
 */
function routeProTier(taskType: TaskType, retrievalSufficient: boolean): RoutingDecision {
  if (taskType === TaskType.CLASSIFICATION) {
    return {
      model: Model.GPT_5_NANO,
      shouldRespond: true,
      reasoning: 'Pro tier: Classification task → GPT-5-NANO'
    }
  }

  if (taskType === TaskType.DOC_GROUNDED) {
    if (retrievalSufficient) {
      return {
        model: Model.GPT_5_1,
        shouldRespond: true,
        reasoning: 'Pro tier: Doc-grounded with sufficient retrieval → GPT-5.1'
      }
    }
    return {
      model: null,
      shouldRespond: true,
      responseMessage: "I don't see this information in your connected files. Try rephrasing your question or uploading relevant documents.",
      reasoning: 'Pro tier: Doc-grounded but insufficient retrieval'
    }
  }

  if (taskType === TaskType.GENERAL_KNOWLEDGE) {
    return {
      model: Model.GPT_5_MINI,
      shouldRespond: true,
      reasoning: 'Pro tier: General knowledge → GPT-5-MINI'
    }
  }

  if (taskType === TaskType.REALTIME_REQUIRED) {
    return {
      model: null,
      shouldRespond: true,
      responseMessage: "I don't have access to live data for this request. I can only answer questions about your documents or general knowledge.",
      reasoning: 'Pro tier: Realtime data not available'
    }
  }

  return {
    model: null,
    shouldRespond: true,
    responseMessage: "I'm not sure how to help with that. Try asking about your documents or a general knowledge question.",
    reasoning: 'Pro tier: Unhandled task type'
  }
}

/**
 * Accuracy / Enterprise Tier Routing
 */
function routeAccuracyTier(
  taskType: TaskType,
  retrievalSufficient: boolean,
  accuracyMode?: boolean
): RoutingDecision {
  if (taskType === TaskType.CLASSIFICATION) {
    return {
      model: Model.GPT_5_NANO,
      shouldRespond: true,
      reasoning: 'Accuracy tier: Classification task → GPT-5-NANO'
    }
  }

  if (taskType === TaskType.DOC_GROUNDED && retrievalSufficient) {
    // Safety rule: GPT-5.2 requires explicit accuracyMode = true
    if (accuracyMode === true) {
      return {
        model: Model.GPT_5_2,
        shouldRespond: true,
        reasoning: 'Accuracy tier: Doc-grounded with accuracy mode → GPT-5.2'
      }
    }
    return {
      model: Model.GPT_5,
      shouldRespond: true,
      reasoning: 'Accuracy tier: Doc-grounded without accuracy mode → GPT-5'
    }
  }

  if (taskType === TaskType.GENERAL_KNOWLEDGE) {
    return {
      model: Model.GPT_5,
      shouldRespond: true,
      reasoning: 'Accuracy tier: General knowledge → GPT-5'
    }
  }

  // Accuracy tier: insufficient retrieval or unsupported
  return {
    model: null,
    shouldRespond: true,
    responseMessage: "I need more information to answer this accurately. Try providing more context or uploading relevant documents.",
    reasoning: 'Accuracy tier: Insufficient information'
  }
}

/**
 * Safety validation - enforce hard rules from policy
 */
export function validateRoutingDecision(
  decision: RoutingDecision,
  context: RoutingContext
): { valid: boolean; error?: string } {
  // Rule 1: Never use GPT-5.2 for free tier
  if (context.tier === 'free' && decision.model === Model.GPT_5_2) {
    return {
      valid: false,
      error: 'SAFETY VIOLATION: GPT-5.2 cannot be used for free tier'
    }
  }

  // Rule 2: Never hallucinate document presence
  if (
    context.taskClassification.taskType === TaskType.DOC_GROUNDED &&
    !context.retrievalConfidence.isSufficient &&
    decision.shouldRespond &&
    !decision.responseMessage
  ) {
    return {
      valid: false,
      error: 'SAFETY VIOLATION: Cannot generate response for doc-grounded task without sufficient retrieval'
    }
  }

  // Rule 3: GPT-5-NANO must never be user-facing
  if (decision.model === Model.GPT_5_NANO && context.taskClassification.taskType !== TaskType.CLASSIFICATION) {
    return {
      valid: false,
      error: 'SAFETY VIOLATION: GPT-5-NANO cannot be used for user-facing responses'
    }
  }

  return { valid: true }
}
