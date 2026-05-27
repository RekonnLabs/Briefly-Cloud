/**
 * Document Intelligence Router — Spec 11
 *
 * Every file passes through this router before any extraction happens.
 * The router classifies the file, routes each content type to the correct
 * handler, assembles the results, and returns a unified ExtractedContent[]
 * ready for the chunking and embedding pipeline.
 *
 * Four phases:
 *   Phase 1 — Classification: determine category and vision requirements
 *   Phase 2 — Extraction: run text + vision extractors in parallel
 *   Phase 3 — Assembly: merge results into ordered ExtractedContent[]
 *   Phase 4 — Chunking/embedding: handled by document-processor.ts (unchanged interface)
 *
 * The router is a drop-in replacement for the direct extractTextFromBuffer call
 * in upload/route.ts, upload/process/route.ts, and import-job-manager.ts.
 */

import { logger } from '@/app/lib/logger'
import { classifyPdfPages, extractPdfVisionPages, extractWithVision } from '@/app/lib/vision-extractor'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Content categories derived from MIME type. */
export type DocumentCategory =
  | 'text'        // TXT, MD, CSV, JSON — pure text, skip classification
  | 'pdf'         // PDF — may be mixed text/image
  | 'docx'        // DOCX/DOC — text-first, embedded images possible
  | 'spreadsheet' // XLSX/XLS — CSV extraction, chart images possible
  | 'presentation'// PPTX/PPT — slide text + vision for image-heavy slides
  | 'image'       // JPG, PNG, WEBP — full vision extraction
  | 'unknown'

/**
 * A single piece of extracted content from the router.
 * Each item becomes one or more chunks in the embedding pipeline.
 */
export interface ExtractedContent {
  /** The actual content (vision output is also plain text). */
  text: string
  /** How this content was extracted. */
  extractionMethod: 'text_library' | 'vision'
  /** Semantic type of the content for LLM provenance. */
  contentType: 'text' | 'slide' | 'diagram' | 'photo' | 'table' | 'chart' | 'scanned' | 'mixed'
  /** Page number in a PDF (0-indexed), null for non-PDF types. */
  sourcePage: number | null
  /** Sheet name for XLSX, null for other types. */
  sourceSheet: string | null
  /** Gemini model used if vision extraction, null otherwise. */
  visionModel: string | null
}

/** Summary of the router's classification decision (for logging/metadata). */
export interface DocumentProfile {
  mimeType: string
  category: DocumentCategory
  requiresVision: boolean
  visionPageCount: number
  totalPages: number
}

// ─── MIME Type → Category Mapping ────────────────────────────────────────────

const MIME_TO_CATEGORY: Record<string, DocumentCategory> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-powerpoint': 'presentation',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
  'application/csv': 'text',
  'application/json': 'text',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
}

// ─── Main Router ──────────────────────────────────────────────────────────────

/**
 * Route a file through the Document Intelligence Router.
 *
 * Returns an array of ExtractedContent items ready for chunking.
 * For pure-text files this is a single item. For mixed PDFs it may be
 * dozens of items — one per page, tagged with extraction method.
 */
export async function routeDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  const category = MIME_TO_CATEGORY[mimeType] ?? 'unknown'

  logger.info('[document-router:start]', { fileName, mimeType, category })

  // ── Fast path: pure text files ────────────────────────────────────────────
  if (category === 'text' || category === 'unknown') {
    const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
    const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)
    const profile: DocumentProfile = {
      mimeType, category, requiresVision: false, visionPageCount: 0, totalPages: 1
    }
    return {
      profile,
      contents: [{
        text: extraction.text,
        extractionMethod: 'text_library',
        contentType: 'text',
        sourcePage: null,
        sourceSheet: null,
        visionModel: null,
      }]
    }
  }

  // ── Standalone image files ────────────────────────────────────────────────
  if (category === 'image') {
    return routeImage(buffer, mimeType, fileName)
  }

  // ── PDF files ─────────────────────────────────────────────────────────────
  if (category === 'pdf') {
    return routePdf(buffer, mimeType, fileName)
  }

  // ── DOCX files ────────────────────────────────────────────────────────────
  if (category === 'docx') {
    return routeDocx(buffer, mimeType, fileName)
  }

  // ── Spreadsheet files ─────────────────────────────────────────────────────
  if (category === 'spreadsheet') {
    return routeSpreadsheet(buffer, mimeType, fileName)
  }

  // ── Presentation files (PPTX) ─────────────────────────────────────────────
  if (category === 'presentation') {
    return routePresentation(buffer, mimeType, fileName)
  }

  // Fallback: treat as text
  const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
  const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)
  const profile: DocumentProfile = {
    mimeType, category: 'unknown', requiresVision: false, visionPageCount: 0, totalPages: 1
  }
  return {
    profile,
    contents: [{
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'text',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    }]
  }
}

