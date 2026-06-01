/**
 * Conversation Memory v1 — Selective Window
 * Quest M1: M1_CONVERSATION_MEMORY_V1
 *
 * Injects a selective window of prior conversation turns into the LLM prompt,
 * gated by embedding-based relevance scoring with a heuristic fallback.
 *
 * Design principles:
 * - Selective, not blind "last N" — only relevant prior turns are included
 * - Token-budgeted — memory never exceeds MEMORY_TOKEN_BUDGET
 * - Embedding-first, heuristic-fallback — cheap embedding similarity preferred
 * - Telemetry-rich — every decision is logged for provenance
 */

import { generateEmbeddings } from '@/app/lib/openai'
import { supabaseApp } from '@/app/lib/supabase-clients'
import type { ChatMsg } from './promptBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const N_TURNS_MAX = 4          // Up to 4 turns (8 messages: 4 user + 4 assistant)
export const N_TURNS_MIN = 1          // Always include at least the most recent turn if it passes gate
export const MEMORY_TOKEN_BUDGET = 600 // Hard cap on memory tokens
export const MAX_CANDIDATE_USER_MESSAGES = 10

// Embedding similarity thresholds
const EMBEDDING_THRESHOLD = 0.78       // General threshold for prior user messages
const LAST_PAIR_THRESHOLD = 0.70       // Lower threshold for immediate continuity (last turn)

// Heuristic constants
const FOLLOW_UP_SIGNALS = new Set([
  'that', 'this', 'previous', 'earlier', 'above', 'it', 'those', 'these',
  'same', 'again', 'more', 'also', 'further', 'continue', 'follow up',
  'follow-up', 'followup', 'what about', 'how about', 'and', 'but'
])

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'about', 'between',
  'under', 'above', 'up', 'down', 'out', 'off', 'over', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'so', 'than', 'too', 'very', 'just', 'because',
  'but', 'and', 'or', 'if', 'while', 'what', 'which', 'who', 'whom',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their'
])

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface MemoryTurn {
  userMessage: string
  assistantMessage: string
  createdAt: string
}

export type MemoryGateType = 'embedding' | 'heuristic' | 'none'

export interface MemoryResult {
  /** Selected messages to inject into the prompt (role-alternating) */
  messages: ChatMsg[]
  /** Telemetry stats for provenance */
  stats: {
    memoryEnabled: boolean
    memoryCandidates: number
    memoryIncluded: number
    memoryTokensEstimated: number
    memoryGate: MemoryGateType
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/** Estimate token count for a string (chars / 4 is a reasonable approximation) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Strip UI badges and disclaimers from assistant messages before injecting
 * into memory. Prevents feedback loops where the LLM sees its own provenance
 * metadata and starts echoing it.
 */
function stripUiBadges(content: string): string {
  return content
    // Remove provenance disclaimers
    .replace(/This answer is based on general knowledge, not your uploaded documents\.\s*/gi, '')
    .replace(/Warning: .*(ungrounded|not grounded|not in the retrieved).*\.\s*/gi, '')
    // Remove [Source: ...] citations — the LLM will re-derive these from fresh context
    .replace(/\s?\[Source:\s*[^\]]+\]/gi, '')
    // Remove "Actionable next step:" blocks that are quest-specific
    .replace(/Actionable next step:.*$/gim, '')
    .trim()
}

/**
 * Extract non-stopword tokens from a message for heuristic comparison.
 */
function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
  return new Set(words.filter(w => w.length > 1 && !STOPWORDS.has(w)))
}

/**
 * Check if a token looks like a marker/ID (ALLCAPS, contains underscores, etc.)
 */
function isMarkerLike(token: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,}$/.test(token) || /\.\w{2,4}$/.test(token) // ALLCAPS_MARKER or filename.ext
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic relevance gate (Option B — fallback)
// ─────────────────────────────────────────────────────────────────────────────

