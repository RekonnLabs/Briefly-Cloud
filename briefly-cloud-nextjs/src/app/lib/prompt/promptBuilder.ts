export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }
export type ContextSnippet = { content: string; source?: string; relevance?: number }

export function buildPrompt(messages: ChatMsg[], system?: string): ChatMsg[] {
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

export function buildMessages(params: {
  developerTask: string
  developerShape: string
  contextSnippets: ContextSnippet[]
  historySummary?: string
  userMessage: string
}): ChatMsg[] {
  const { developerTask, developerShape, contextSnippets, historySummary, userMessage } = params
  
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
  
  if (historySummary) {
    systemPrompt += `\n\nConversation History:\n${historySummary}`
  }
  
  return buildPrompt([{ role: 'user', content: userMessage }], systemPrompt)
}

export function buildDeveloper(query: string): string {
  return `Developer query: ${query}`
}
