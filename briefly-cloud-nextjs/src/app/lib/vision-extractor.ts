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
const VISION_THRESHOLD_CHARS = parseInt(process.env.VISION_THRESHOLD_CHARS ?? '200', 10)

/** Number of vision pages to request per Gemini call. Keeps each call under ~15s. */
const VISION_BATCH_SIZE = parseInt(process.env.VISION_BATCH_SIZE ?? '15', 10)

/** Maximum number of pages to send through vision extraction. Caps total time. */
const MAX_VISION_PAGES = parseInt(process.env.MAX_VISION_PAGES ?? '30', 10)

/** Gemini model used for vision extraction. */
const VISION_MODEL = 'gemini-2.5-flash'

/** Maximum file size for Gemini Files API upload (2 GB — actual Files API limit, not the inline data limit). */
const GEMINI_FILES_API_MAX_BYTES = 2 * 1024 * 1024 * 1024

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

FOR TABLES/FORMS: Represent the table using markdown table format exactly:
| Header | Header | Header |
|---|---|---|
| Data | Data | Data |
Preserve all exact numbers, labels, and cell values. Include every row and
column — do not summarize or omit rows. If the table has merged cells or
hierarchical headers, flatten them into the closest accurate representation.

FOR SCANNED DOCUMENTS: Extract all text verbatim, preserving headings,
paragraph structure, and form field labels with values. If the document
contains tables, use markdown table format as described above.

