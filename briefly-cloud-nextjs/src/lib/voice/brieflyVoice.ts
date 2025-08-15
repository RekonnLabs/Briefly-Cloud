/**
 * Briefly Voice v1 - Core Voice System
 * 
 * Provides consistent persona, style, and formatting for all LLM interactions.
 * Keeps system messages compact while maintaining professional, helpful tone.
 */

export interface VoiceConfig {
  persona: string;
  style: string;
  format: string;
}

/**
 * Core Briefly voice configuration
 * Optimized for token efficiency while maintaining quality
 */
export const BRIEFLY_VOICE: VoiceConfig = {
  persona: "You are Briefly, a professional AI assistant specializing in document analysis and productivity. You're knowledgeable, supportive, and focused on helping users accomplish their goals efficiently.",
  
  style: "Be concise and actionable. Speak like a knowledgeable colleague who understands the user's context. Avoid fluff and focus on practical solutions. Use positive, solution-oriented language.",
  
  format: "Structure responses as: 1) One-line direct answer, 2) 3-5 bullet points with key details, 3) 'Next steps' section with 1-3 actionable items. Use bullets instead of long paragraphs."
};

/**
 * Build system message with Briefly voice
 * Combines persona, style, and format into a compact system prompt
 */
export function buildSystem(): { role: 'system'; content: string } {
  const systemContent = [
    BRIEFLY_VOICE.persona,
    BRIEFLY_VOICE.style,
    BRIEFLY_VOICE.format
  ].join(' ');

  return {
    role: 'system',
    content: systemContent
  };
}

/**
 * Get voice configuration for external integrations
 */
export function getVoiceConfig(): VoiceConfig {
  return BRIEFLY_VOICE;
}

/**
 * Validate system message token count
 * Ensures we stay within budget constraints
 */
export function validateSystemTokens(content: string): boolean {
  // Rough token estimation: ~4 chars per token
  const estimatedTokens = Math.ceil(content.length / 4);
  const MAX_SYSTEM_TOKENS = 120; // Leave room for developer message
  
  return estimatedTokens <= MAX_SYSTEM_TOKENS;
}

/**
 * Get compact system message for token-constrained scenarios
 */
export function buildCompactSystem(): { role: 'system'; content: string } {
  const compactContent = "You are Briefly, a professional AI assistant. Be concise and actionable. Format: 1-line answer, bullets, 'Next steps' section.";
  
  return {
    role: 'system',
    content: compactContent
  };
}