/**
 * Briefly Voice v1 - Response Linter
 * 
 * Enforces consistent response structure and format across all LLM outputs.
 * Ensures responses follow Briefly's voice guidelines and user expectations.
 */

export interface LintResult {
  output: string;
  rewritten: boolean;
  issues: string[];
  improvements: string[];
}

export interface LintOptions {
  enforceNextSteps?: boolean;
  convertToBullets?: boolean;
  checkMissingContext?: boolean;
  maxParagraphLength?: number;
}

const DEFAULT_OPTIONS: Required<LintOptions> = {
  enforceNextSteps: true,
  convertToBullets: true,
  checkMissingContext: true,
  maxParagraphLength: 200
};

/**
 * Main linting function - enforces Briefly voice standards
 */
export function enforce(
  draft: string, 
  options: LintOptions = {}
): LintResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: string[] = [];
  const improvements: string[] = [];
  let output = draft.trim();
  let rewritten = false;
  
  // 1. Check for "Next steps" section
  if (opts.enforceNextSteps && !hasNextStepsSection(output)) {
    output = addNextStepsSection(output);
    rewritten = true;
    improvements.push('Added "Next steps" section');
  }
  
  // 2. Convert long paragraphs to bullets
  if (opts.convertToBullets) {
    const bulletResult = convertLongParagraphsToBullets(output, opts.maxParagraphLength);
    if (bulletResult.changed) {
      output = bulletResult.text;
      rewritten = true;
      improvements.push('Converted long paragraphs to bullet points');
    }
  }
  
  // 3. Check for missing context indicators
  if (opts.checkMissingContext && indicatesMissingContext(output)) {
    const contextResult = improveContextRequest(output);
    if (contextResult.changed) {
      output = contextResult.text;
      rewritten = true;
      improvements.push('Improved missing context request');
    }
  }
  
  // 4. Ensure proper structure (one-line answer + details)
  const structureResult = enforceStructure(output);
  if (structureResult.changed) {
    output = structureResult.text;
    rewritten = true;
    improvements.push('Improved response structure');
  }
  
  // 5. Quality checks (identify issues without fixing)
  const qualityIssues = checkQuality(output);
  issues.push(...qualityIssues);
  
  return {
    output,
    rewritten,
    issues,
    improvements
  };
}

/**
 * Check if response has a "Next steps" section
 */
function hasNextStepsSection(text: string): boolean {
  const nextStepsPatterns = [
    /next steps?:/i,
    /what's next:/i,
    /to proceed:/i,
    /recommended actions?:/i
  ];
  
  return nextStepsPatterns.some(pattern => pattern.test(text));
}

/**
 * Add a "Next steps" section if missing
 */
function addNextStepsSection(text: string): string {
  // Don't add if response is very short
  if (text.length < 50) {
    return text;
  }
  
  const nextSteps = "\n\n**Next steps:**\n• Review the information above\n• Let me know if you need clarification on any points";
  
  return text + nextSteps;
}

/**
 * Convert long paragraphs to bullet points
 */
function convertLongParagraphsToBullets(
  text: string, 
  maxLength: number
): { text: string; changed: boolean } {
  const paragraphs = text.split('\n\n');
  let changed = false;
  
  const processedParagraphs = paragraphs.map(paragraph => {
    // Skip if already bulleted, is a header, or is short
    if (paragraph.match(/^[\s]*[•\-\*]/) || 
        paragraph.match(/^#+\s/) || 
        paragraph.match(/^\*\*.*\*\*:?\s*$/) ||
        paragraph.length <= maxLength) {
      return paragraph;
    }
    
    // Convert long paragraph to bullets if it contains multiple sentences
    const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length >= 2 && paragraph.length > maxLength) {
      changed = true;
      const bullets = sentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => `• ${s}${s.endsWith('.') ? '' : '.'}`);
      
      return bullets.join('\n');
    }
    
    return paragraph;
  });
  
  return {
    text: processedParagraphs.join('\n\n'),
    changed
  };
}

/**
 * Check if response indicates missing context
 */
function indicatesMissingContext(text: string): boolean {
  const missingContextPatterns = [
    /i don't have enough information/i,
    /could you provide more details/i,
    /i need more context/i,
    /without additional information/i,
    /please clarify/i
  ];
  
  return missingContextPatterns.some(pattern => pattern.test(text));
}

/**
 * Improve requests for missing context
 */
function improveContextRequest(text: string): { text: string; changed: boolean } {
  // If response is asking for more info, make it more specific and helpful
  if (indicatesMissingContext(text)) {
    const improved = text.replace(
      /i don't have enough information/gi,
      "I'd be happy to help with more specific information"
    ).replace(
      /could you provide more details/gi,
      "To give you the most helpful answer, could you share"
    ).replace(
      /please clarify/gi,
      "To provide the best guidance, please let me know"
    );
    
    return {
      text: improved,
      changed: improved !== text
    };
  }
  
  return { text, changed: false };
}

/**
 * Enforce proper response structure
 */
function enforceStructure(text: string): { text: string; changed: boolean } {
  // Check if response starts with a clear, direct answer
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return { text, changed: false };
  }
  
  const firstLine = lines[0].trim();
  
  // If first line is very long or doesn't seem like a direct answer, try to improve
  if (firstLine.length > 150 || firstLine.includes('However,') || firstLine.includes('Well,')) {
    // This is complex to fix automatically, so just flag it
    return { text, changed: false };
  }
  
  return { text, changed: false };
}

/**
 * Check response quality and identify issues
 */
function checkQuality(text: string): string[] {
  const issues: string[] = [];
  
  // Check for overly long response
  if (text.length > 1500) {
    issues.push('Response may be too long for optimal user experience');
  }
  
  // Check for lack of structure
  if (!text.includes('•') && !text.includes('-') && !text.includes('*') && text.length > 300) {
    issues.push('Response lacks bullet points or clear structure');
  }
  
  // Check for vague language
  const vaguePatterns = [
    /it depends/i,
    /it's complicated/i,
    /there are many factors/i,
    /it varies/i
  ];
  
  if (vaguePatterns.some(pattern => pattern.test(text))) {
    issues.push('Response contains vague language that could be more specific');
  }
  
  // Check for missing actionable advice
  if (text.length > 200 && !hasActionableContent(text)) {
    issues.push('Response lacks actionable advice or next steps');
  }
  
  return issues;
}

/**
 * Check if response contains actionable content
 */
function hasActionableContent(text: string): boolean {
  const actionPatterns = [
    /you can/i,
    /try/i,
    /consider/i,
    /next steps?/i,
    /to do this/i,
    /follow these/i,
    /here's how/i
  ];
  
  return actionPatterns.some(pattern => pattern.test(text));
}

/**
 * Quick validation for common issues
 */
export function quickValidate(text: string): {
  hasNextSteps: boolean;
  hasStructure: boolean;
  isReasonableLength: boolean;
  issues: string[];
} {
  return {
    hasNextSteps: hasNextStepsSection(text),
    hasStructure: text.includes('•') || text.includes('-') || text.includes('*'),
    isReasonableLength: text.length >= 50 && text.length <= 1500,
    issues: checkQuality(text)
  };
}