Be exhaustive. Omission means that information becomes unsearchable.
`.trim()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

// ─── Phase 1: PDF Page Classification ────────────────────────────────────────

/**
 * Detect garbled table patterns — pages where PDF table extraction produced
 * orphaned numbers on separate lines (columns lost their structure).
 * 3+ lines that are just a number indicate a table that text extraction mangled.
 */
function hasGarbledTable(pageText: string): boolean {
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean)
  const numberOnlyLines = lines.filter(l => /^\d+$/.test(l))
  return numberOnlyLines.length >= 3
}

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
    const cleanText = pageText.replace(/\u0000/g, '').trim()
    const charCount = cleanText.length
    const needsVision = charCount < VISION_THRESHOLD_CHARS || hasGarbledTable(cleanText)
    return {
      index,
      textCharCount: charCount,
      isImageHeavy: needsVision,
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
 * Falls back gracefully if the PDF exceeds the 2 GB Files API limit (extremely
 * unlikely in practice — the Files API is designed for large files).
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

  // Cap total vision pages to stay within function timeout budget
  if (visionPageIndices.length > MAX_VISION_PAGES) {
    logger.warn('[vision-extractor:pages-capped]', {
      fileName,
      total: visionPageIndices.length,
      processing: MAX_VISION_PAGES,
    })
    visionPageIndices = visionPageIndices.slice(0, MAX_VISION_PAGES)
  }

  if (buffer.length > GEMINI_FILES_API_MAX_BYTES) {
    logger.warn('[vision-extractor:pdf-too-large]', {
      fileName,
      bytes: buffer.length,
      maxBytes: GEMINI_FILES_API_MAX_BYTES,
      visionPages: visionPageIndices.length,
    })
    return visionPageIndices.map(i => ({
      pageIndex: i,
      text: '[Vision extraction skipped: PDF exceeds 2GB Files API limit]',
      model: VISION_MODEL,
    }))
  }

  const genai = getGenAI()

  // Upload the PDF to the Gemini Files API once — reuse the URI across all batches.
  let fileUri: string
  try {
    const uploadResult = await genai.files.upload({
      file: new Blob([buffer], { type: 'application/pdf' }),
      config: { mimeType: 'application/pdf', displayName: fileName },
    })
    if (!uploadResult.uri) throw new Error('Gemini Files API upload returned no URI')
    fileUri = uploadResult.uri
    logger.info('[vision-extractor:pdf-upload]', {
      fileName,
      bytes: buffer.length,
      fileUri,
      visionPages: visionPageIndices.length,
      batchSize: VISION_BATCH_SIZE,
      batches: Math.ceil(visionPageIndices.length / VISION_BATCH_SIZE),
    })
  } catch (uploadError) {
    logger.error('[vision-extractor:pdf-upload-failed]', {
      fileName,
      error: uploadError instanceof Error ? uploadError.message : String(uploadError),
    })
    return visionPageIndices.map(i => ({
      pageIndex: i,
      text: `[Vision extraction failed: upload error — ${uploadError instanceof Error ? uploadError.message : 'Unknown'}]`,
      model: VISION_MODEL,
    }))
  }

  // Split vision pages into batches and process sequentially to stay within
  // per-call latency budget (~10-15s per batch of 15 pages).
  const batches: number[][] = []
  for (let i = 0; i < visionPageIndices.length; i += VISION_BATCH_SIZE) {
    batches.push(visionPageIndices.slice(i, i + VISION_BATCH_SIZE))
  }

  const allResults: VisionPageResult[] = []

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const pageList = batch.map(i => `Page ${i + 1}`).join(', ')
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
      logger.info('[vision-extractor:batch-start]', {
        fileName,
        batch: batchIdx + 1,
        totalBatches: batches.length,
        pages: batch.map(i => i + 1),
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
      const batchResults = parseVisionResponse(rawText, batch)
      allResults.push(...batchResults)

      logger.info('[vision-extractor:batch-done]', {
        fileName,
        batch: batchIdx + 1,
        pagesExtracted: batchResults.length,
      })
    } catch (batchError) {
      logger.error('[vision-extractor:batch-failed]', {
        fileName,
        batch: batchIdx + 1,
        error: batchError instanceof Error ? batchError.message : String(batchError),
      })
      // Push placeholder results for failed batch so text-only chunks still assemble
      for (const pageIndex of batch) {
        allResults.push({
          pageIndex,
          text: `[Vision extraction failed for page ${pageIndex + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}]`,
          model: VISION_MODEL,
        })
      }
    }
  }

  // Clean up uploaded file (fire-and-forget)
  const fileId = fileUri.split('/').pop()
  if (fileId) {
    genai.files.delete({ name: `files/${fileId}` }).catch(err => {
      logger.warn('[vision-extractor:cleanup-failed]', { fileId, error: err?.message })
    })
  }

  return allResults
}

// ─── Phase 2c: PDF Vision with cached Gemini URI (for cron batching) ─────────

/**
 * Same as extractPdfVisionPages but accepts an optional pre-cached Gemini fileUri.
 * If provided, skips the upload step entirely. Returns the fileUri alongside results
 * so the caller can persist it for subsequent batches.
 *
 * The Gemini Files API URI is valid for 48 hours — safe to reuse across all cron ticks.
 */
export async function extractPdfVisionPagesWithUri(
  buffer: Buffer,
  visionPageIndices: number[],
  fileName: string,
  cachedFileUri?: string | null
): Promise<{ results: VisionPageResult[]; fileUri: string | null }> {
  if (visionPageIndices.length === 0) return { results: [], fileUri: cachedFileUri ?? null }

  if (buffer.length > GEMINI_FILES_API_MAX_BYTES) {
    logger.warn('[vision-extractor:pdf-too-large]', { fileName, bytes: buffer.length })
    return {
      results: visionPageIndices.map(i => ({
        pageIndex: i,
        text: '[Vision extraction skipped: PDF exceeds 2GB Files API limit]',
        model: VISION_MODEL,
      })),
      fileUri: null,
    }
  }

  const genai = getGenAI()
  let fileUri: string

  if (cachedFileUri) {
    fileUri = cachedFileUri
    logger.info('[vision-extractor:reusing-cached-uri]', { fileName, fileUri })
  } else {
    try {
      const uploadResult = await genai.files.upload({
        file: new Blob([buffer], { type: 'application/pdf' }),
        config: { mimeType: 'application/pdf', displayName: fileName },
      })
      if (!uploadResult.uri) throw new Error('Gemini Files API upload returned no URI')
      fileUri = uploadResult.uri
      logger.info('[vision-extractor:pdf-upload-new]', { fileName, bytes: buffer.length, fileUri })
    } catch (uploadError) {
      logger.error('[vision-extractor:pdf-upload-failed]', {
        fileName,
        error: uploadError instanceof Error ? uploadError.message : String(uploadError),
      })
      return {
        results: visionPageIndices.map(i => ({
          pageIndex: i,
          text: `[Vision extraction failed: upload error — ${uploadError instanceof Error ? uploadError.message : 'Unknown'}]`,
          model: VISION_MODEL,
        })),
        fileUri: null,
      }
    }
  }

  // Process the batch (single batch — cron sends one batch per tick)
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
    const results = parseVisionResponse(rawText, visionPageIndices)
    return { results, fileUri }
  } catch (batchError) {
    logger.error('[vision-extractor:batch-failed]', {
      fileName,
      error: batchError instanceof Error ? batchError.message : String(batchError),
    })
    return {
      results: visionPageIndices.map(i => ({
        pageIndex: i,
        text: `[Vision extraction failed for page ${i + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}]`,
        model: VISION_MODEL,
      })),
      fileUri, // still return the URI — the upload succeeded, just the extraction failed
    }
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
