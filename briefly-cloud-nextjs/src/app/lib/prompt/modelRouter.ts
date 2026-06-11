export type UserTier = 'free' | 'pro' | 'pro_byok' | 'boost' | 'team' | 'enterprise'

type RouteOpts = { budget?: 'fast' | 'balanced' | 'quality'; tier?: UserTier }

// ─────────────────────────────────────────────────────────────────────────────
// Default models — Groq LPU inference (fast, cheap)
// Override via Vercel env vars — no code deploy needed to swap models.
//
//   CHAT_MODEL_PRO   default: llama-3.3-70b-versatile  $0.59/$0.79 per 1M  ~394 TPS
//   CHAT_MODEL_FREE  default: llama-3.1-8b-instant      $0.05/$0.08 per 1M  ~840 TPS
//   CHAT_MODEL_BOOST default: openai/gpt-oss-120b       $0.15/$0.60 per 1M  ~500 TPS
//
// Embeddings use Gemini Embedding 2 (gemini-embedding-2-preview) — SPEC 4 migration.
// Override any model via Vercel env vars — no code deploy needed.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_MODEL_PRO   = process.env.CHAT_MODEL_PRO   || 'llama-3.3-70b-versatile'  // Groq LPU — ~394 TPS
const DEFAULT_MODEL_FREE  = process.env.CHAT_MODEL_FREE  || 'llama-3.1-8b-instant'     // Groq LPU — ~840 TPS
const DEFAULT_MODEL_BOOST = process.env.CHAT_MODEL_BOOST || 'openai/gpt-oss-120b'      // Groq — ~500 TPS, $0.15/$0.60

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
    maxTokens: 2000,  // 2000 for all Llama models — 128K context, cost diff negligible ($0.00016 max)
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
  // Groq-hosted Llama models (fast LPU inference)
  'llama-3.3-70b-versatile': { inputPer1K: 0.00059, outputPer1K: 0.00079 },  // ~394 TPS
  'llama-3.1-70b-versatile': { inputPer1K: 0.00059, outputPer1K: 0.00079 },
  'llama-3.1-8b-instant':    { inputPer1K: 0.00005, outputPer1K: 0.00008 },  // ~840 TPS
  'llama-3.3-70b-specdec':   { inputPer1K: 0.00059, outputPer1K: 0.00099 },
  // Groq-hosted OpenAI-compatible models
  'openai/gpt-oss-120b':     { inputPer1K: 0.00015, outputPer1K: 0.00060 },  // ~500 TPS, boost tier
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
