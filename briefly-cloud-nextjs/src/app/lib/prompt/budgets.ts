export type Budget = 'fast' | 'balanced' | 'quality'

export const BUDGETS = {
  fast: { model: 'gpt-4o-mini', maxTokens: 1000, TOP_K: 4 },
  balanced: { model: 'gpt-4o', maxTokens: 2000, TOP_K: 6 },
  quality: { model: 'gpt-4o', maxTokens: 4000, TOP_K: 8 }
} as const

export function chooseBudget(_input?: unknown): Budget {
  return 'balanced'
}