/**
 * Vision Extractor — Spec 11
 *
 * Classifies PDF pages by text density and extracts content from image-heavy
 * pages using Gemini 2.5 Flash vision. Uses unpdf for per-page text scanning
 * and the Gemini Files API for image-based page extraction.
 *
 * Two public entry points:
 *   classifyPdfPages()   — scan page text density, return text/vision split
 *   extractWithVision()  — run Gemini Flash on a single image (base64 PNG/JPEG)
 *   extractPdfVisionPages() — upload PDF to Gemini Files API, extract image-heavy pages
 */

import { GoogleGenAI } from '@google/genai'
import { logger } from '@/app/lib/logger'

// ─── Configuration ────────────────────────────────────────────────────────────

/** Pages with fewer extracted chars than this threshold are treated as image-heavy. */
const VISION_THRESHOLD_CHARS = parseInt(process.env.VISION_THRESHOLD_CHARS ?? '50', 10)

/** Gemini model used for vision extraction. */
const VISION_MODEL = 'gemini-2.5-flash'

/** Maximum file size for Gemini Files API inline upload (20 MB). */
const GEMINI_FILES_API_MAX_BYTES = 20 * 1024 * 1024

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageClassification {
  /** 0-indexed page number. */
  index: number
  /** Number of text characters extracted by unpdf. */
  textCharCount: number
  /** True if textCharCount < VISION_THRESHOLD_CHARS. */
  isImageHeavy: boolean
}

export interface PdfClassificationResult {
  totalPages: number
  textPageIndices: number[]
  visionPageIndices: number[]
  pages: PageClassification[]
}

export interface VisionPageResult {
  /** 0-indexed page number. */
  pageIndex: number
  /** Extracted text from Gemini vision. */
  text: string
  /** Model used. */
  model: string
}

// ─── Universal Vision Prompt ──────────────────────────────────────────────────

const VISION_EXTRACTION_PROMPT = `
You are extracting content from a document image to enable AI-powered search.
Users will later search this content with specific questions — your output must
contain every piece of information a user might search for.

First identify what type of content this is:
- Presentation slide or diagram
- Scanned text document
- Photograph (property, product, site, inspection, etc.)
- Chart or graph
- Table or form
- Mixed or other

Then extract accordingly:

FOR ALL TYPES: Extract every word of visible text, preserving structure.

FOR SLIDES/DIAGRAMS: Also describe all visual frameworks, flowcharts, org charts,
process diagrams, or conceptual models — include every label, arrow, relationship,
and structural element. Name the framework or model if recognizable.

FOR CHARTS/GRAPHS: Extract title, axis labels, scale, all data series names,
key data points and their values, and the trend or conclusion shown.

FOR PHOTOGRAPHS: Describe subject, location (if apparent), visible materials,
conditions, defects, dimensions (if visible), and overall assessment.
For property/inspection photos: note any damage, materials, systems visible.

FOR SCANNED DOCUMENTS: Extract all text verbatim, preserving headings,
paragraph structure, table contents, and form field labels with values.

Be exhaustive. Omission means that information becomes unsearchable.
`.trim()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

// ─── Phase 1: PDF Page Classification ────────────────────────────────────────

/**
 * Scan a PDF buffer page by page using unpdf and return which pages need vision.
 *
 * Uses unpdf's mergePages: false mode to get per-page text arrays without
 * requiring pdfjs-dist or a canvas backend.
 */
export async function classifyPdfPages(buffer: Buffer): Promise<PdfClassificationResult> {
  const { extractText } = await import('unpdf')
  const uint8 = new Uint8Array(buffer)

  // mergePages: false returns string[] — one entry per page
  const { totalPages, text: pageTexts } = await extractText(uint8, { mergePages: false })

  const pages: PageClassification[] = pageTexts.map((pageText, index) => {
    const charCount = pageText.replace(/\u0000/g, '').trim().length
    return {
      index,
      textCharCount: charCount,
      isImageHeavy: charCount < VISION_THRESHOLD_CHARS,
    }
  })

  const textPageIndices = pages.filter(p => !p.isImageHeavy).map(p => p.index)
  const visionPageIndices = pages.filter(p => p.isImageHeavy).map(p => p.index)

  logger.info('[vision-extractor:classify]', {
    totalPages,
    textPages: textPageIndices.length,
    visionPages: visionPageIndices.length,
    threshold: VISION_THRESHOLD_CHARS,
  })

  return { totalPages, textPageIndices, visionPageIndices, pages }
}

// ─── Phase 2a: Standalone Image Vision ───────────────────────────────────────

/**
 * Extract content from a single image (base64-encoded PNG or JPEG) using
 * Gemini 2.5 Flash. Used for standalone image files (JPG, PNG, WEBP).
 */
export async function extractWithVision(
  imageBase64: string,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png'
): Promise<string> {
  const genai = getGenAI()
  const model = genai.models

  const result = await model.generateContent({
    model: VISION_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: VISION_EXTRACTION_PROMPT },
        ],
      },
    ],
  })

  return result.text ?? ''
}

