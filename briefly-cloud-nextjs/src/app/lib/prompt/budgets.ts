export type Budget = 'fast' | 'balanced' | 'quality'

export interface ChatBudget {
  model: string
  maxTokens: number
  topK: number
  contextTokenLimit: number
  similarityThreshold: number
}

export const BUDGETS: Record<Budget, ChatBudget> = {
  // text-embedding-3-small cosine similarity ranges:
  // 0.7+  = strong match (exact or near-exact content)
  // 0.5-0.7 = good semantic match
  // 0.3-0.5 = weak/tangential match
  // <0.3  = likely irrelevant
  fast: { 
    model: 'gpt-4o-mini', 
    maxTokens: 1000, 
    topK: 4,
    contextTokenLimit: 2000,
    similarityThreshold: 0.3  // lowered from 0.45 — checklist/fragmented docs score lower by nature
  },
  balanced: { 
    model: 'gpt-4o', 
    maxTokens: 2000, 
    topK: 10,           // raised from 6 — with 4 docs × 5 chunks = 20 total, topK=6 only
                        // retrieved 12 raw candidates and missed lower-ranked but relevant chunks
    contextTokenLimit: 4000,
    similarityThreshold: 0.30
  },
  quality: { 
    model: 'gpt-4o', 
    maxTokens: 4000, 
    topK: 8,
    contextTokenLimit: 8000,
    similarityThreshold: 0.35
  }
} as const

export function chooseBudget(_input?: unknown): Budget {
  return 'balanced'
}

export function getBudgetForTier(tier: string): Budget {
  switch (tier) {
    case 'free':
      return 'fast'
    case 'pro':
    case 'team':
      return 'balanced'
    case 'enterprise':
      return 'quality'
    default:
      return 'fast'
  }
}
