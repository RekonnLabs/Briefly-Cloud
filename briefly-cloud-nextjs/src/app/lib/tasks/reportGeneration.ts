// @ts-nocheck — pending type cleanup
/**
 * tasks/reportGeneration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured report / memo / proposal generation task handler.
 *
 * When intent === 'report', this module:
 *   1. Detects the report sub-type from the query (report, memo, proposal,
 *      executive summary, write-up, presentation)
 *   2. Builds a structured prompt that produces a properly formatted document
 *      grounded in the retrieved context
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

type ReportSubtype = 'report' | 'memo' | 'proposal' | 'executive-summary' | 'write-up' | 'presentation'

export interface ReportGenerationTaskResult {
  systemInstruction: string
  subtype: ReportSubtype
  documentCount: number
}

const SUBTYPE_PATTERNS: [RegExp, ReportSubtype][] = [
  [/\bmemo\b/i,                    'memo'],
  [/\bproposal\b/i,                'proposal'],
  [/\bexecutive summary\b/i,       'executive-summary'],
  [/\bwrite.?up\b/i,               'write-up'],
  [/\bpresentation\b/i,            'presentation'],
  [/\breport\b/i,                  'report'],
]

function detectSubtype(query: string): ReportSubtype {
  for (const [pattern, subtype] of SUBTYPE_PATTERNS) {
    if (pattern.test(query)) return subtype
  }
  return 'report'
}

const SUBTYPE_FORMATS: Record<ReportSubtype, string[]> = {
  'report': [
    '# [Report Title]',
    '## Executive Summary',
    '## Background / Context',
    '## Key Findings',
    '## Analysis',
    '## Recommendations',
    '## Conclusion',
  ],
  'memo': [
    'TO: [Recipient]',
    'FROM: [Author]',
    'DATE: [Date]',
    'RE: [Subject]',
    '---',
    '## Purpose',
    '## Background',
    '## Key Points',
    '## Action Required',
  ],
  'proposal': [
    '# [Proposal Title]',
    '## Executive Summary',
    '## Problem Statement',
    '## Proposed Solution',
    '## Implementation Plan',
    '## Expected Outcomes',
    '## Budget / Resources',
    '## Next Steps',
  ],
  'executive-summary': [
    '# Executive Summary',
    '## Overview',
    '## Key Findings',
    '## Recommendations',
    '## Conclusion',
  ],
  'write-up': [
    '# [Title]',
    '## Introduction',
    '## Main Content',
    '## Conclusion',
  ],
  'presentation': [
    '# [Presentation Title]',
    '## Slide 1: Overview',
    '## Slide 2: Background',
    '## Slide 3: Key Points',
    '## Slide 4: Analysis',
    '## Slide 5: Recommendations',
    '## Slide 6: Next Steps',
  ],
}

/**
 * Build a report generation task result from retrieved context snippets.
 */
export function buildReportGenerationTask(
  query: string,
  contextSnippets: ContextSnippet[]
): ReportGenerationTaskResult {
  const subtype = detectSubtype(query)
  const documentCount = new Set(
    contextSnippets
      .map(s => s.source?.replace(/\s*#\d+$/i, '').trim())
      .filter(Boolean)
  ).size

  const formatTemplate = SUBTYPE_FORMATS[subtype].join('\n')

  const systemInstruction = [
    `REPORT GENERATION TASK: Draft a ${subtype} based on the provided document context.`,
    ``,
    `Source documents: ${documentCount} document${documentCount !== 1 ? 's' : ''} in context.`,
    ``,
    `REQUIRED OUTPUT FORMAT — use this structure:`,
    formatTemplate,
    ``,
    `RULES:`,
    `1. Ground every factual claim in the provided documents with [Source: <filename>].`,
    `2. Do not invent facts not present in the context.`,
    `3. If information for a section is not available in context, write "[Information not available in provided documents]" for that section.`,
    `4. Use professional, formal language appropriate for a ${subtype}.`,
    `5. Replace all placeholder text (e.g., [Report Title]) with appropriate content derived from the documents.`,
    ``,
    `User's request: ${query}`,
  ].join('\n')

  return {
    systemInstruction,
    subtype,
    documentCount
  }
}
