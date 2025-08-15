/**
 * Briefly Voice v1 - Budget Management
 * 
 * Defines token budgets and limits for cost-effective LLM usage.
 * Balances quality with cost across different user tiers.
 */

export const BUDGETS = {
  // Output token limits
  MAX_OUTPUT_TOKENS: 600,        // Default output budget
  BOOST_OUTPUT_TOKENS: 1200,     // Pro boost output budget
  
  // Input token limits
  MAX_SYSTEM_TOKENS: 120,        // System message budget
  MAX_DEVELOPER_TOKENS: 40,      // Developer message budget
  MAX_CONTEXT_TOKENS: 900,       // RAG context budget
  
  // Context limits
  TOP_K: 6,                      // Maximum context snippets
  MIN_SNIPPET_LENGTH: 50,        // Minimum useful snippet length
  MAX_SNIPPET_LENGTH: 150,       // Maximum snippet length
  
  // History limits
  MAX_HISTORY_TOKENS: 200,       // Conversation history budget
  MAX_HISTORY_TURNS: 3,          // Maximum previous turns to include
  
  // Tool limits
  MAX_TOOLS_PER_CALL: 5,         // Maximum tools to include
  
  // Model routing thresholds
  COMPLEXITY_THRESHOLD: 0.7,     // When to escalate from nano to mini
  CONFIDENCE_THRESHOLD: 0.8,     // When to use higher model
} as const;

/**
 * Calculate estimated tokens for text
 * Uses rough approximation of 4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate if content fits within budget
 */
export function validateBudget(content: string, maxTokens: number): boolean {
  return estimateTokens(content) <= maxTokens;
}

/**
 * Trim content to fit within token budget
 */
export function trimToBudget(content: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(content);
  
  if (estimatedTokens <= maxTokens) {
    return content;
  }
  
  // Trim to approximately fit budget
  const targetLength = maxTokens * 4;
  const trimmed = content.substring(0, targetLength);
  
  // Try to end at a sentence boundary
  const lastSentence = trimmed.lastIndexOf('.');
  if (lastSentence > targetLength * 0.8) {
    return trimmed.substring(0, lastSentence + 1);
  }
  
  // Try to end at a word boundary
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace > targetLength * 0.9) {
    return trimmed.substring(0, lastSpace);
  }
  
  return trimmed;
}

/**
 * Get output token budget based on tier and boost
 */
export function getOutputBudget(tier: 'free' | 'pro' | 'enterprise', boost: boolean = false): number {
  if (boost && (tier === 'pro' || tier === 'enterprise')) {
    return BUDGETS.BOOST_OUTPUT_TOKENS;
  }
  
  return BUDGETS.MAX_OUTPUT_TOKENS;
}

/**
 * Calculate total input budget used
 */
export function calculateInputBudget(components: {
  system?: string;
  developer?: string;
  context?: string;
  history?: string;
  user?: string;
}): {
  total: number;
  breakdown: Record<string, number>;
  withinBudget: boolean;
} {
  const breakdown = {
    system: estimateTokens(components.system || ''),
    developer: estimateTokens(components.developer || ''),
    context: estimateTokens(components.context || ''),
    history: estimateTokens(components.history || ''),
    user: estimateTokens(components.user || ''),
  };
  
  const total = Object.values(breakdown).reduce((sum, tokens) => sum + tokens, 0);
  
  // Rough input budget limit (most models handle 4k+ input well)
  const INPUT_BUDGET_LIMIT = 3000;
  
  return {
    total,
    breakdown,
    withinBudget: total <= INPUT_BUDGET_LIMIT
  };
}