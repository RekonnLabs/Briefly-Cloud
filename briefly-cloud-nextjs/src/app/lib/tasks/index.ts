// @ts-nocheck — pending type cleanup
/**
 * tasks/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central task dispatcher.
 *
 * Given an intent mode and context snippets, returns a structured
 * system instruction to inject into the prompt.
 *
 * All task modules follow the same contract:
 *   - Zero extra LLM calls
 *   - No extra retrieval
 *   - Returns a systemInstruction string for buildMessages()
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ContextSnippet } from '@/app/lib/prompt/promptBuilder'
import type { IntentMode } from '@/app/lib/prompt/intentRouter'
import { buildComparisonTask }      from './comparison'
import { buildFolderSummaryTask }   from './folderSummary'
import { buildReportGenerationTask } from './reportGeneration'
import { buildExtractionTask }      from './extraction'

export interface TaskResult {
  /** Structured system instruction to inject into the prompt */
  systemInstruction: string
  /** The task mode that was dispatched */
  mode: IntentMode
  /** Additional metadata for telemetry */
  meta: Record<string, unknown>
}

/**
 * Dispatch a task based on intent mode.
 * Returns null for 'qa' mode (no special task handling needed).
 */
export function dispatchTask(
  mode: IntentMode,
  query: string,
  contextSnippets: ContextSnippet[]
): TaskResult | null {
  switch (mode) {
    case 'comparison': {
      const result = buildComparisonTask(query, contextSnippets)
      return {
        systemInstruction: result.systemInstruction,
        mode,
        meta: {
          documentCount: result.documentCount,
          documentNames: Object.keys(result.documentGroups),
        }
      }
    }

    case 'summary': {
      const result = buildFolderSummaryTask(query, contextSnippets)
      return {
        systemInstruction: result.systemInstruction,
        mode,
        meta: {
          documentCount: result.documentCount,
          documentNames: Object.keys(result.documentGroups),
        }
      }
    }

    case 'report': {
      const result = buildReportGenerationTask(query, contextSnippets)
      return {
        systemInstruction: result.systemInstruction,
        mode,
        meta: {
          subtype: result.subtype,
          documentCount: result.documentCount,
        }
      }
    }

    case 'extraction': {
      const result = buildExtractionTask(query, contextSnippets)
      return {
        systemInstruction: result.systemInstruction,
        mode,
        meta: {
          extractionTarget: result.extractionTarget,
          documentCount: result.documentCount,
        }
      }
    }

    case 'qa':
    default:
      return null
  }
}
