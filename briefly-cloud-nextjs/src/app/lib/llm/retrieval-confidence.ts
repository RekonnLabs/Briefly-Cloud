/**
 * Retrieval Confidence Evaluation
 * 
 * Evaluates the quality and relevance of retrieved document chunks
 * to determine if they're sufficient to answer the user's question.
 */

export interface RetrievalScore {
  topScore: number        // Highest cosine similarity score
  matchedChunks: number  // Number of chunks above threshold
  averageScore: number   // Average similarity across matched chunks
  totalChunks: number    // Total chunks retrieved
}

export interface RetrievalConfidence {
  isSufficient: boolean
  level: 'high' | 'medium' | 'low' | 'none'
  score: RetrievalScore
  reasoning: string
}

// Confidence thresholds from policy
export const HIGH_CONFIDENCE_THRESHOLD = 0.72
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.62
export const MINIMUM_CHUNKS_FOR_MEDIUM = 2

/**
 * Evaluate if retrieval results are sufficient to answer the question
 */
export function evaluateRetrievalConfidence(
  retrievedChunks: Array<{ relevance: number; content: string }>,
  minThreshold: number = MEDIUM_CONFIDENCE_THRESHOLD
): RetrievalConfidence {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      isSufficient: false,
      level: 'none',
      score: {
        topScore: 0,
        matchedChunks: 0,
        averageScore: 0,
        totalChunks: 0
      },
      reasoning: 'No chunks retrieved'
    }
  }

  const scores = retrievedChunks.map(chunk => chunk.relevance)
  const topScore = Math.max(...scores)
  const matchedChunks = scores.filter(s => s >= minThreshold).length
  const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length

  const score: RetrievalScore = {
    topScore,
    matchedChunks,
    averageScore,
    totalChunks: retrievedChunks.length
  }

  // Determine if retrieval is sufficient
  const isSufficient = isRetrievalSufficient(score)

  // Determine confidence level
  let level: 'high' | 'medium' | 'low' | 'none'
  let reasoning: string

  if (topScore >= HIGH_CONFIDENCE_THRESHOLD) {
    level = 'high'
    reasoning = `Top match has high relevance (${topScore.toFixed(3)})`
  } else if (topScore >= MEDIUM_CONFIDENCE_THRESHOLD && matchedChunks >= MINIMUM_CHUNKS_FOR_MEDIUM) {
    level = 'medium'
    reasoning = `${matchedChunks} chunks with medium+ relevance (top: ${topScore.toFixed(3)})`
  } else if (matchedChunks > 0) {
    level = 'low'
    reasoning = `Only ${matchedChunks} chunks above threshold (top: ${topScore.toFixed(3)})`
  } else {
    level = 'none'
    reasoning = `No chunks meet minimum threshold (top: ${topScore.toFixed(3)} < ${minThreshold.toFixed(2)})`
  }

  return {
    isSufficient,
    level,
    score,
    reasoning
  }
}

/**
 * Core logic from policy document
 */
export function isRetrievalSufficient(score: RetrievalScore): boolean {
  return (
    score.topScore >= HIGH_CONFIDENCE_THRESHOLD ||
    (score.topScore >= MEDIUM_CONFIDENCE_THRESHOLD && score.matchedChunks >= MINIMUM_CHUNKS_FOR_MEDIUM)
  )
}

/**
 * Format retrieval stats for logging
 */
export function formatRetrievalStats(confidence: RetrievalConfidence): Record<string, unknown> {
  return {
    sufficient: confidence.isSufficient,
    level: confidence.level,
    topScore: confidence.score.topScore.toFixed(3),
    matchedChunks: confidence.score.matchedChunks,
    averageScore: confidence.score.averageScore.toFixed(3),
    totalChunks: confidence.score.totalChunks,
    reasoning: confidence.reasoning
  }
}
