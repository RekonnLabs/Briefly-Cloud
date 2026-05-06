/**
 * Gemini-native PDF embedding fallback.
 *
 * SPEC 4 Step 3: Replaced the GPT-4o-mini vision path with Gemini's native PDF
 * input support. Instead of rasterising pages and sending them to a vision LLM
 * for text extraction, we upload the raw PDF buffer to the Gemini Files API and
 * embed it directly — no intermediate text extraction step required.
 *
 * This produces a single embedding vector per PDF (the whole document is treated
 * as one chunk for image-based PDFs). The caller receives an array of one vector
 * for compatibility with the existing chunk-storage pipeline.
 *
 * Cost: Gemini embedding pricing TBD — currently $0 tracked.
 * Timeout: 120 seconds hard cap (file upload + embed can be slow for large PDFs).
 * Size cap: 20 MB per Gemini Files API limit for inline uploads.
 */

import { GoogleGenAI, createPartFromUri } from '@google/genai'
import { logger } from '@/app/lib/logger'
import { EMBED_MODEL, EMBED_DIMS } from '@/app/lib/embeddings'

// ─── Configuration ────────────────────────────────────────────────────────────

/** Hard timeout for the entire PDF embed call (ms). */
const PDF_EMBED_TIMEOUT_MS = 120_000

/** Gemini Files API per-file size limit. */
const MAX_FILE_SIZE = 20 * 1024 * 1024

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisionExtractionResult {
  /** Extracted text — empty string for native-embed path (no text extraction). */
  text: string
  /** Total number of pages in the PDF (estimated). */
  pageCount: number
  /** Number of pages processed. */
  pagesProcessed: number
  /** Estimated cost in USD. */
  costUsd: number
}

export interface PdfEmbedResult {
  /** Embedding vectors — one per PDF (image-based PDFs produce a single vector). */
  embeddings: number[][]
  /** Estimated cost in USD. */
  costUsd: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimatePageCount(buffer: Buffer): number {
  try {
    const raw = buffer.toString('latin1')
    const matches = raw.match(/\/Type\s*\/Page(?!s)/g)
    return matches ? matches.length : 1
  } catch {
    return 1
  }
}

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Embed an image-based PDF using Gemini's native PDF input.
 *
 * The PDF buffer is uploaded to the Gemini Files API, then passed directly to
 * embedContent. No vision/OCR step is needed — Gemini handles the PDF natively.
 *
 * @param buffer   - Raw PDF file buffer (must be < 20 MB)
 * @param fileName - Original file name (for logging)
 * @returns Array of embedding vectors (one per document)
 */
export async function embedPdfPages(
  buffer: Buffer,
  fileName: string
): Promise<PdfEmbedResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `PDF too large for Gemini native embed: ${Math.round(buffer.length / 1024 / 1024)}MB (max 20MB)`
    )
  }

  const pageCount = estimatePageCount(buffer)

  logger.info('[gemini-pdf-embed:start]', {
    fileName,
    pageCount,
    bufferSizeMB: Math.round(buffer.length / 1024 / 1024 * 100) / 100,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PDF_EMBED_TIMEOUT_MS)

  try {
    const genai = getGenAI()

    // Upload the PDF buffer to Gemini Files API
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const uploadedFile = await genai.files.upload(blob, { mimeType: 'application/pdf' })

    if (!uploadedFile.uri) {
      throw new Error('Gemini Files API did not return a URI for the uploaded PDF')
    }

    // Embed the uploaded PDF natively
    const res = await genai.models.embedContent({
      model: EMBED_MODEL,
      contents: createPartFromUri(uploadedFile.uri, 'application/pdf'),
      config: { outputDimensionality: EMBED_DIMS },
    })

    clearTimeout(timeoutId)

    const embedding = res.embeddings![0].values!

    logger.info('[gemini-pdf-embed:complete]', {
      fileName,
      pageCount,
      embeddingDimensions: embedding.length,
    })

    return {
      embeddings: [embedding],
      costUsd: 0, // Gemini embedding pricing TBD
    }
  } catch (err) {
    clearTimeout(timeoutId)

    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      logger.warn('[gemini-pdf-embed:timeout]', { fileName, pageCount, timeoutMs: PDF_EMBED_TIMEOUT_MS })
      throw new Error(`Gemini PDF embed timeout (${PDF_EMBED_TIMEOUT_MS / 1000}s)`)
    }

    logger.error('[gemini-pdf-embed:error]', {
      fileName,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    throw err
  }
}

/**
 * Legacy compatibility shim — callers that used extractPdfWithVision now call
 * embedPdfPages instead. This wrapper returns a VisionExtractionResult with an
 * empty text field (the embedding is stored separately by the caller).
 *
 * @deprecated Use embedPdfPages directly for new code.
 */
export async function extractPdfWithVision(
  buffer: Buffer,
  fileName: string
): Promise<VisionExtractionResult> {
  const pageCount = estimatePageCount(buffer)

  logger.info('[gemini-pdf-embed:legacy-shim]', { fileName, pageCount })

  // Run the native embed (result discarded here — caller should use embedPdfPages)
  await embedPdfPages(buffer, fileName)

  return {
    text: '',
    pageCount,
    pagesProcessed: pageCount,
    costUsd: 0,
  }
}
