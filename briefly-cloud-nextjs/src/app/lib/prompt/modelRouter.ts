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
