/**
 * Task Classification System
 * 
 * Classifies user messages to determine the appropriate model and retrieval strategy.
 * Uses GPT-5-NANO for lightweight, cost-effective classification.
 */

import { Model } from './models'
import OpenAI from 'openai'

export enum TaskType {
  DOC_GROUNDED = 'DOC_GROUNDED',        // Requires user documents
  GENERAL_KNOWLEDGE = 'GENERAL_KNOWLEDGE',   // No document dependency
  REALTIME_REQUIRED = 'REALTIME_REQUIRED',   // Requires live data (weather, stocks, news)
  CLASSIFICATION = 'CLASSIFICATION',      // Routing, scoring, intent detection
}

export interface TaskClassification {
  taskType: TaskType
  docIntent: boolean
  realtimeIntent: boolean
  confidence: number
  reasoning?: string
}

const CLASSIFICATION_PROMPT = `You are a task classifier for Briefly Cloud, an AI document assistant.

Analyze the user's message and classify it into one of these categories:

1. DOC_GROUNDED: User is asking about their documents, files, or uploaded content
   - Examples: "What does my contract say about termination?", "Summarize the Q4 report"
   
2. GENERAL_KNOWLEDGE: User is asking general questions that don't require their documents
   - Examples: "What is photosynthesis?", "Explain quantum computing"
   
3. REALTIME_REQUIRED: User needs current, live data (weather, stocks, news, time)
   - Examples: "What's the weather today?", "What's the stock price of AAPL?"
   
4. CLASSIFICATION: Internal routing/scoring tasks (you won't see these)

Respond with JSON only:
{
  "taskType": "DOC_GROUNDED" | "GENERAL_KNOWLEDGE" | "REALTIME_REQUIRED",
  "docIntent": boolean,
  "realtimeIntent": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`

export async function classifyTask(
  userMessage: string,
  openaiClient: OpenAI
): Promise<TaskClassification> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: Model.GPT_5_NANO,
      messages: [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 200,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No classification response received')
    }

    const classification = JSON.parse(content) as TaskClassification
    
    // Validate classification
    if (!Object.values(TaskType).includes(classification.taskType)) {
      throw new Error(`Invalid task type: ${classification.taskType}`)
    }

    console.log('[task-classifier] Classification result:', {
      userMessage: userMessage.substring(0, 100),
      classification
    })

    return classification
  } catch (error) {
    console.error('[task-classifier] Classification failed:', error)
    
    // Fallback: assume doc-grounded if classification fails
    return {
      taskType: TaskType.DOC_GROUNDED,
      docIntent: true,
      realtimeIntent: false,
      confidence: 0.5,
      reasoning: 'Fallback classification due to error'
    }
  }
}

/**
 * Quick heuristic-based classification (no API call)
 * Used as a fallback or for testing
 */
export function classifyTaskHeuristic(userMessage: string): TaskClassification {
  const lowerMessage = userMessage.toLowerCase()
  
  // Realtime indicators
  const realtimeKeywords = ['weather', 'stock', 'price', 'news', 'today', 'now', 'current']
  const hasRealtimeIntent = realtimeKeywords.some(kw => lowerMessage.includes(kw))
  
  // Document indicators
  const docKeywords = ['my', 'document', 'file', 'upload', 'contract', 'report', 'pdf']
  const hasDocIntent = docKeywords.some(kw => lowerMessage.includes(kw))
  
  let taskType: TaskType
  if (hasRealtimeIntent) {
    taskType = TaskType.REALTIME_REQUIRED
  } else if (hasDocIntent) {
    taskType = TaskType.DOC_GROUNDED
  } else {
    taskType = TaskType.GENERAL_KNOWLEDGE
  }
  
  return {
    taskType,
    docIntent: hasDocIntent,
    realtimeIntent: hasRealtimeIntent,
    confidence: 0.7,
    reasoning: 'Heuristic-based classification'
  }
}
