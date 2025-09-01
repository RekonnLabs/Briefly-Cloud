/**
 * Enhanced context retrieval with guardrails
 * Implements similarity thresholds, token limits, and "need more info" responses
 */

import type { ChatBudget } from './budgets'
import type { ContextSnippet } from './promptBuilder'

export interface ContextRetrievalResult {
  contextSnippets: ContextSnippet[]
  needMoreInfo: boolean
  totalTokens: number
  filteredByThreshold: number
  filteredByTokenLimit: number
}

/**
 * Enhanced context retrieval with similarity thresholds and token limits
 */
export async function getRelevantContext(
  userId: string,
  query: string,
  budget: ChatBudget
): Promise<ContextRetrievalResult> {
  // Import searchDocuments dynamically to avoid circular dependencies
  const { searchDocuments } = await import('@/app/lib/vector/document-processor')
  
  // Search for documents with a higher limit to allow for filtering
  const searchResults = await searchDocuments(userId, query, {
    limit: budget.topK * 2, // Get more results to filter from
    threshold: 0.3, // Use a lower threshold initially, we'll filter later
  })

  // Filter by similarity threshold
  const thresholdFiltered = searchResults.filter(
    result => result.similarity >= budget.similarityThreshold
  )

  // Track how many were filtered by threshold
  const filteredByThreshold = searchResults.length - thresholdFiltered.length

  // If no results meet the threshold, return "need more info"
  if (thresholdFiltered.length === 0) {
    return {
      contextSnippets: [],
      needMoreInfo: true,
      totalTokens: 0,
      filteredByThreshold,
      filteredByTokenLimit: 0
    }
  }

  // Apply token limit filtering
  let totalTokens = 0
  const tokenLimitedResults: typeof thresholdFiltered = []
  let filteredByTokenLimit = 0

  for (const result of thresholdFiltered) {
    // Rough token estimation: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(result.content.length / 4)
    
    if (totalTokens + estimatedTokens <= budget.contextTokenLimit) {
      tokenLimitedResults.push(result)
      totalTokens += estimatedTokens
    } else {
      filteredByTokenLimit++
    }
  }

  // Convert to ContextSnippet format
  const contextSnippets: ContextSnippet[] = tokenLimitedResults.map(result => ({
    content: result.content,
    source: `${result.fileName} #${result.chunkIndex}`,
    relevance: result.similarity
  }))

  // Determine if we need more info based on context quality
  const needMoreInfo = contextSnippets.length === 0 || 
    (contextSnippets.length < 2 && contextSnippets[0].relevance < budget.similarityThreshold + 0.1)

  return {
    contextSnippets,
    needMoreInfo,
    totalTokens,
    filteredByThreshold,
    filteredByTokenLimit
  }
}

/**
 * Generate a "need more info" response when context is insufficient
 */
export function generateNeedMoreInfoResponse(query: string): string {
  return `I don't have enough relevant information in your documents to answer that question about "${query}". 

Could you:
- Upload more documents related to this topic
- Rephrase your question to be more specific
- Ask about something that might be covered in your existing documents

You can also try asking a more general question to see what information is available.`
}

/**
 * Enhanced context retrieval with automatic fallback to "need more info"
 */
export async function getContextWithFallback(
  userId: string,
  query: string,
  budget: ChatBudget
): Promise<{
  contextSnippets: ContextSnippet[]
  shouldUseNeedMoreInfo: boolean
  retrievalStats: {
    totalTokens: number
    filteredByThreshold: number
    filteredByTokenLimit: number
  }
}> {
  const result = await getRelevantContext(userId, query, budget)
  
  return {
    contextSnippets: result.contextSnippets,
    shouldUseNeedMoreInfo: result.needMoreInfo,
    retrievalStats: {
      totalTokens: result.totalTokens,
      filteredByThreshold: result.filteredByThreshold,
      filteredByTokenLimit: result.filteredByTokenLimit
    }
  }
}