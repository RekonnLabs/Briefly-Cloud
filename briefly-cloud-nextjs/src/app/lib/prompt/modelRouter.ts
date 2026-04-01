export type UserTier = 'free' | 'pro' | 'team' | 'enterprise'

type RouteOpts = { budget?: 'fast' | 'balanced' | 'quality'; tier?: UserTier }

// ─────────────────────────────────────────────────────────────────────────────
// Default models — all Groq-hosted for fast LPU inference (~280 tok/sec).
// Override via Vercel env vars — no code deploy needed to swap models.
//
//   CHAT_MODEL_PRO   default: llama-3.3-70b-versatile  $0.59/$0.79 per 1M tokens
//                             Pro tier — strong quality, fast streaming
//   CHAT_MODEL_FREE  default: llama-3.1-8b-instant     $0.05/$0.08 per 1M tokens
//                             Free/trial tier — very fast, cost-effective
//   CHAT_MODEL_BOOST default: gpt-5                    $1.25/$10.00 per 1M tokens
//                             Premium on-demand when user explicitly requests boost
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_MODEL_PRO   = process.env.CHAT_MODEL_PRO   || 'llama-3.3-70b-versatile'  // Groq LPU — ~280 tok/sec
const DEFAULT_MODEL_FREE  = process.env.CHAT_MODEL_FREE  || 'llama-3.1-8b-instant'     // Groq LPU — ~600 tok/sec
const DEFAULT_MODEL_BOOST = process.env.CHAT_MODEL_BOOST || 'gpt-5'

export function pickModel(opts?: RouteOpts): string {
  if (opts?.budget === 'fast') return DEFAULT_MODEL_FREE
  if (opts?.budget === 'quality') return DEFAULT_MODEL_BOOST
  return DEFAULT_MODEL_PRO
}

export function routeModel(tier: UserTier, boost: boolean, routingSignals: any): { model: string; reason: string; estimatedCost: number } {
  let model: string
  let reason = 'default'

  if (boost) {
    model = DEFAULT_MODEL_BOOST
    reason = 'boost requested'
  } else if (tier === 'free') {
    model = DEFAULT_MODEL_FREE
    reason = 'free tier'
  } else {
    // pro / trial / team / enterprise
    model = DEFAULT_MODEL_PRO
    reason = 'pro tier default'
  }

  return {
    model,
    reason,
    estimatedCost: model.includes('8b') ? 0.00005      // Groq Llama 8B — near-free
      : model.includes('nano') ? 0.0003
      : model.includes('mini') ? 0.001
      : model.startsWith('llama') ? 0.0007  // Groq Llama 70B pricing
      : 0.005
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
    maxTokens: model.includes('nano') || model.includes('8b') ? 1000 : 2000,  // 8b/nano: 1000 (cost); 70b/mini+: 2000 (summaries were truncating)
    temperature: 0.7
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Model pricing table — verified March 2026 from OpenAI pricing page
// Update this table when OpenAI changes pricing or you add new models.
// To upgrade the default model: change CHAT_MODEL_PRO/FREE/BOOST env vars
// in Vercel — no code deploy needed.
// ─────────────────────────────────────────────────────────────────────────────
interface ModelPricing {
  inputPer1K: number   // USD per 1,000 input tokens
  outputPer1K: number  // USD per 1,000 output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-5 family (current production models — March 2026)
  // OpenAI returns versioned strings like "gpt-5-mini-2025-08-07";
  // normalizeModelName() strips the date suffix to match these base keys.
  'gpt-5-mini': { inputPer1K: 0.00025, outputPer1K: 0.002  },  // $0.25/$2.00 per 1M tokens
  'gpt-5-nano': { inputPer1K: 0.00005, outputPer1K: 0.0004 },  // $0.05/$0.40 per 1M tokens
  'gpt-5':      { inputPer1K: 0.0125,  outputPer1K: 0.05   },  // estimate — update when confirmed
  // GPT-5.4 family (current — March 2026)
  'gpt-5.4':      { inputPer1K: 0.0025,  outputPer1K: 0.015  },
  'gpt-5.4-mini': { inputPer1K: 0.00075, outputPer1K: 0.0045 },
  'gpt-5.4-nano': { inputPer1K: 0.0002,  outputPer1K: 0.00125 },
  'gpt-5.4-pro':  { inputPer1K: 0.03,    outputPer1K: 0.18   },
  // GPT-4.1 family (legacy — still available)
  'gpt-4.1':      { inputPer1K: 0.002,   outputPer1K: 0.008  },
  'gpt-4.1-mini': { inputPer1K: 0.0004,  outputPer1K: 0.0016 },
  'gpt-4.1-nano': { inputPer1K: 0.0001,  outputPer1K: 0.0004 },
  // GPT-4o family (legacy — kept for reference)
  'gpt-4o':       { inputPer1K: 0.0025,  outputPer1K: 0.01   },
  'gpt-4o-mini':  { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  // Groq-hosted Llama models (fast LPU inference — ~280 tok/sec)
  'llama-3.3-70b-versatile': { inputPer1K: 0.00059, outputPer1K: 0.00079 },
  'llama-3.1-70b-versatile': { inputPer1K: 0.00059, outputPer1K: 0.00079 },
  'llama-3.1-8b-instant':    { inputPer1K: 0.00005, outputPer1K: 0.00008 },
  'llama-3.3-70b-specdec':   { inputPer1K: 0.00059, outputPer1K: 0.00099 },
}

// Default pricing for unknown/future models (conservative estimate)
const DEFAULT_PRICING: ModelPricing = { inputPer1K: 0.005, outputPer1K: 0.015 }

/**
 * Normalize versioned model names to their base pricing key.
 * Providers return versioned names like "gpt-5.4-2026-03-15" but our
 * pricing table uses base names like "gpt-5.4". Without normalization,
 * new model versions silently fall back to DEFAULT_PRICING.
 */
function normalizeModelName(model: string): string {
  if (MODEL_PRICING[model]) return model

  const parts = model.split('-')
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('-')
    if (MODEL_PRICING[candidate]) return candidate
  }

  console.warn(`[modelRouter:pricing] Unknown model "${model}" — using default pricing. Add it to MODEL_PRICING if this is a new model.`)
  return model
}

/**
 * Compute estimated cost from actual token counts x model pricing.
 * Returns USD as a number (e.g., 0.000345).
 */
export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const normalized = normalizeModelName(model)
  const pricing = MODEL_PRICING[normalized] || DEFAULT_PRICING
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}
