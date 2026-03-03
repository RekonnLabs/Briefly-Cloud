/**
 * tasks/folderSummary.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Folder / multi-document summary task handler.
 *
 * When intent === 'summary', this module:
 *   1. Groups retrieved snippets by source document
 *   2. Builds a structured summary prompt that produces a per-document
 *      summary followed by a cross-document synthesis
 *
 * Design constraints:
 *   - Zero extra LLM calls — single pass only
 *   - No extra retrieval — uses snippets already fetched by the chat route
 *   - Returns a structured system instruction for buildMessages()
 *   - Never touches users-repo.ts or pgvector-store.ts directly
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ContextSnippet } from '@/app/lib/prompt/promptBuilder'

export interface FolderSummaryTaskResult {
  systemInstruction: string
  documentGroups: Record<string, ContextSnippet[]>
  documentCount: number
}

/**
 * Build a folder summary task result from retrieved context snippets.
 */
export function buildFolderSummaryTask(
  query: string,
  contextSnippets: ContextSnippet[]
): FolderSummaryTaskResult {
  // Group snippets by source document (strip chunk indices)
  const documentGroups: Record<string, ContextSnippet[]> = {}

  for (const snippet of contextSnippets) {
    const source = snippet.source
      ? snippet.source.replace(/\s*#\d+$/i, '').trim()
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

  const docList = documentNames
    .map((name, i) => `  ${i + 1}. ${name} (${documentGroups[name].length} passage${documentGroups[name].length !== 1 ? 's' : ''})`)
    .join('\n')

  const systemInstruction = [
    `SUMMARY TASK: Summarize the following ${documentCount} document${documentCount !== 1 ? 's' : ''}.`,
    ``,
    `Documents in context:`,
    docList,
    ``,
    `REQUIRED OUTPUT FORMAT:`,
    ...(documentCount > 1 ? [
      `1. For each document, provide a brief summary (2–4 sentences) with [Source: <filename>] citations.`,
      `2. After all individual summaries, provide a "Cross-Document Synthesis" section that identifies:`,
      `   - Common themes across documents`,
      `   - Key differences or unique points per document`,
      `   - Overall conclusion or takeaway`,
    ] : [
      `1. Provide a structured summary of the document with clear sections.`,
      `2. Include key points, main themes, and important details.`,
      `3. Every claim MUST be followed by [Source: <filename>].`,
    ]),
    ``,
    `CITATION RULE: Every factual claim MUST include [Source: <filename>].`,
    ``,
    `User's summary request: ${query}`,
  ].join('\n')

  return {
    systemInstruction,
    documentGroups,
    documentCount
  }
}
