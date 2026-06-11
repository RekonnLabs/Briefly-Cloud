// @ts-nocheck — pending type cleanup
/**
 * intentRouter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule-based intent detection — ZERO LLM calls.
 *
 * Classifies a user message into one of five modes:
 *   qa          — default; single-document Q&A
 *   comparison  — compare/contrast across documents
 *   summary     — summarize one or more documents
 *   report      — draft a structured report/memo/proposal
 *   extraction  — extract structured data (lists, tables, fields)
 *
 * Design constraints:
 *   - Pure regex + keyword matching; no embeddings, no API calls
 *   - Deterministic and synchronous
 *   - Highest-confidence match wins; ties broken by priority order
 *   - Returns IntentResult with mode, confidence, and matched signals
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type IntentMode = 'qa' | 'comparison' | 'summary' | 'report' | 'extraction'

export interface IntentResult {
  mode: IntentMode
  confidence: 'high' | 'medium' | 'low'
  signals: string[]           // which patterns triggered
  topK: number                // recommended number of chunks to retrieve
  maxMemoryTokens: number     // recommended memory budget for this mode
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern definitions
// Each entry: [regex, signal label, confidence weight]
// ─────────────────────────────────────────────────────────────────────────────

type PatternEntry = [RegExp, string, number]

const COMPARISON_PATTERNS: PatternEntry[] = [
  [/\bcompare\b/i,                    'compare',           3],
  [/\bvs\.?\b|\bversus\b/i,           'vs/versus',         3],
  [/\bdifference(s)?\b/i,             'difference',        2],
  [/\bsimilar(ity|ities)?\b/i,        'similarity',        2],
  [/\bcontrast\b/i,                   'contrast',          2],
  [/\bhow (do|does) .{0,30} differ/i, 'how-differ',        3],
  [/\bwhich (is|are) (better|worse)/i,'which-better',      2],
  [/\bbetween .{0,40} and .{0,40}/i,  'between-X-and-Y',   2],
  [/\bside.?by.?side\b/i,             'side-by-side',      3],
]

const SUMMARY_PATTERNS: PatternEntry[] = [
  [/\bsummar(ize|ise|y)\b/i,          'summarize',         3],
  [/\boverview\b/i,                   'overview',          2],
  [/\bbrief(ly)?\b/i,                 'briefly',           1],
  [/\btldr\b|tl;dr/i,                 'tldr',              3],
  [/\bkey (points?|takeaways?)\b/i,   'key-points',        2],
  [/\bmain (points?|ideas?|themes?)/i,'main-points',       2],
  [/\bwhat (is|are) .{0,30} about\b/i,'what-about',        2],
  [/\bgive me (an? )?(overview|summary)/i,'give-overview',  3],
  [/\bcondense\b/i,                   'condense',          2],
  [/\bdigest\b/i,                     'digest',            2],
]

const REPORT_PATTERNS: PatternEntry[] = [
  [/\bdraft\b/i,                      'draft',             3],
  [/\bwrite (a|an|the)\b/i,           'write-a',           2],
  [/\bgenerate (a|an|the)\b/i,        'generate-a',        2],
  [/\breport\b/i,                     'report',            3],
  [/\bmemo\b/i,                       'memo',              3],
  [/\bproposal\b/i,                   'proposal',          3],
  [/\bdocument\b/i,                   'document',          1],
  [/\bexecutive summary\b/i,          'exec-summary',      3],
  [/\bwrite up\b/i,                   'write-up',          2],
  [/\bformat(ted)? (as|for)\b/i,      'formatted-as',      2],
  [/\bpresentation\b/i,               'presentation',      2],
]

const EXTRACTION_PATTERNS: PatternEntry[] = [
  [/\bextract\b/i,                    'extract',           3],
  [/\blist all\b/i,                   'list-all',          3],
  [/\bfind all\b/i,                   'find-all',          3],
  [/\bpull (out|all)\b/i,             'pull-out',          3],
  [/\bidentify all\b/i,               'identify-all',      2],
  [/\bcollect all\b/i,                'collect-all',       2],
  [/\btable of\b/i,                   'table-of',          2],
  [/\bspreadsheet\b/i,                'spreadsheet',       2],
  [/\bcsv\b/i,                        'csv',               3],
  [/\bstructured (data|output)\b/i,   'structured-output', 3],
  [/\bevery\b.{0,20}\b(name|date|number|amount|price|item)\b/i, 'every-field', 2],
]

// ─────────────────────────────────────────────────────────────────────────────
// Mode configuration
// ─────────────────────────────────────────────────────────────────────────────

interface ModeConfig {
  topK: number
  maxMemoryTokens: number
}

const MODE_CONFIG: Record<IntentMode, ModeConfig> = {
  qa:         { topK: 9,  maxMemoryTokens: 800  },
  comparison: { topK: 20, maxMemoryTokens: 400  },
  summary:    { topK: 20, maxMemoryTokens: 400  },
  report:     { topK: 25, maxMemoryTokens: 300  },
  extraction: { topK: 25, maxMemoryTokens: 200  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Score a message against a pattern list
// ─────────────────────────────────────────────────────────────────────────────

function scorePatterns(text: string, patterns: PatternEntry[]): { score: number; signals: string[] } {
  let score = 0
  const signals: string[] = []

  for (const [regex, label, weight] of patterns) {
    if (regex.test(text)) {
      score += weight
      signals.push(label)
    }
  }

  return { score, signals }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function detectIntent(message: string): IntentResult {
  const text = message.trim()

  const scores: Record<Exclude<IntentMode, 'qa'>, { score: number; signals: string[] }> = {
    comparison: scorePatterns(text, COMPARISON_PATTERNS),
    summary:    scorePatterns(text, SUMMARY_PATTERNS),
    report:     scorePatterns(text, REPORT_PATTERNS),
    extraction: scorePatterns(text, EXTRACTION_PATTERNS),
  }

  // Find the highest-scoring mode
  let bestMode: IntentMode = 'qa'
  let bestScore = 0
  let bestSignals: string[] = []

  for (const [mode, { score, signals }] of Object.entries(scores) as [Exclude<IntentMode, 'qa'>, { score: number; signals: string[] }][]) {
    if (score > bestScore) {
      bestScore = score
      bestMode = mode
      bestSignals = signals
    }
  }

  // Confidence thresholds
  let confidence: IntentResult['confidence']
  if (bestScore >= 5) {
    confidence = 'high'
  } else if (bestScore >= 2) {
    confidence = 'medium'
  } else {
    confidence = 'low'
    bestMode = 'qa'
    bestSignals = []
  }

  const config = MODE_CONFIG[bestMode]

  return {
    mode: bestMode,
    confidence,
    signals: bestSignals,
    topK: config.topK,
    maxMemoryTokens: config.maxMemoryTokens,
  }
}

/**
 * Convenience: returns just the mode string.
 */
export function getIntentMode(message: string): IntentMode {
  return detectIntent(message).mode
}
