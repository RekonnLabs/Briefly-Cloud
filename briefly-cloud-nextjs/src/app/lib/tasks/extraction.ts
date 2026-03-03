/**
 * tasks/extraction.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured data extraction task handler.
 *
 * When intent === 'extraction', this module:
 *   1. Detects what type of data the user wants extracted (dates, names,
 *      numbers, tables, lists, key-value pairs, etc.)
 *   2. Builds a structured prompt that forces the LLM to produce a clean,
 *      structured extraction with per-item citations
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

type ExtractionTarget =
  | 'dates'
  | 'names'
  | 'numbers'
  | 'table'
  | 'list'
  | 'key-value'
  | 'entities'
  | 'general'

export interface ExtractionTaskResult {
  systemInstruction: string
  extractionTarget: ExtractionTarget
  documentCount: number
}

const EXTRACTION_PATTERNS: [RegExp, ExtractionTarget][] = [
  [/\b(dates?|deadlines?|timeline|schedule|when)\b/i,          'dates'],
  [/\b(names?|people|persons?|authors?|contacts?|who)\b/i,     'names'],
  [/\b(numbers?|amounts?|figures?|statistics?|percentages?|totals?|counts?)\b/i, 'numbers'],
  [/\b(table|tabular|rows?|columns?|grid)\b/i,                 'table'],
  [/\b(list|items?|bullet|enumerate|all the)\b/i,              'list'],
  [/\b(key.?value|pairs?|fields?|attributes?|properties)\b/i,  'key-value'],
  [/\b(entities|organizations?|companies|locations?|places?)\b/i, 'entities'],
]

function detectExtractionTarget(query: string): ExtractionTarget {
  for (const [pattern, target] of EXTRACTION_PATTERNS) {
    if (pattern.test(query)) return target
  }
  return 'general'
}

const TARGET_INSTRUCTIONS: Record<ExtractionTarget, string> = {
  'dates': 'Extract all dates, deadlines, and time references. Format as a list: "- [Date/Period]: [Context] [Source: filename]"',
  'names': 'Extract all person names, roles, and affiliations. Format as a list: "- [Name] ([Role/Title]): [Context] [Source: filename]"',
  'numbers': 'Extract all numerical data, statistics, and figures. Format as a table with columns: Value | Unit | Context | Source',
  'table': 'Extract the data as a Markdown table. Include column headers. Add a [Source: filename] note below the table.',
  'list': 'Extract all relevant items as a numbered or bulleted list. Each item must end with [Source: filename].',
  'key-value': 'Extract key-value pairs in the format: "**Key**: Value [Source: filename]"',
  'entities': 'Extract all named entities (organizations, locations, products). Format as a list grouped by type: "- [Entity] ([Type]): [Context] [Source: filename]"',
  'general': 'Extract the specific information requested by the user. Format the output clearly and cite every extracted item with [Source: filename].',
}

/**
 * Build an extraction task result from retrieved context snippets.
 */
export function buildExtractionTask(
  query: string,
  contextSnippets: ContextSnippet[]
): ExtractionTaskResult {
  const extractionTarget = detectExtractionTarget(query)
  const documentCount = new Set(
    contextSnippets
      .map(s => s.source?.replace(/\s*#\d+$/i, '').trim())
      .filter(Boolean)
  ).size

  const targetInstruction = TARGET_INSTRUCTIONS[extractionTarget]

  const systemInstruction = [
    `EXTRACTION TASK: Extract structured information from the provided document context.`,
    ``,
    `Extraction type: ${extractionTarget}`,
    `Source documents: ${documentCount} document${documentCount !== 1 ? 's' : ''} in context.`,
    ``,
    `EXTRACTION INSTRUCTION:`,
    targetInstruction,
    ``,
    `RULES:`,
    `1. Only extract information that is explicitly present in the provided context.`,
    `2. Do not infer, guess, or add information not in the documents.`,
    `3. Every extracted item MUST include [Source: <filename>].`,
    `4. If no relevant information is found, state: "No [${extractionTarget}] found in the provided documents."`,
    `5. If information spans multiple documents, group by document or note the source for each item.`,
    ``,
    `User's extraction request: ${query}`,
  ].join('\n')

  return {
    systemInstruction,
    extractionTarget,
    documentCount
  }
}
