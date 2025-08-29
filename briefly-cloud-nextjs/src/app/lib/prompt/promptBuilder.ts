export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }
export type ContextSnippet = { content: string; source?: string; relevance?: number }

export function buildPrompt(messages: ChatMsg[], system?: string): ChatMsg[] {
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

export function buildMessages(userMessage: string, context?: ContextSnippet[]): ChatMsg[] {
  const contextText = context?.map(c => c.content).join('\n\n') || ''
  const systemPrompt = contextText ? `Context:\n${contextText}\n\nAnswer based on the provided context.` : ''
  return buildPrompt([{ role: 'user', content: userMessage }], systemPrompt)
}

export function buildDeveloper(query: string): string {
  return `Developer query: ${query}`
}