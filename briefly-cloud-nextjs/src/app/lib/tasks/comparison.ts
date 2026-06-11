// @ts-nocheck — pending type cleanup
/**
 * tasks/comparison.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-document comparison task handler.
 *
 * When intent === 'comparison', this module:
 *   1. Receives the retrieved context snippets (already fetched with topK=20)
 *   2. Groups them by source document
 *   3. Builds a structured comparison prompt that forces the LLM to produce
 *      a side-by-side analysis with explicit per-document citations
 *
 * Design constraints:
 *   - Zero extra LLM calls — single pass only
 *   - No extra retrieval — uses the snippets already fetched by the chat route
 *   - Returns a ChatMsg[] array ready to pass to buildMessages() as context
 *   - Never touches users-repo.ts or pgvector-store.ts directly
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ContextSnippet } from '@/app/lib/prompt/promptBuilder'

export interface ComparisonTaskResult {
  /** Structured system instruction injected into the prompt */
  systemInstruction: string
  /** Per-document grouped snippets for citation validation */
  documentGroups: Record<string, ContextSnippet[]>
  /** Number of distinct documents found in context */
  documentCount: number
}

/**
 * Build a comparison task result from retrieved context snippets.
 * Groups snippets by source document and produces a structured instruction
 * that guides the LLM to compare documents side-by-side.
 */
export function buildComparisonTask(
  query: string,
  contextSnippets: ContextSnippet[]
): ComparisonTaskResult {
  // Group snippets by source document
  const documentGroups: Record<string, ContextSnippet[]> = {}

  for (const snippet of contextSnippets) {
    const source = snippet.source
      ? snippet.source.replace(/\s*#\d+$/i, '').trim()  // strip chunk index
      : 'Unknown Document'

    if (!documentGroups[source]) {
      documentGroups[source] = []
    }
    documentGroups[source].push(snippet)
  }

  const documentNames = Object.keys(documentGroups)
  const documentCount = documentNames.length

  if (documentCount === 0) {
    return {
      systemInstruction: '',
      documentGroups: {},
      documentCount: 0
    }
  }

  if (documentCount === 1) {
    // Only one document — can't do a true comparison, guide LLM to say so
    return {
      systemInstruction: `NOTE: Only one document (${documentNames[0]}) was found in context. ` +
        `You can describe its contents but cannot compare it to another document. ` +
        `Inform the user that a comparison requires at least two documents.`,
      documentGroups,
      documentCount: 1
    }
  }

  // Build the structured comparison instruction
  const docList = documentNames
    .map((name, i) => `  Document ${i + 1}: ${name} (${documentGroups[name].length} passage${documentGroups[name].length !== 1 ? 's' : ''})`)
    .join('\n')

  const systemInstruction = [
    `COMPARISON TASK: The user wants to compare ${documentCount} documents.`,
    ``,
    `Documents available in context:`,
    docList,
    ``,
    `REQUIRED OUTPUT FORMAT:`,
    `1. Start with a brief overview of what is being compared.`,
    `2. For each key dimension relevant to the query, provide a side-by-side analysis.`,
    `3. Use clear section headers (e.g., "## Topic X").`,
    `4. Every claim about a document MUST be followed by [Source: <filename>].`,
    `5. End with a "Summary" section that states the key similarities and differences.`,
    ``,
    `CITATION RULE: You MUST cite every document you reference. ` +
    `Do not make claims about a document without a [Source: filename] citation.`,
    ``,
    `Query to address: ${query}`,
  ].join('\n')

  return {
    systemInstruction,
    documentGroups,
    documentCount
  }
}

/**
 * Format comparison context into a structured string for the prompt.
 * Organizes snippets by document so the LLM sees them grouped.
 */
export function formatComparisonContext(
  documentGroups: Record<string, ContextSnippet[]>
): string {
  const sections: string[] = []

  for (const [docName, snippets] of Object.entries(documentGroups)) {
    const passages = snippets
      .map((s, i) => `  [Passage ${i + 1}]: ${s.content?.trim() || ''}`)
      .join('\n\n')

    sections.push(`=== Document: ${docName} ===\n${passages}`)
  }

  return sections.join('\n\n')
}
