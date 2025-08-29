export type UserTier = 'free' | 'pro' | 'team' | 'enterprise'

type RouteOpts = { budget?: 'fast' | 'balanced' | 'quality'; tier?: UserTier }

export function pickModel(opts?: RouteOpts): string {
  // If you keep an env like OPENAI_MODEL, use it; otherwise pick a sensible default.
  return process.env.OPENAI_MODEL || (opts?.budget === 'fast' ? 'gpt-4o-mini' : 'gpt-4o')
}

export function routeModel(query: string, tier?: UserTier): string {
  // Simple routing based on tier
  if (tier === 'free') return 'gpt-4o-mini'
  return 'gpt-4o'
}

export function analyzeQuery(query: string): { complexity: 'simple' | 'complex'; budget: 'fast' | 'balanced' | 'quality' } {
  const isComplex = query.length > 200 || query.includes('analyze') || query.includes('explain')
  return {
    complexity: isComplex ? 'complex' : 'simple',
    budget: isComplex ? 'quality' : 'balanced'
  }
}

export function getModelConfig(model: string) {
  return {
    model,
    maxTokens: model.includes('mini') ? 1000 : 4000,
    temperature: 0.7
  }
}