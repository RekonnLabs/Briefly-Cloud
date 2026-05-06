export type Budget = 'fast' | 'balanced' | 'quality'

export interface ChatBudget {
  model: string
  maxTokens: number
  topK: number
  contextTokenLimit: number
  similarityThreshold: number
}

// Gemini Embedding 2 cosine similarity thresholds.
// Score ranges differ from text-embedding-3-small — tune via SIMILARITY_THRESHOLD env var
// after first real imports rather than relying on these defaults.
// Default values retained from prior calibration; expect adjustment needed post-migration.
const DEFAULT_THRESHOLD = process.env.SIMILARITY_THRESHOLD
  ? parseFloat(process.env.SIMILARITY_THRESHOLD)
  : null

export const BUDGETS: Record<Budget, ChatBudget> = {
  fast: { 
    model: 'gpt-4o-mini', 
    maxTokens: 1000, 
    topK: 4,
    contextTokenLimit: 2000,
    similarityThreshold: DEFAULT_THRESHOLD ?? 0.20 // lowered from 0.30 — broader recall for fragmented/checklist docs
  },
  balanced: { 
    model: 'gpt-4o', 
    maxTokens: 2000, 
    topK: 10,           // raised from 6 — with 4 docs × 5 chunks = 20 total, topK=6 only
                        // retrieved 12 raw candidates and missed lower-ranked but relevant chunks
    contextTokenLimit: 4000,
    similarityThreshold: DEFAULT_THRESHOLD ?? 0.20  // only active budget currently
  },
  quality: { 
    model: 'gpt-4o', 
    maxTokens: 4000, 
    topK: 8,
    contextTokenLimit: 8000,
    similarityThreshold: DEFAULT_THRESHOLD ?? 0.35
  }
} as const

// NOTE: chooseBudget() currently hardcodes 'balanced' — fast and quality are inactive.
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