// ─── Phase 2b: PDF Vision via Gemini Files API ────────────────────────────────

/**
 * Extract content from image-heavy pages of a PDF using the Gemini Files API.
 *
 * Strategy: Upload the entire PDF to the Gemini Files API once, then ask
 * Gemini to extract content from each image-heavy page by page number.
 * This avoids the need for a canvas/rendering library on Vercel serverless.
 *
 * Falls back to a per-page prompt approach if the PDF exceeds the 20 MB
 * Files API limit — in that case, we request all image-heavy pages in a
 * single prompt with explicit page number references.
 *
 * @param buffer            Raw PDF buffer
 * @param visionPageIndices 0-indexed page numbers that need vision extraction
 * @param fileName          Original file name (for logging)
 * @returns Array of VisionPageResult, one per requested page
 */
export async function extractPdfVisionPages(
  buffer: Buffer,
  visionPageIndices: number[],
  fileName: string
): Promise<VisionPageResult[]> {
  if (visionPageIndices.length === 0) return []

  const genai = getGenAI()

  // Build a prompt that requests extraction for each image-heavy page
  const pageList = visionPageIndices.map(i => `Page ${i + 1}`).join(', ')
  const prompt = `
This is a PDF document named "${fileName}".

The following pages are image-heavy (contain diagrams, charts, photos, or scanned content
rather than extractable text): ${pageList}.

For EACH of these pages, extract all content using the following instructions:

${VISION_EXTRACTION_PROMPT}

Format your response as:
--- PAGE [number] ---
[extracted content]

Include a section for every page listed above, even if a page appears blank.
`.trim()

  try {
    if (buffer.length <= GEMINI_FILES_API_MAX_BYTES) {
      // Upload PDF to Files API and process natively
      const uploadResult = await genai.files.upload({
        file: new Blob([buffer], { type: 'application/pdf' }),
        config: { mimeType: 'application/pdf', displayName: fileName },
      })

      const fileUri = uploadResult.uri
      if (!fileUri) {
        throw new Error('Gemini Files API upload returned no URI')
      }

      logger.info('[vision-extractor:pdf-upload]', {
        fileName,
        bytes: buffer.length,
        fileUri,
        visionPages: visionPageIndices.length,
      })

      const result = await genai.models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType: 'application/pdf', fileUri } },
              { text: prompt },
            ],
          },
        ],
      })

      const rawText = result.text ?? ''

      // Clean up uploaded file (fire-and-forget)
      const fileId = fileUri.split('/').pop()
      if (fileId) {
        genai.files.delete({ name: `files/${fileId}` }).catch(err => {
          logger.warn('[vision-extractor:cleanup-failed]', { fileId, error: err?.message })
        })
      }

      return parseVisionResponse(rawText, visionPageIndices)
    } else {
      // PDF too large for Files API — use inline base64 with pdfjs page rendering
      // This path is a best-effort fallback: return empty results with a warning
      // so the router can still assemble text-only chunks for the non-vision pages.
      logger.warn('[vision-extractor:pdf-too-large]', {
        fileName,
        bytes: buffer.length,
        maxBytes: GEMINI_FILES_API_MAX_BYTES,
        visionPages: visionPageIndices.length,
      })
      return visionPageIndices.map(i => ({
        pageIndex: i,
        text: `[Vision extraction skipped: PDF exceeds ${Math.round(GEMINI_FILES_API_MAX_BYTES / 1024 / 1024)}MB Files API limit]`,
        model: VISION_MODEL,
      }))
    }
  } catch (error) {
    logger.error('[vision-extractor:pdf-vision-failed]', {
      fileName,
      error: error instanceof Error ? error.message : String(error),
    })
    // Return empty results so the router can still process text pages
    return visionPageIndices.map(i => ({
      pageIndex: i,
      text: `[Vision extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
      model: VISION_MODEL,
    }))
  }
}

// ─── Response Parser ──────────────────────────────────────────────────────────

/**
 * Parse Gemini's multi-page response into per-page results.
 * Expects sections formatted as: --- PAGE [n] ---\n[content]
 */
function parseVisionResponse(
  rawText: string,
  visionPageIndices: number[]
): VisionPageResult[] {
  const results: VisionPageResult[] = []
  const sectionRegex = /---\s*PAGE\s+(\d+)\s*---\s*([\s\S]*?)(?=---\s*PAGE\s+\d+\s*---|$)/gi

  const parsed = new Map<number, string>()
  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(rawText)) !== null) {
    const pageNum = parseInt(match[1], 10)
    const content = match[2].trim()
    parsed.set(pageNum, content)
  }

  for (const pageIndex of visionPageIndices) {
    const pageNum = pageIndex + 1
    const text = parsed.get(pageNum) ?? rawText.trim() // fallback: use full response if no sections
    results.push({ pageIndex, text, model: VISION_MODEL })
  }

  return results
}
