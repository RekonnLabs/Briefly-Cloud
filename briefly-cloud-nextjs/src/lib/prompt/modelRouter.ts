/**
 * Briefly Voice v1 - Model Router
 * 
 * Intelligent routing between different LLM models based on user tier,
 * complexity signals, and boost preferences. Optimizes cost vs quality.
 */

export type ModelRoute = 'nano' | 'mini' | 'gpt5';
export type UserTier = 'free' | 'pro' | 'enterprise';

export interface RoutingSignals {
  complexity?: number;      // 0-1 scale, higher = more complex
  confidence?: number;      // 0-1 scale, higher = more confident
  outputLength?: 'short' | 'medium' | 'long';
  hasContext?: boolean;
  toolsRequired?: boolean;
  userPreference?: ModelRoute;
}

export interface RoutingResult {
  model: ModelRoute;
  reason: string;
  confidence: number;
  estimatedCost: 'low' | 'medium' | 'high';
}

/**
 * Route to appropriate model based on tier, boost, and signals
 */
export function routeModel(
  tier: UserTier,
  boost: boolean = false,
  signals: RoutingSignals = {}
): RoutingResult {
  const {
    complexity = 0.5,
    confidence = 0.8,
    outputLength = 'medium',
    hasContext = false,
    toolsRequired = false,
    userPreference
  } = signals;
  
  // Honor explicit user preference if valid for their tier
  if (userPreference && isValidForTier(userPreference, tier, boost)) {
    return {
      model: userPreference,
      reason: 'User preference',
      confidence: 1.0,
      estimatedCost: getCostLevel(userPreference)
    };
  }
  
  // Free tier routing
  if (tier === 'free') {
    return routeFreeTier(complexity, confidence, outputLength, hasContext, toolsRequired);
  }
  
  // Pro/Enterprise tier routing
  if (boost) {
    return {
      model: 'gpt5',
      reason: 'Boost mode enabled',
      confidence: 0.95,
      estimatedCost: 'high'
    };
  }
  
  return routeProTier(complexity, confidence, outputLength, hasContext, toolsRequired);
}

/**
 * Route for free tier users
 */
function routeFreeTier(
  complexity: number,
  confidence: number,
  outputLength: string,
  hasContext: boolean,
  toolsRequired: boolean
): RoutingResult {
  // Default to nano for free users
  let model: ModelRoute = 'nano';
  let reason = 'Free tier default';
  
  // Escalate to mini for complex scenarios
  const escalationScore = calculateEscalationScore(
    complexity, confidence, outputLength, hasContext, toolsRequired
  );
  
  if (escalationScore > 0.7) {
    model = 'mini';
    reason = 'Escalated due to complexity';
  }
  
  return {
    model,
    reason,
    confidence: confidence,
    estimatedCost: getCostLevel(model)
  };
}

/**
 * Route for pro/enterprise tier users
 */
function routeProTier(
  complexity: number,
  confidence: number,
  outputLength: string,
  hasContext: boolean,
  toolsRequired: boolean
): RoutingResult {
  // Default to mini for pro users
  let model: ModelRoute = 'mini';
  let reason = 'Pro tier default';
  
  // Consider escalation to GPT-5 for very complex tasks
  if (complexity > 0.8 && (toolsRequired || outputLength === 'long')) {
    model = 'gpt5';
    reason = 'High complexity with tools/long output';
  }
  
  return {
    model,
    reason,
    confidence: confidence,
    estimatedCost: getCostLevel(model)
  };
}

/**
 * Calculate escalation score based on various signals
 */
function calculateEscalationScore(
  complexity: number,
  confidence: number,
  outputLength: string,
  hasContext: boolean,
  toolsRequired: boolean
): number {
  let score = 0;
  
  // Complexity contributes most to escalation
  score += complexity * 0.4;
  
  // Low confidence suggests need for better model
  score += (1 - confidence) * 0.3;
  
  // Output length requirements
  const lengthScore = outputLength === 'long' ? 0.3 : outputLength === 'medium' ? 0.1 : 0;
  score += lengthScore * 0.15;
  
  // Context and tools add complexity
  if (hasContext) score += 0.1;
  if (toolsRequired) score += 0.15;
  
  return Math.min(score, 1.0);
}

/**
 * Check if model is valid for user tier and boost status
 */
function isValidForTier(model: ModelRoute, tier: UserTier, boost: boolean): boolean {
  if (tier === 'free') {
    return model === 'nano' || model === 'mini';
  }
  
  if (tier === 'pro' || tier === 'enterprise') {
    if (model === 'gpt5') {
      return boost; // GPT-5 only available with boost
    }
    return true; // nano and mini always available
  }
  
  return false;
}

/**
 * Get cost level for model
 */
function getCostLevel(model: ModelRoute): 'low' | 'medium' | 'high' {
  switch (model) {
    case 'nano': return 'low';
    case 'mini': return 'medium';
    case 'gpt5': return 'high';
    default: return 'medium';
  }
}

/**
 * Get model configuration for API calls
 */
export function getModelConfig(route: ModelRoute): {
  model: string;
  maxTokens: number;
  temperature: number;
} {
  switch (route) {
    case 'nano':
      return {
        model: 'gpt-4o-mini', // Using available model
        maxTokens: 600,
        temperature: 0.7
      };
    case 'mini':
      return {
        model: 'gpt-4o', // Using available model
        maxTokens: 1000,
        temperature: 0.7
      };
    case 'gpt5':
      return {
        model: 'gpt-4o', // Using best available model
        maxTokens: 1200,
        temperature: 0.6
      };
    default:
      return {
        model: 'gpt-4o-mini',
        maxTokens: 600,
        temperature: 0.7
      };
  }
}

/**
 * Analyze query to generate routing signals
 */
export function analyzeQuery(
  userMessage: string,
  contextSnippets?: any[],
  toolsUsed?: string[]
): RoutingSignals {
  const messageLength = userMessage.length;
  const wordCount = userMessage.split(/\s+/).length;
  
  // Estimate complexity based on message characteristics
  let complexity = 0.3; // Base complexity
  
  // Longer messages often indicate more complex queries
  if (wordCount > 50) complexity += 0.2;
  if (wordCount > 100) complexity += 0.2;
  
  // Question words and complexity indicators
  const complexityIndicators = [
    /how do i/i, /explain/i, /analyze/i, /compare/i, /evaluate/i,
    /what are the differences/i, /pros and cons/i, /step by step/i
  ];
  
  const complexityMatches = complexityIndicators.filter(pattern => 
    pattern.test(userMessage)
  ).length;
  
  complexity += complexityMatches * 0.15;
  
  // Determine output length expectation
  let outputLength: 'short' | 'medium' | 'long' = 'medium';
  
  if (userMessage.includes('briefly') || userMessage.includes('quick')) {
    outputLength = 'short';
  } else if (userMessage.includes('detailed') || userMessage.includes('comprehensive')) {
    outputLength = 'long';
  }
  
  // Confidence starts high and decreases with complexity
  const confidence = Math.max(0.5, 0.9 - (complexity * 0.4));
  
  return {
    complexity: Math.min(complexity, 1.0),
    confidence,
    outputLength,
    hasContext: (contextSnippets?.length || 0) > 0,
    toolsRequired: (toolsUsed?.length || 0) > 0
  };
}