// ─── Text-Only Router (for queue-based vision) ─────────────────────────────────

/**
 * Route a document for text extraction only — skip vision entirely.
 * Returns text contents immediately + the list of vision page indices for
 * queueing into app.vision_queue.
 *
 * Used by the process route's after() callback so that text chunks are
 * available in ~30s. Vision pages are processed separately by the cron worker.
 */
export async function routeDocumentTextOnly(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{
  contents: ExtractedContent[]
  profile: DocumentProfile
  visionPageIndices: number[]
}> {
  const category = MIME_TO_CATEGORY[mimeType] ?? 'unknown'

  logger.info('[document-router:text-only-start]', { fileName, mimeType, category })

  // Non-PDF files: no vision needed, route normally
  if (category !== 'pdf') {
    const result = await routeDocument(buffer, mimeType, fileName)
    return { ...result, visionPageIndices: [] }
  }

  // PDF: classify pages, extract text only, return vision indices for queue
  const classification = await classifyPdfPages(buffer)
  const { totalPages, textPageIndices, visionPageIndices, pages } = classification

  logger.info('[document-router:text-only-classified]', {
    fileName,
    totalPages,
    textPages: textPageIndices.length,
    visionPages: visionPageIndices.length,
  })

  // Extract text pages only (no vision call)
  const { extractText } = await import('unpdf')
  const { text: pageTexts } = await extractText(new Uint8Array(buffer), { mergePages: false })

  const contents: ExtractedContent[] = []
  for (let i = 0; i < totalPages; i++) {
    const page = pages[i]
    if (!page) continue
    if (!page.isImageHeavy) {
      const text = (pageTexts[i] ?? '').replace(/\u0000/g, '').trim()
      if (text) {
        contents.push({
          text,
          extractionMethod: 'text_library',
          contentType: 'text',
          sourcePage: i,
          sourceSheet: null,
          visionModel: null,
        })
      }
    }
    // Vision pages are skipped — they'll be processed by the cron worker
  }

  // Fallback: if no text pages had content, extract with full merged text
  if (contents.length === 0) {
    const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
    const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)
    contents.push({
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'text',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    })
  }

  const profile: DocumentProfile = {
    mimeType,
    category: 'pdf',
    requiresVision: visionPageIndices.length > 0,
    visionPageCount: visionPageIndices.length,
    totalPages,
  }

  logger.info('[document-router:text-only-complete]', {
    fileName,
    textChunks: contents.length,
    visionPagesQueued: visionPageIndices.length,
  })

  return { contents, profile, visionPageIndices }
}

// ─── PDF Router ───────────────────────────────────────────────────────────────

async function routePdf(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  // Phase 1: classify pages
  const classification = await classifyPdfPages(buffer)
  const { totalPages, textPageIndices, visionPageIndices, pages } = classification

  const requiresVision = visionPageIndices.length > 0

  logger.info('[document-router:pdf-classified]', {
    fileName,
    totalPages,
    textPages: textPageIndices.length,
    visionPages: visionPageIndices.length,
  })

  // Phase 2: extract text pages + vision pages in parallel
  const [textPageTexts, visionResults] = await Promise.all([
    // Text extraction: use unpdf with mergePages: false to get per-page text
    (async () => {
      if (textPageIndices.length === 0) return new Map<number, string>()
      const { extractText } = await import('unpdf')
      const { text: pageTexts } = await extractText(new Uint8Array(buffer), { mergePages: false })
      const map = new Map<number, string>()
      textPageIndices.forEach(i => {
        map.set(i, (pageTexts[i] ?? '').replace(/\u0000/g, ''))
      })
      return map
    })(),
    // Vision extraction: upload to Gemini Files API
    requiresVision
      ? extractPdfVisionPages(buffer, visionPageIndices, fileName)
      : Promise.resolve([]),
  ])

  const visionMap = new Map(visionResults.map(r => [r.pageIndex, r]))

  // Phase 3: assemble in page order
  const contents: ExtractedContent[] = []

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i]
    if (!page) continue

    if (!page.isImageHeavy) {
      const text = textPageTexts.get(i) ?? ''
      if (text.trim()) {
        contents.push({
          text,
          extractionMethod: 'text_library',
          contentType: 'text',
          sourcePage: i,
          sourceSheet: null,
          visionModel: null,
        })
      }
    } else {
      const visionResult = visionMap.get(i)
      if (visionResult) {
        contents.push({
          text: visionResult.text,
          extractionMethod: 'vision',
          contentType: inferPdfPageContentType(visionResult.text),
          sourcePage: i,
          sourceSheet: null,
          visionModel: visionResult.model,
        })
      }
    }
  }

  // Fallback: if all pages were empty (fully image-based PDF > 20MB), return a
  // single text item with the full merged text from extractTextFromBuffer so the
  // file still gets indexed (may be low quality but better than nothing).
  if (contents.length === 0) {
    const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
    const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)
    contents.push({
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'text',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    })
  }

  const profile: DocumentProfile = {
    mimeType,
    category: 'pdf',
    requiresVision,
    visionPageCount: visionPageIndices.length,
    totalPages,
  }

  logger.info('[document-router:pdf-assembled]', {
    fileName,
    contentItems: contents.length,
    visionItems: contents.filter(c => c.extractionMethod === 'vision').length,
  })

  return { contents, profile }
}

