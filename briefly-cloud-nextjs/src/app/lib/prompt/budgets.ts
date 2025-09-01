export type Budget = 'fast' | 'balanced' | 'quality'

export interface ChatBudget {
  model: string
  maxTokens: number
  topK: number
  contextTokenLimit: number
  similarityThreshold: number
}

export const BUDGETS: Record<Budget, ChatBudget> = {
  fast: { 
    model: 'gpt-4o-mini', 
    maxTokens: 1000, 
    topK: 4,
    contextTokenLimit: 2000,
    similarityThreshold: 0.7
  },
  balanced: { 
    model: 'gpt-4o', 
    maxTokens: 2000, 
    topK: 6,
    contextTokenLimit: 4000,
    similarityThreshold: 0.6
  },
  quality: { 
    model: 'gpt-4o', 
    maxTokens: 4000, 
    topK: 8,
    contextTokenLimit: 8000,
    similarityThreshold: 0.5
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