export type UserTier = 'free' | 'pro' | 'team' | 'enterprise'

type RouteOpts = { budget?: 'fast' | 'balanced' | 'quality'; tier?: UserTier }

export function pickModel(opts?: RouteOpts): string {
  // If you keep an env like OPENAI_MODEL, use it; otherwise pick a sensible default.
  return process.env.OPENAI_MODEL || (opts?.budget === 'fast' ? 'gpt-4o-mini' : 'gpt-4o')
}

export function routeModel(tier: UserTier, boost: boolean, routingSignals: any): { model: string; reason: string; estimatedCost: number } {
  // Updated to use GPT-5 models (matching openai.ts configuration)
  const FEATURE_GPT5 = String(process.env.FEATURE_GPT5 || 'true').toLowerCase() === 'true'
  
  let model: string
  let reason = 'default'
  
  if (tier === 'free') {
    model = FEATURE_GPT5 ? 'gpt-5-mini' : 'gpt-4o-mini'
    reason = 'free tier'
  } else if (boost) {
    // Boost uses the highest tier model
    model = FEATURE_GPT5 ? 'gpt-5.1' : 'gpt-4o'
    reason = 'boost requested'
  } else {
    // Pro tier default
    model = FEATURE_GPT5 ? 'gpt-5.1' : 'gpt-4o'
    reason = 'pro tier default'
  }
  
  return {
    model,
    reason,
    estimatedCost: model.includes('mini') || model.includes('nano') ? 0.001 : 0.01
  }
}

export function analyzeQuery(query: string, contextSnippets: any[], history: any[]): any {
  const isComplex = query.length > 200 || query.includes('analyze') || query.includes('explain')
  return {
    complexity: isComplex ? 'complex' : 'simple',
    budget: isComplex ? 'quality' : 'balanced',
    contextRelevance: contextSnippets.length > 0 ? 'high' : 'low'
  }
}

export function getModelConfig(model: string) {
  return {
    model,
    maxTokens: model.includes('mini') ? 1000 : 4000,
    temperature: 0.7
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Model pricing table — cost per 1K tokens (USD)
// These are OUR estimates based on published OpenAI pricing.
// NOT sourced from provider invoices. Treat as approximate for analytics.
// Update when models change or new pricing is published.
// ─────────────────────────────────────────────────────────────────────────────
interface ModelPricing {
  inputPer1K: number   // USD per 1,000 input tokens
  outputPer1K: number  // USD per 1,000 output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-5 family
  'gpt-5.1':      { inputPer1K: 0.005,   outputPer1K: 0.015   },
  'gpt-5-mini':   { inputPer1K: 0.0004,  outputPer1K: 0.0016  },
  'gpt-5-nano':   { inputPer1K: 0.0001,  outputPer1K: 0.0004  },
  // GPT-4 family (legacy fallbacks)
  'gpt-4o':       { inputPer1K: 0.005,   outputPer1K: 0.015   },
  'gpt-4o-mini':  { inputPer1K: 0.00015, outputPer1K: 0.0006  },
  'gpt-4.1-mini': { inputPer1K: 0.0004,  outputPer1K: 0.0016  },
  'gpt-4.1-nano': { inputPer1K: 0.0001,  outputPer1K: 0.0004  },
}

// Default pricing for unknown models (conservative estimate)
const DEFAULT_PRICING: ModelPricing = { inputPer1K: 0.005, outputPer1K: 0.015 }

/**
 * Compute estimated cost from actual token counts × model pricing.
 * Returns USD as a number (e.g., 0.000345).
 */
export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K
  // Round to 6 decimal places to avoid floating-point noise
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}