// ─── DOCX Router ──────────────────────────────────────────────────────────────

async function routeDocx(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  // DOCX is text-first. Embedded images are rare and not worth the complexity
  // of extracting them individually. Use mammoth for full text extraction.
  const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
  const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)

  const profile: DocumentProfile = {
    mimeType, category: 'docx', requiresVision: false, visionPageCount: 0, totalPages: 1
  }

  return {
    profile,
    contents: [{
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'text',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    }]
  }
}

// ─── Spreadsheet Router ───────────────────────────────────────────────────────

async function routeSpreadsheet(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  // XLSX: extract CSV text per sheet. Charts are image objects — not extracted
  // in this version (Spec 11 scope boundary).
  const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
  const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)

  const profile: DocumentProfile = {
    mimeType, category: 'spreadsheet', requiresVision: false, visionPageCount: 0, totalPages: 1
  }

  return {
    profile,
    contents: [{
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'table',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    }]
  }
}

// ─── Presentation Router ──────────────────────────────────────────────────────

async function routePresentation(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  // PPTX: extract slide text via pptx-extractor. For now, treat as text-only
  // (vision for PPTX embedded images is a follow-on — the PDF export path via
  // routePdf() already handles slide decks exported as PDF, which is the common case).
  const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
  const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)

  const profile: DocumentProfile = {
    mimeType, category: 'presentation', requiresVision: false, visionPageCount: 0, totalPages: 1
  }

  return {
    profile,
    contents: [{
      text: extraction.text,
      extractionMethod: 'text_library',
      contentType: 'slide',
      sourcePage: null,
      sourceSheet: null,
      visionModel: null,
    }]
  }
}

// ─── Standalone Image Router ──────────────────────────────────────────────────

async function routeImage(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ contents: ExtractedContent[]; profile: DocumentProfile }> {
  // Convert buffer to base64 for Gemini inline data
  const base64 = buffer.toString('base64')
  const safeMimeType = (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp')
    ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp'
    : 'image/jpeg'

  const text = await extractWithVision(base64, safeMimeType)

  const profile: DocumentProfile = {
    mimeType, category: 'image', requiresVision: true, visionPageCount: 1, totalPages: 1
  }

  return {
    profile,
    contents: [{
      text,
      extractionMethod: 'vision',
      contentType: 'photo',
      sourcePage: null,
      sourceSheet: null,
      visionModel: 'gemini-2.5-flash',
    }]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer content type from vision extraction output text.
 * Used to tag PDF vision pages with a semantic content type.
 */
function inferPdfPageContentType(
  visionText: string
): ExtractedContent['contentType'] {
  const lower = visionText.toLowerCase()
  if (lower.includes('slide') || lower.includes('presentation') || lower.includes('framework')) {
    return 'slide'
  }
  if (lower.includes('chart') || lower.includes('graph') || lower.includes('axis')) {
    return 'chart'
  }
  if (lower.includes('diagram') || lower.includes('flowchart') || lower.includes('org chart')) {
    return 'diagram'
  }
  if (lower.includes('photograph') || lower.includes('photo') || lower.includes('image of')) {
    return 'photo'
  }
  if (lower.includes('table') || lower.includes('form') || lower.includes('row') || lower.includes('column')) {
    return 'table'
  }
  return 'mixed'
}
