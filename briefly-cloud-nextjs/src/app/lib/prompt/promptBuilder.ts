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
  
  const contextText = contextSnippets?.map(c => c.content).join('\n\n') || ''
  
  let systemPrompt = `${developerTask}\n\n${developerShape}`
  
  if (contextText) {
    systemPrompt += `\n\nContext:\n${contextText}`
  }
  
  if (historySummary) {
    systemPrompt += `\n\nConversation History:\n${historySummary}`
  }
  
  return buildPrompt([{ role: 'user', content: userMessage }], systemPrompt)
}

export function buildDeveloper(query: string): string {
  return `Developer query: ${query}`
}