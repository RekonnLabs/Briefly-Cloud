export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }
export type ContextSnippet = { content: string; source?: string; relevance?: number }

export function buildPrompt(messages: ChatMsg[], system?: string): ChatMsg[] {
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

/**
 * Build the full message array for the LLM.
 *
 * Message order (OpenAI chat format):
 *   1. System prompt (task + shape + document context if any)
 *   2. Memory messages (prior turns, role-alternating user/assistant)
 *   3. Current user message
 *
 * Memory messages are injected as proper role messages, NOT as text in the
 * system prompt. This gives the LLM natural conversational context without
 * polluting the system instructions.
 */
export function buildMessages(params: {
  developerTask: string
  developerShape: string
  contextSnippets: ContextSnippet[]
  memoryMessages?: ChatMsg[]
  userMessage: string
}): ChatMsg[] {
  const { developerTask, developerShape, contextSnippets, memoryMessages, userMessage } = params
  
  // Build context with source attribution for each snippet
  const hasContext = contextSnippets && contextSnippets.length > 0
  let contextBlock = ''
  
  if (hasContext) {
    const snippetTexts = contextSnippets.map((c, i) => {
      const sourceLabel = c.source ? ` (Source: ${c.source})` : ''
      return `[Document ${i + 1}${sourceLabel}]\n${c.content}`
    })
    contextBlock = snippetTexts.join('\n\n---\n\n')
  }
  
  // Build system prompt with clear instructions about grounding
  let systemPrompt = developerTask

  if (hasContext) {
    systemPrompt += `\n\nIMPORTANT INSTRUCTIONS:
- You MUST answer based on the provided document context below.
- When your answer comes from the documents, cite the source using [Source: filename] notation.
- If the documents contain the answer, use ONLY the document content — do not add external knowledge.
- If the documents do NOT contain the answer, clearly state: "This information was not found in your uploaded documents." Then you may provide a general answer, clearly marked as not from the documents.

DOCUMENT CONTEXT:
${contextBlock}`
  } else {
    systemPrompt += `\n\nNOTE: No relevant documents were found for this query. Provide a helpful general answer, but clearly indicate that this response is not based on the user's uploaded documents.`
  }
  
  systemPrompt += `\n\n${developerShape}`

  // If memory is present, add a brief note to the system prompt
  if (memoryMessages && memoryMessages.length > 0) {
    systemPrompt += `\n\nCONVERSATION CONTEXT: Prior relevant messages from this conversation are included below. Use them for continuity but prioritize the current question and document context.`
  }
  
  // Assemble: system → memory turns → current user message
  const allMessages: ChatMsg[] = [
    { role: 'system', content: systemPrompt }
  ]

  // Inject memory messages as proper role messages
  if (memoryMessages && memoryMessages.length > 0) {
    allMessages.push(...memoryMessages)
  }

  // Current user message
  allMessages.push({ role: 'user', content: userMessage })

  return allMessages
}

export function buildDeveloper(query: string): string {
  return `Developer query: ${query}`
}
