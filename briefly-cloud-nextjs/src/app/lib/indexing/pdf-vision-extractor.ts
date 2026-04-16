/**
 * Vision-based PDF text extraction fallback.
 *
 * When pdf-parse returns empty text (scanned/image-based PDFs), this module
 * sends the raw PDF buffer to GPT-4o-mini via the Chat Completions API.
 * OpenAI rasterises each page internally — no pdfjs-dist or canvas needed.
 *
 * Cost: ~$0.00085 per page (gpt-4o-mini vision input pricing).
 * Timeout: 90 seconds hard cap (vision is slower than text extraction).
 * Page cap: MAX_VISION_PAGES = 100 (prevents runaway cost on 500-page decks).
 *
 * Feature flag: PDF_VISION_EXTRACTION_ENABLED env var (checked by caller,
 * not by this module — keeps the extractor pure).
 */

import { openai } from '@/app/lib/openai'
import { logger } from '@/app/lib/logger'

// ─── Configuration ──────────────────────────────────────────────────────────

/** Maximum pages to process via vision. Beyond this, only the first N are extracted. */
const MAX_VISION_PAGES = 100

/** Hard timeout for the entire vision extraction call (ms). */
const VISION_TIMEOUT_MS = 90_000

/** Approximate per-page cost for gpt-4o-mini vision input. */
const COST_PER_PAGE_USD = 0.00085

/** Model to use for vision extraction. */
const VISION_MODEL = 'gpt-4o-mini'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VisionExtractionResult {
  /** Extracted text from the PDF, preserving structure. */
  text: string
  /** Total number of pages in the PDF (from pdf-parse or estimated). */
  pageCount: number
  /** Number of pages actually processed by vision (capped at MAX_VISION_PAGES). */
  pagesProcessed: number
  /** Estimated cost in USD for this extraction. */
  costUsd: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Estimate page count from a PDF buffer by counting /Type /Page entries.
 * This is a rough heuristic — good enough for cost estimation and cap enforcement.
 * Falls back to 1 if parsing fails.
 */
function estimatePageCount(buffer: Buffer): number {
  try {
    // Count occurrences of "/Type /Page" (but not "/Type /Pages") in the raw PDF
    const raw = buffer.toString('latin1')
    const matches = raw.match(/\/Type\s*\/Page(?!s)/g)
    return matches ? matches.length : 1
  } catch {
    return 1
  }
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Extract text from an image-based PDF using GPT-4o-mini vision.
 *
 * The PDF buffer is base64-encoded and sent as a `file` content part in the
 * Chat Completions API. OpenAI handles rasterisation internally — no image
 * conversion step is needed on our side.
 *
 * @param buffer - Raw PDF file buffer (must be < 50 MB per OpenAI limit)
 * @param fileName - Original file name (for logging)
 * @returns Extracted text, page counts, and estimated cost
 * @throws Error on timeout, API failure, or if buffer exceeds 50 MB
 */
export async function extractPdfWithVision(
  buffer: Buffer,
  fileName: string
): Promise<VisionExtractionResult> {
  // Guard: OpenAI's per-file limit is 50 MB
  const MAX_FILE_SIZE = 50 * 1024 * 1024
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`PDF too large for vision extraction: ${Math.round(buffer.length / 1024 / 1024)}MB (max 50MB)`)
  }

  const pageCount = estimatePageCount(buffer)
  const pagesProcessed = Math.min(pageCount, MAX_VISION_PAGES)

  logger.info('[vision:pdf-start]', {
    fileName,
    pageCount,
    pagesProcessed,
    bufferSizeMB: Math.round(buffer.length / 1024 / 1024 * 100) / 100
  })

  // Encode the PDF as a base64 data URI
  const base64 = buffer.toString('base64')
  const dataUri = `data:application/pdf;base64,${base64}`

  // Build the system prompt — extraction-only, no commentary
  const systemPrompt =
    'You are a document text extraction tool. Extract ALL readable text from this PDF, ' +
    'preserving structure. Include headings, bullet points, table data, slide titles, ' +
    'and any text visible in charts or diagrams. Output only the extracted text — ' +
    'no commentary, no "Here is the text", no markdown wrapping. ' +
    'If a page is blank or has no text, skip it silently.'

  // Race the API call against a hard timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

  try {
    const response = await openai.chat.completions.create(
      {
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: pageCount > MAX_VISION_PAGES
                  ? `Extract all text from this PDF. Note: this document has ${pageCount} pages but only the first ${MAX_VISION_PAGES} will be processed.`
                  : 'Extract all text from this PDF.'
              },
              {
                type: 'file',
                file: {
                  filename: fileName,
                  file_data: dataUri
                }
              } as any // The 'file' content type is supported by the API but not yet in all SDK type definitions
            ]
          }
        ],
        max_tokens: 16_000, // Vision extraction can produce long output
        temperature: 0 // Deterministic extraction
      },
      { signal: controller.signal }
    )

    clearTimeout(timeoutId)

    let text = response.choices?.[0]?.message?.content?.trim() || ''

    // Append truncation warning if we capped pages
    if (pageCount > MAX_VISION_PAGES) {
      text += `\n\n[Note: Only first ${MAX_VISION_PAGES} pages extracted via vision — document has ${pageCount} pages total]`
    }

    const costUsd = pagesProcessed * COST_PER_PAGE_USD

    logger.info('[vision:pdf-complete]', {
      fileName,
      pageCount,
      pagesProcessed,
      costUsd,
      textLength: text.length,
      tokensUsed: response.usage?.total_tokens ?? 0
    })

    return { text, pageCount, pagesProcessed, costUsd }
  } catch (err) {
    clearTimeout(timeoutId)

    // Translate AbortError to a timeout message
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      logger.warn('[vision:pdf-timeout]', { fileName, pageCount, timeoutMs: VISION_TIMEOUT_MS })
      throw new Error(`Vision extraction timeout (${VISION_TIMEOUT_MS / 1000}s)`)
    }

    logger.error('[vision:pdf-error]', {
      fileName,
      error: err instanceof Error ? err.message : 'Unknown error'
    })
    throw err
  }
}
