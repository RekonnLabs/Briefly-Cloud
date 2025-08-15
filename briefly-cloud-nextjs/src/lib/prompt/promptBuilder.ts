/**
 * Briefly Voice v1 - Prompt Builder
 * 
 * Assembles consistent, budget-aware prompts for all LLM interactions.
 * Integrates voice, context, tools, and history within token budgets.
 */

import { buildSystem, buildCompactSystem } from '@/lib/voice/brieflyVoice';
import { BUDGETS, trimToBudget, estimateTokens } from './budgets';

export interface ContextSnippet {
  content: string;
  source?: string;
  relevance?: number;
}

export interface BuildMessagesOptions {
  developerTask?: string;
  developerShape?: string;
  toolsUsed?: string[];
  contextSnippets?: ContextSnippet[];
  historySummary?: string;
  userMessage: string;
  useCompactSystem?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string;
}

/**
 * Build developer message for task-specific framing
 * Keeps within token budget while providing clear direction
 */
export function buildDeveloper(
  task: string, 
  shape?: string
): { role: 'developer'; content: string } | null {
  if (!task) return null;
  
  let content = task;
  if (shape) {
    content += ` ${shape}`;
  }
  
  // Ensure developer message fits budget
  content = trimToBudget(content, BUDGETS.MAX_DEVELOPER_TOKENS);
  
  return {
    role: 'developer',
    content
  };
}

/**
 * Format context snippets into a concise context block
 */
function formatContext(snippets: ContextSnippet[]): string {
  if (!snippets || snippets.length === 0) {
    return '';
  }
  
  // Limit to TOP_K snippets
  const limitedSnippets = snippets.slice(0, BUDGETS.TOP_K);
  
  const contextParts = limitedSnippets.map((snippet, index) => {
    const trimmedContent = trimToBudget(snippet.content, BUDGETS.MAX_SNIPPET_LENGTH);
    const source = snippet.source ? ` (${snippet.source})` : '';
    return `${index + 1}. ${trimmedContent}${source}`;
  });
  
  const contextBlock = `Context:\n${contextParts.join('\n')}`;
  
  // Ensure entire context block fits budget
  return trimToBudget(contextBlock, BUDGETS.MAX_CONTEXT_TOKENS);
}

/**
 * Format tools used into a concise tools block
 */
function formatTools(toolsUsed: string[]): string {
  if (!toolsUsed || toolsUsed.length === 0) {
    return '';
  }
  
  // Limit tools and format compactly
  const limitedTools = toolsUsed.slice(0, BUDGETS.MAX_TOOLS_PER_CALL);
  return `Available tools: ${limitedTools.join(', ')}`;
}

/**
 * Format conversation history summary
 */
function formatHistory(historySummary?: string): string {
  if (!historySummary) {
    return '';
  }
  
  const trimmed = trimToBudget(historySummary, BUDGETS.MAX_HISTORY_TOKENS);
  return `Previous context: ${trimmed}`;
}

/**
 * Build complete message array for LLM call
 * Assembles all components within budget constraints
 */
export function buildMessages(options: BuildMessagesOptions): ChatMessage[] {
  const {
    developerTask,
    developerShape,
    toolsUsed,
    contextSnippets,
    historySummary,
    userMessage,
    useCompactSystem = false
  } = options;
  
  const messages: ChatMessage[] = [];
  
  // 1. System message (persona + style)
  const systemMessage = useCompactSystem ? buildCompactSystem() : buildSystem();
  messages.push(systemMessage as ChatMessage);
  
  // 2. Developer message (task framing)
  const developerMessage = buildDeveloper(developerTask || '', developerShape);
  if (developerMessage) {
    messages.push(developerMessage as ChatMessage);
  }
  
  // 3. Build context block combining tools, context, and history
  const contextParts: string[] = [];
  
  // Add tools if provided
  const toolsBlock = formatTools(toolsUsed || []);
  if (toolsBlock) {
    contextParts.push(toolsBlock);
  }
  
  // Add context snippets if provided
  const contextBlock = formatContext(contextSnippets || []);
  if (contextBlock) {
    contextParts.push(contextBlock);
  }
  
  // Add history if provided
  const historyBlock = formatHistory(historySummary);
  if (historyBlock) {
    contextParts.push(historyBlock);
  }
  
  // Combine context parts into single message if any exist
  if (contextParts.length > 0) {
    const combinedContext = contextParts.join('\n\n');
    messages.push({
      role: 'user',
      content: combinedContext
    });
  }
  
  // 4. User message (always last)
  messages.push({
    role: 'user',
    content: userMessage
  });
  
  return messages;
}

/**
 * Build messages for simple queries without context
 */
export function buildSimpleMessages(
  userMessage: string,
  task?: string,
  shape?: string
): ChatMessage[] {
  return buildMessages({
    developerTask: task,
    developerShape: shape,
    userMessage,
    useCompactSystem: true
  });
}

/**
 * Build messages for context-rich queries
 */
export function buildContextualMessages(
  userMessage: string,
  contextSnippets: ContextSnippet[],
  task?: string,
  historySummary?: string
): ChatMessage[] {
  return buildMessages({
    developerTask: task,
    contextSnippets,
    historySummary,
    userMessage
  });
}

/**
 * Build messages for tool-assisted queries
 */
export function buildToolMessages(
  userMessage: string,
  toolsUsed: string[],
  task?: string,
  contextSnippets?: ContextSnippet[]
): ChatMessage[] {
  return buildMessages({
    developerTask: task,
    toolsUsed,
    contextSnippets,
    userMessage
  });
}

/**
 * Validate message array fits within reasonable bounds
 */
export function validateMessages(messages: ChatMessage[]): {
  valid: boolean;
  totalTokens: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let totalTokens = 0;
  
  for (const message of messages) {
    const tokens = estimateTokens(message.content);
    totalTokens += tokens;
    
    // Check individual message limits
    if (message.role === 'system' && tokens > BUDGETS.MAX_SYSTEM_TOKENS) {
      warnings.push(`System message exceeds budget: ${tokens} > ${BUDGETS.MAX_SYSTEM_TOKENS}`);
    }
    
    if (message.role === 'developer' && tokens > BUDGETS.MAX_DEVELOPER_TOKENS) {
      warnings.push(`Developer message exceeds budget: ${tokens} > ${BUDGETS.MAX_DEVELOPER_TOKENS}`);
    }
  }
  
  // Check total input budget
  const INPUT_LIMIT = 3000;
  if (totalTokens > INPUT_LIMIT) {
    warnings.push(`Total input exceeds recommended limit: ${totalTokens} > ${INPUT_LIMIT}`);
  }
  
  return {
    valid: warnings.length === 0,
    totalTokens,
    warnings
  };
}