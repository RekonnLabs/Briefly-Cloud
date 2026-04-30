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
 * Normalize a user query for vector retrieval.
 *
 * Users phrase questions conversationally — "I have a prospect asking about X,
 * what should I tell them?" — but the indexed document chunks use topic-direct
 * language: "Is my data secure?" The embedding distance between these is large
 * enough to miss at threshold=0.3 even though they're semantically equivalent.
 *
 * This function strips common conversational frames and extracts the core
 * information need before embedding for retrieval. The original user message
 * is still sent to the LLM unchanged — only the search query is rewritten.
 *
 * No LLM calls — pure regex/string manipulation, zero latency cost.
 */
function normalizeQueryForRetrieval(query: string): string {
  let q = query.trim()

  // Strip common lead-in frames that inflate the query with non-topical words
  const leadInPatterns = [
    /^i (have|got) (a |an )?(prospect|client|customer|user|colleague|someone|contact)[\w\s,]*(asking|who asked|that asked|asking me) (about|regarding|on|for)\s*/i,
    /^(what|how) (should|do|can|would) i (tell|say|respond to|answer|handle|address) (them|him|her|my prospect|my client|a prospect|a client)\??\s*/i,
    /^(what|how) (should|do|can|would) i (tell|say|respond to|answer|handle|address) (them|him|her|my prospect|my client|a prospect|a client) (about|regarding|on|when it comes to)\s*/i,
    /^(i'm? |i am )?(trying to |looking to )?(close|win|handle|deal with|respond to|address|answer)\s+\w+[\w\s]*?(about|regarding|on)\s*/i,
    /^(when|if) (a |my )?(prospect|client|customer|user) (asks?|inquires?|wants to know) (about|regarding|on)\s*/i,
    /^(how do i|what do i|what should i say|what's the best way to) (respond|reply|answer|handle|address) (to )?(a |the )?(question|objection|concern|inquiry) (about|regarding|on)\s*/i,
    /^(can you help me|help me) (respond to|answer|address|handle)\s+\w+[\w\s]*?(about|regarding|on)\s*/i,
  ]

  for (const pattern of leadInPatterns) {
    const stripped = q.replace(pattern, '')
    if (stripped.length > 10 && stripped.length < q.length) {
      q = stripped.trim()
      break
    }
  }

  // Strip trailing conversational tails that add noise without topic signal
  const tailPatterns = [
    /\??\s*(what should i (tell|say|do|respond)\??)?$/i,
    /\s+what('?s| is) (my|the) best (argument|response|answer|approach)\??$/i,
    /\s+(for (switching|moving) to\s+\w+)\??$/i,
    /\s+(for me|to me|please|thanks|thank you)[.!?]?$/i,
  ]

  for (const pattern of tailPatterns) {
    const stripped = q.replace(pattern, '').trim()
    if (stripped.length > 10) {
      q = stripped
    }
  }

  // Expand vague single-document references into richer retrieval queries.
  // "summarize the contract" → "contract summary terms conditions vendor agreement"
  // This prevents vague queries from scatter-retrieving across unrelated documents.
  const documentExpansions: Array<[RegExp, string]> = [
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the contract/i, 'contract terms conditions vendor agreement obligations'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the agreement/i, 'agreement terms conditions obligations parties'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the report/i, 'report summary findings results'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the document/i, 'document summary key points'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the proposal/i, 'proposal summary scope pricing terms'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) the email/i, 'email summary key points action items'],
    [/^(summarize|summary of|give me a summary of|what('?s| is) in) (this|the) (file|doc|document|content)/i, 'document summary key points main topics'],
    [/^(summarize|give me a summary|summarize everything|summarize all)/i, 'summary key points main topics overview'],
    [/^what('?s| is|are) (the )?(main |key )?(points?|topics?|takeaways?|highlights?)/i, 'main points key topics highlights summary'],
  ]

  for (const [pattern, expansion] of documentExpansions) {
    if (pattern.test(q)) {
      q = expansion
      break
    }
  }

  // Return the normalized form if it's meaningfully shorter OR expanded
  return q.length < query.length * 0.85 || q !== query.trim() ? q : query
}

/**
 * Enhanced context retrieval with similarity thresholds and token limits
 */
export async function getRelevantContext(
  userId: string,
  query: string,
  budget: ChatBudget,
  intentMode?: string,
  topKOverride?: number
): Promise<ContextRetrievalResult> {
  // Import searchDocuments dynamically to avoid circular dependencies
  const { searchDocuments } = await import('@/app/lib/vector/document-processor')
  
  // Effective topK: intent override takes priority over budget default
  const effectiveTopK = topKOverride ?? budget.topK

  // Quest 3D: Log retrieval start
  console.log('[retrieval:start]', {
    userId,
    query: query.slice(0, 100),
    budgetTopK: budget.topK,
    effectiveTopK,
    intentMode: intentMode ?? 'qa',
    budgetThreshold: budget.similarityThreshold,
    budgetTokenLimit: budget.contextTokenLimit
  })
  
  // Normalize the query before embedding — strips conversational framing
  // (e.g. "I have a prospect asking about X" → "X") to improve retrieval
  // precision without touching the similarity threshold.
  const retrievalQuery = normalizeQueryForRetrieval(query)
  if (retrievalQuery !== query) {
    console.log('[retrieval:query-normalized]', {
      original: query.slice(0, 100),
      normalized: retrievalQuery.slice(0, 100)
    })
  }

  // Search for documents with a higher limit to allow for filtering
  const searchResults = await searchDocuments(userId, retrievalQuery, {
    limit: effectiveTopK * 2, // Get more results to filter from
    threshold: 0.20, // Match budget threshold — pre-filter must not be more restrictive than budget
  })
  
  // Quest 3D: Log raw search results
  console.log('[retrieval:raw-results]', {
    userId,
    resultCount: searchResults.length,
    topScores: searchResults.slice(0, 3).map(r => r.similarity),
    fileIds: [...new Set(searchResults.map(r => r.fileId))],
    fileNames: [...new Set(searchResults.map(r => r.fileName))]
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

  // Apply token + chunk count limits.
  // Hard cap at 10 chunks — matches balanced budget topK=10.
  // Original 8-chunk limit was set when topK=6; raised to match the new topK.
  const MAX_CHUNKS = 10
  let totalTokens = 0
  const tokenLimitedResults: typeof thresholdFiltered = []
  let filteredByTokenLimit = 0

  for (const result of thresholdFiltered) {
    if (tokenLimitedResults.length >= MAX_CHUNKS) {
      filteredByTokenLimit++
      continue
    }
    // Rough token estimation: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(result.content.length / 4)
    
    if (totalTokens + estimatedTokens <= budget.contextTokenLimit) {
      tokenLimitedResults.push(result)
      totalTokens += estimatedTokens
    } else {
      filteredByTokenLimit++
    }
  }

  // Hard cap: send at most 10 chunks to the LLM — matches balanced budget topK=10.
  // Previous cap of 6 was silently overriding the topK=10 budget setting.
  // Monitor for latency regressions; reduce if gpt-4o times out on dense context.
  const MAX_CHUNKS_TO_LLM = 10
  const cappedResults = tokenLimitedResults.slice(0, MAX_CHUNKS_TO_LLM)

  if (tokenLimitedResults.length > MAX_CHUNKS_TO_LLM) {
    console.log('[retrieval:chunk-cap]', {
      before: tokenLimitedResults.length,
      after: MAX_CHUNKS_TO_LLM,
      droppedChunks: tokenLimitedResults.length - MAX_CHUNKS_TO_LLM
    })
  }

  // Convert to ContextSnippet format
  const contextSnippets: ContextSnippet[] = cappedResults.map(result => ({
    content: result.content,
    source: `${result.fileName} #${result.chunkIndex}`,
    relevance: result.similarity
  }))

  // Determine if we need more info based on context quality
  // If ANY context passed the similarity threshold, use it.
  // The threshold already filters low-quality results — don't second-guess it.
  const needMoreInfo = contextSnippets.length === 0

  // Quest 3D: Log final retrieval result
  console.log('[retrieval:final]', {
    userId,
    contextCount: contextSnippets.length,
    needMoreInfo,
    totalTokens,
    filteredByThreshold,
    filteredByTokenLimit,
    topRelevance: contextSnippets[0]?.relevance,
    sources: contextSnippets.map(c => c.source)
  })

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
  budget: ChatBudget,
  intentMode?: string,
  topKOverride?: number
): Promise<{
  contextSnippets: ContextSnippet[]
  shouldUseNeedMoreInfo: boolean
  retrievalStats: {
    totalTokens: number
    filteredByThreshold: number
    filteredByTokenLimit: number
  }
}> {
  const result = await getRelevantContext(userId, query, budget, intentMode, topKOverride)
  
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
