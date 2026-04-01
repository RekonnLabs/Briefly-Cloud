/**
 * promptBuilder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the full OpenAI message array for each request.
 *
 * Supports 5 intent modes with distinct system prompt templates:
 *   qa          — default; single-document Q&A with citations
 *   comparison  — structured compare/contrast across documents
 *   summary     — concise document digest
 *   report      — structured long-form output (sections, headers)
 *   extraction  — structured data extraction (lists, tables)
 *
 * Constraints:
 *   - validateProvenance() runs on COMPLETE assembled content, not partial tokens
 *   - Memory messages injected as proper role messages (not in system prompt text)
 *   - Context snippets always include source attribution
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { IntentMode } from './intentRouter'

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }
export type ContextSnippet = { content: string; source?: string; relevance?: number }

// ─────────────────────────────────────────────────────────────────────────────
// Mode-aware system prompt templates
// ─────────────────────────────────────────────────────────────────────────────

function buildContextBlock(snippets: ContextSnippet[]): string {
  return snippets
    .map((c, i) => {
      const sourceLabel = c.source ? ` (Source: ${c.source})` : ''
      return `[Document ${i + 1}${sourceLabel}]\n${c.content}`
    })
    .join('\n\n---\n\n')
}

function buildSystemPrompt(
  developerTask: string,
  developerShape: string,
  contextSnippets: ContextSnippet[],
  mode: IntentMode,
  hasMemory: boolean
): string {
  const hasContext = contextSnippets.length > 0
  const contextBlock = hasContext ? buildContextBlock(contextSnippets) : null

  // ── No-context fallback (same for all modes) ─────────────────────────────
  if (!hasContext) {
    return [
      developerTask,
      `No relevant content was found in the user's uploaded documents for this query.

Answer helpfully using your general knowledge. Somewhere in your response (naturally, not as a rigid opener), mention that this isn't drawn from their uploaded documents — for example: "This isn't in your uploaded documents, but..." or "Your files don't cover this, so here's what I know:" or a similar natural phrasing.

For live data you cannot access (current prices, weather, sports scores): briefly note you can't access live data and name the best source.
Do not cite [Source: filename] — there are no document sources.`,
      developerShape,
      hasMemory ? `CONVERSATION CONTEXT: Prior relevant messages from this conversation are included below. Use them for continuity.` : ''
    ].filter(Boolean).join('\n\n')
  }

  // ── Mode-specific templates ───────────────────────────────────────────────

  let modeInstructions: string

  switch (mode) {
    case 'comparison':
      modeInstructions = `You are performing a COMPARISON task across the provided documents.

INSTRUCTIONS:
- Identify the key entities, concepts, or items being compared.
- Structure your response with clear sections: use headers like "## [Item A]" and "## [Item B]" followed by a "## Key Differences" and "## Key Similarities" section.
- Cite every claim with [Source: filename] notation.
- If a document does not contain information about one side of the comparison, state that explicitly.
- Do not introduce external knowledge — compare only what is in the documents.

DOCUMENT CONTEXT:
${contextBlock}`
      break

    case 'summary':
      modeInstructions = `You are performing a SUMMARY task on the provided documents.

INSTRUCTIONS:
- Produce a concise, accurate summary of the key points in the documents.
- Use bullet points for key findings, followed by a brief narrative paragraph if helpful.
- Cite the source document for each key point using [Source: filename] notation.
- Do not add information not present in the documents.
- If multiple documents are provided, summarize each separately, then provide a combined overview.

DOCUMENT CONTEXT:
${contextBlock}`
      break

    case 'report':
      modeInstructions = `You are performing a REPORT GENERATION task using the provided documents as source material.

INSTRUCTIONS:
- Draft a well-structured report with clear sections: Executive Summary, Key Findings, Details, and Recommendations (or similar appropriate sections).
- Use markdown headers (##, ###) for structure.
- Cite all factual claims with [Source: filename] notation.
- If the documents do not contain enough information for a section, note the gap explicitly.
- Write in a professional, clear tone suitable for business or technical audiences.

DOCUMENT CONTEXT:
${contextBlock}`
      break

    case 'extraction':
      modeInstructions = `You are performing a DATA EXTRACTION task from the provided documents.

INSTRUCTIONS:
- Extract the requested data points, fields, or items as accurately as possible.
- Present extracted data in a structured format: use a markdown table if multiple fields/items, or a numbered list for single-field extractions.
- For each extracted item, note the source document using [Source: filename] notation.
- If a requested field is not found in the documents, include it in the output with value "Not found".
- Do not infer or guess values — only extract what is explicitly stated.

DOCUMENT CONTEXT:
${contextBlock}`
      break

    case 'qa':
    default:
      modeInstructions = `You are answering from the user's uploaded documents. The relevant passages are below.

RULES:
1. Use ONLY the document context provided. Do not add external or general knowledge.
2. Cite every factual claim with [Source: filename] notation.
3. If the retrieved passages partially address the question, answer from what is there and note any gaps.
4. If the passages are genuinely irrelevant to the question, say: "I didn't find that in your uploaded documents." Do not fabricate an answer.

DOCUMENT CONTEXT:
${contextBlock}`
      break
  }

  return [
    developerTask,
    modeInstructions,
    developerShape,
    hasMemory ? `CONVERSATION CONTEXT: Prior relevant messages from this conversation are included below. Use them for continuity but prioritize the current question and document context.` : ''
  ].filter(Boolean).join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full message array for the LLM.
 *
 * Message order (OpenAI chat format):
 *   1. System prompt (task + mode-aware instructions + document context)
 *   2. Memory messages (prior turns, role-alternating user/assistant)
 *   3. Current user message
 */
const DEFAULT_DEVELOPER_TASK = 'You are Briefly, an AI assistant that helps users understand and work with their uploaded documents.'
const DEFAULT_DEVELOPER_SHAPE = 'Respond clearly and concisely. Use markdown formatting where appropriate. Always cite your sources using [Source: filename] notation when answering from documents. Do not add disclaimers, caveats, or "please note" statements at the end of responses. Answer directly and stop when the answer is complete.'

export function buildMessages(params: {
  developerTask?: string
  developerShape?: string
  contextSnippets: ContextSnippet[]
  memoryMessages?: ChatMsg[]
  userMessage: string
  intentMode?: IntentMode
  taskInstruction?: string
}): ChatMsg[] {
  const {
    developerTask = DEFAULT_DEVELOPER_TASK,
    developerShape = DEFAULT_DEVELOPER_SHAPE,
    contextSnippets,
    memoryMessages,
    userMessage,
    intentMode = 'qa',
    taskInstruction
  } = params

  const hasMemory = (memoryMessages?.length ?? 0) > 0

  // If a task module provided a specific instruction, prepend it to the system prompt
  const effectiveDeveloperTask = taskInstruction
    ? `${taskInstruction}\n\n${developerTask}`
    : developerTask

  const systemPrompt = buildSystemPrompt(
    effectiveDeveloperTask,
    developerShape,
    contextSnippets,
    intentMode,
    hasMemory
  )

  const allMessages: ChatMsg[] = [
    { role: 'system', content: systemPrompt }
  ]

  // Inject memory messages as proper role messages
  if (hasMemory) {
    allMessages.push(...memoryMessages!)
  }

  // Current user message
  allMessages.push({ role: 'user', content: userMessage })

  return allMessages
}

export function buildPrompt(messages: ChatMsg[], system?: string): ChatMsg[] {
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

export function buildDeveloper(query: string): string {
  return `Developer query: ${query}`
}