function heuristicRelevance(newMessage: string, candidateMessage: string, isLastPair: boolean): boolean {
  const newLower = newMessage.toLowerCase()

  // Follow-up signal detection: if the new message contains follow-up words,
  // include the last 1-2 turns regardless
  if (isLastPair) {
    const newWords = newLower.split(/\s+/)
    for (const word of newWords) {
      if (FOLLOW_UP_SIGNALS.has(word)) return true
    }
    // Also check 2-word phrases
    for (let i = 0; i < newWords.length - 1; i++) {
      const bigram = `${newWords[i]} ${newWords[i + 1]}`
      if (FOLLOW_UP_SIGNALS.has(bigram)) return true
    }
  }

  // Keyword overlap: >= 2 shared non-stopwords
  const newKeywords = extractKeywords(newMessage)
  const candidateKeywords = extractKeywords(candidateMessage)
  let overlap = 0
  for (const kw of newKeywords) {
    if (candidateKeywords.has(kw)) overlap++
  }
  if (overlap >= 2) return true

  // Marker/ID pattern matching
  const newTokens = newMessage.split(/\s+/)
  const candidateTokens = candidateMessage.split(/\s+/)
  const newMarkers = newTokens.filter(isMarkerLike)
  const candidateMarkers = candidateTokens.filter(isMarkerLike)
  if (newMarkers.length > 0 && candidateMarkers.length > 0) {
    // Both messages contain marker-like tokens
    for (const nm of newMarkers) {
      for (const cm of candidateMarkers) {
        if (nm.toLowerCase() === cm.toLowerCase()) return true
      }
    }
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: selectMemory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch conversation history and select relevant turns for memory injection.
 *
 * @param userId - The authenticated user's ID
 * @param conversationId - The current conversation ID (null = no memory)
 * @param newUserMessage - The new user message to compare against
 * @param availableBudget - Token budget available for memory (may be reduced if RAG context is large)
 * @returns MemoryResult with selected messages and telemetry stats
 */
export async function selectMemory(
  userId: string,
  conversationId: string | null | undefined,
  newUserMessage: string,
  availableBudget: number = MEMORY_TOKEN_BUDGET
): Promise<MemoryResult> {
  const noMemory: MemoryResult = {
    messages: [],
    stats: {
      memoryEnabled: false,
      memoryCandidates: 0,
      memoryIncluded: 0,
      memoryTokensEstimated: 0,
      memoryGate: 'none'
    }
  }

  // No conversation → no memory
  if (!conversationId) return noMemory

  // ── Fetch candidate messages ────────────────────────────────────────
  // Get the last N messages (up to 2 * MAX_CANDIDATE_USER_MESSAGES to capture
  // both user and assistant messages in alternating order)
  let candidateRows: { role: string; content: string; created_at: string }[]
  try {
    const { data, error } = await supabaseApp
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CANDIDATE_USER_MESSAGES * 2)

    if (error) throw error
    if (!data || data.length === 0) return noMemory

    candidateRows = data.reverse() // Oldest first
  } catch (err) {
    console.warn('[memory:fetch] Failed to fetch conversation history — no memory', {
      error: err instanceof Error ? err.message : String(err),
      conversationId
    })
    return noMemory
  }

  // ── Pair into turns ─────────────────────────────────────────────────
  // A "turn" is a user message followed by an assistant message
  const turns: MemoryTurn[] = []
  for (let i = 0; i < candidateRows.length - 1; i++) {
    if (candidateRows[i].role === 'user' && candidateRows[i + 1].role === 'assistant') {
      turns.push({
        userMessage: candidateRows[i].content,
        assistantMessage: candidateRows[i + 1].content,
        createdAt: candidateRows[i].created_at
      })
      i++ // Skip the assistant message (already paired)
    }
  }

  if (turns.length === 0) return noMemory

  // Limit to last N_TURNS_MAX turns as candidates
  const candidateTurns = turns.slice(-N_TURNS_MAX)
  const totalCandidates = candidateTurns.length

  console.log('[memory:candidates]', {
    totalHistoryRows: candidateRows.length,
    pairedTurns: turns.length,
    candidateTurns: totalCandidates,
    conversationId
  })

  // ── Relevance gating ────────────────────────────────────────────────
  let gateType: MemoryGateType = 'none'
  let scoredTurns: { turn: MemoryTurn; score: number; included: boolean; isLast: boolean }[]

  try {
    // Option A: Embedding-based relevance gate
    const textsToEmbed = [
      newUserMessage,
      ...candidateTurns.map(t => t.userMessage)
    ]

    const embeddings = await generateEmbeddings(textsToEmbed)
    const newMessageEmbedding = embeddings[0]
    const candidateEmbeddings = embeddings.slice(1)

    scoredTurns = candidateTurns.map((turn, i) => {
      const similarity = cosineSimilarity(newMessageEmbedding, candidateEmbeddings[i])
      const isLast = i === candidateTurns.length - 1
      const threshold = isLast ? LAST_PAIR_THRESHOLD : EMBEDDING_THRESHOLD
      return {
        turn,
        score: similarity,
        included: similarity >= threshold,
        isLast
      }
    })

    gateType = 'embedding'

    console.log('[memory:embedding-scores]', {
      scores: scoredTurns.map(s => ({
        preview: s.turn.userMessage.slice(0, 50),
        similarity: Math.round(s.score * 1000) / 1000,
        threshold: s.isLast ? LAST_PAIR_THRESHOLD : EMBEDDING_THRESHOLD,
        included: s.included,
        isLast: s.isLast
      })),
      conversationId
    })

  } catch (embeddingErr) {
    // Option B: Heuristic fallback
    console.warn('[memory:embedding-failed] Falling back to heuristic gate', {
      error: embeddingErr instanceof Error ? embeddingErr.message : String(embeddingErr),
      conversationId
    })

    scoredTurns = candidateTurns.map((turn, i) => {
      const isLast = i === candidateTurns.length - 1
      const included = heuristicRelevance(newUserMessage, turn.userMessage, isLast)
      return {
        turn,
        score: included ? 1.0 : 0.0,
        included,
        isLast
      }
    })

    gateType = 'heuristic'

    console.log('[memory:heuristic-scores]', {
      scores: scoredTurns.map(s => ({
        preview: s.turn.userMessage.slice(0, 50),
        included: s.included,
        isLast: s.isLast
      })),
      conversationId
    })
  }

  // ── Enforce N_TURNS_MIN: always include at least the last turn if it passed gate ──
  // If no turns passed the embedding gate, run the heuristic gate as a secondary
  // check before giving up. This handles cases like "Where else does that appear?"
  // where embedding similarity is low but the follow-up signal is clear.
  let includedTurns = scoredTurns.filter(s => s.included)
  if (includedTurns.length === 0 && scoredTurns.length > 0) {
    if (gateType === 'embedding') {
      // Secondary: run heuristic gate on turns that the embedding gate excluded
      console.log('[memory:secondary-heuristic] Embedding gate returned 0 — running heuristic as secondary check', {
        conversationId
      })

      const heuristicRescored = scoredTurns.map((s, i) => {
        const isLast = i === scoredTurns.length - 1
        const heuristicPass = heuristicRelevance(newUserMessage, s.turn.userMessage, isLast)
        return { ...s, included: heuristicPass }
      })

      const heuristicIncluded = heuristicRescored.filter(s => s.included)
      if (heuristicIncluded.length > 0) {
        // Use heuristic results instead
        scoredTurns.forEach((s, i) => { s.included = heuristicRescored[i].included })
        gateType = 'heuristic'
        console.log('[memory:secondary-heuristic] Heuristic gate included turns', {
          included: heuristicIncluded.length,
          conversationId
        })
      } else {
        // Final fallback: N_TURNS_MIN — include last turn if embedding score >= 0.40
        const lastScored = scoredTurns[scoredTurns.length - 1]
        if (lastScored.score >= 0.40) {
          lastScored.included = true
          console.log('[memory:min-turn] Including last turn via N_TURNS_MIN relaxation', {
            score: lastScored.score,
            conversationId
          })
        }
      }
    } else if (gateType === 'heuristic') {
      // For heuristic: if the new message looks like a follow-up, include last turn
      const newLower = newUserMessage.toLowerCase()
      const words = newLower.split(/\s+/)
      const hasFollowUp = words.some(w => FOLLOW_UP_SIGNALS.has(w))
      if (hasFollowUp) {
        const lastScored = scoredTurns[scoredTurns.length - 1]
        lastScored.included = true
        console.log('[memory:min-turn] Including last turn via follow-up signal', {
          conversationId
        })
      }
    }
    // Recompute includedTurns after secondary checks
    includedTurns = scoredTurns.filter(s => s.included)
  }

  // ── Token budgeting: fit selected turns within budget ───────────────
  const effectiveBudget = Math.min(availableBudget, MEMORY_TOKEN_BUDGET)
  const selectedMessages: ChatMsg[] = []
  let totalTokens = 0

  // Process in chronological order (oldest first) to maintain conversation flow
  for (const scored of scoredTurns) {
    if (!scored.included) continue

    const userTokens = estimateTokens(scored.turn.userMessage)
    const assistantContent = stripUiBadges(scored.turn.assistantMessage)
    const assistantTokens = estimateTokens(assistantContent)
    const turnTokens = userTokens + assistantTokens

    if (totalTokens + turnTokens > effectiveBudget) {
      console.log('[memory:budget-exceeded] Stopping turn inclusion', {
        currentTokens: totalTokens,
        turnTokens,
        budget: effectiveBudget,
        conversationId
      })
      break
    }

    selectedMessages.push(
      { role: 'user', content: scored.turn.userMessage },
      { role: 'assistant', content: assistantContent }
    )
    totalTokens += turnTokens
  }

  console.log('[memory:result]', {
    gate: gateType,
    candidates: totalCandidates,
    included: selectedMessages.length / 2,
    tokensEstimated: totalTokens,
    budget: effectiveBudget,
    conversationId
  })

  return {
    messages: selectedMessages,
    stats: {
      memoryEnabled: true,
      memoryCandidates: totalCandidates,
      memoryIncluded: selectedMessages.length / 2, // Number of turns
      memoryTokensEstimated: totalTokens,
      memoryGate: gateType
    }
  }
}
