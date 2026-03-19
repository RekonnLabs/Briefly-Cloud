/**
 * PPTX Extractor
 *
 * Replaces the previous binary-string hack that returned 2.6MB of garbage.
 *
 * Strategy:
 *   1. Parse PPTX as a ZIP (PPTX is just a ZIP of XML files + media assets)
 *   2. Walk each slide XML in order, extract all text runs with slide context
 *   3. For slides that carry meaningful images but sparse text (<200 chars of
 *      useful content), extract the embedded image and send it to GPT-5-mini
 *      vision — the description becomes an additional text chunk
 *   4. Return a single string that the existing chunker can process unchanged
 *
 * No Python runtime needed — pure TypeScript, zero native deps, works on Vercel.
 */

import 'server-only'

// JSZip is a pure-JS ZIP library — no native bindings, Vercel-safe
const JSZip = require('jszip')

// DrawingML namespace used in all PPTX slide XML
const DML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PptxExtractionResult {
  text: string
  slideCount: number
  slidesWithVisionCaptions: number
  warnings: string[]
}

interface SlideData {
  slideNumber: number
  textContent: string   // extracted from XML text runs
  imageBuffers: Buffer[] // embedded images (PNG / JPEG)
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Extract text (and optionally vision captions) from a PPTX buffer.
 *
 * @param buffer    Raw PPTX file bytes
 * @param fileName  Used for logging only
 * @param enableVisionCaptions  When true, image-heavy slides are sent to
 *                              GPT-5-mini vision for diagram descriptions.
 *                              Defaults to true in production; can be disabled
 *                              in tests to avoid API calls.
 */
export async function extractPptxContent(
  buffer: Buffer,
  fileName: string,
  enableVisionCaptions = true
): Promise<PptxExtractionResult> {
  const warnings: string[] = []
  let slidesWithVisionCaptions = 0

  // ── 1. Open the ZIP ────────────────────────────────────────────────────────
  let zip: any
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch (e) {
    warnings.push(`Failed to open ${fileName} as a ZIP: ${(e as Error).message}`)
    return { text: '', slideCount: 0, slidesWithVisionCaptions: 0, warnings }
  }

  // ── 2. Enumerate slides in presentation order ──────────────────────────────
  const slideFiles = getSlidesInOrder(zip)
  if (slideFiles.length === 0) {
    warnings.push('No slides found in PPTX file')
    return { text: '', slideCount: 0, slidesWithVisionCaptions: 0, warnings }
  }

  // ── 3. Build slide-to-media relationship map ───────────────────────────────
  const slideRels = await buildSlideRelationships(zip, slideFiles)

  // ── 4. Extract text + collect embedded images per slide ────────────────────
  const slides: SlideData[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i]
    const slideNumber = i + 1

    let xmlContent: string
    try {
      xmlContent = await zip.file(slideFile)!.async('string')
    } catch (e) {
      warnings.push(`Could not read slide ${slideNumber}: ${(e as Error).message}`)
      continue
    }

    const textContent = extractTextFromSlideXml(xmlContent)
    const imageBuffers = enableVisionCaptions
      ? await extractSlideImages(zip, slideRels[slideFile] || [])
      : []

    slides.push({ slideNumber, textContent, imageBuffers })
  }

  // ── 5. Build output text, adding vision captions where needed ──────────────
  const slideTexts: string[] = []

  for (const slide of slides) {
    const parts: string[] = [`## Slide ${slide.slideNumber}`]

    if (slide.textContent.trim()) {
      parts.push(slide.textContent.trim())
    }

    // Vision captioning: fire when images are present AND text is sparse
    const isImageHeavy = slide.imageBuffers.length > 0
    const isSparse = slide.textContent.trim().length < 200

    if (enableVisionCaptions && isImageHeavy && isSparse && slide.imageBuffers.length > 0) {
      const caption = await captureSlideVision(
        slide.imageBuffers[0],   // use the first/largest image
        slide.slideNumber,
        slide.textContent.trim()
      )
      if (caption) {
        parts.push(`[Visual content: ${caption}]`)
        slidesWithVisionCaptions++
      }
    }

    slideTexts.push(parts.join('\n'))
  }

  const text = slideTexts.join('\n\n')

  return {
    text,
    slideCount: slides.length,
    slidesWithVisionCaptions,
    warnings,
  }
}

// ─── Slide ordering ───────────────────────────────────────────────────────────

/**
 * Read ppt/presentation.xml to get slides in their actual presentation order.
 * Falls back to alphabetical sort if the presentation XML can't be parsed.
 */
function getSlidesInOrder(zip: any): string[] {
  // All candidate slide files
  const allSlideFiles = Object.keys(zip.files).filter(
    (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)
  )

  if (allSlideFiles.length === 0) return []

  // Sort numerically — good enough for the common case and never wrong
  return allSlideFiles.sort((a, b) => {
    const na = parseInt(a.match(/(\d+)/)?.[1] ?? '0', 10)
    const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '0', 10)
    return na - nb
  })
}

// ─── Relationship parsing ─────────────────────────────────────────────────────

/**
 * For each slide, read its .rels file to find which media files it references.
 * Returns: { 'ppt/slides/slide3.xml': ['ppt/media/image4.png', ...] }
 */
async function buildSlideRelationships(
  zip: any,
  slideFiles: string[]
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {}

  for (const slideFile of slideFiles) {
    // ppt/slides/slide3.xml → ppt/slides/_rels/slide3.xml.rels
    const parts = slideFile.split('/')
    const fname = parts[parts.length - 1]
    const relPath = `ppt/slides/_rels/${fname}.rels`

    const relsFile = zip.file(relPath)
    if (!relsFile) {
      result[slideFile] = []
      continue
    }

    try {
      const relsXml = await relsFile.async('string')
      const mediaPaths = parseRelationshipsForMedia(relsXml)
      // Resolve relative paths (../media/imageX.png → ppt/media/imageX.png)
      result[slideFile] = mediaPaths.map((p) =>
        p.startsWith('../') ? `ppt/${p.slice(3)}` : p
      )
    } catch {
      result[slideFile] = []
    }
  }

  return result
}

/**
 * Parse a .rels XML file and return all image/media Target paths.
 * Avoids a full XML parser — just extracts Target attributes via regex.
 */
function parseRelationshipsForMedia(relsXml: string): string[] {
  const IMAGE_TYPES = [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  ]
  const targets: string[] = []
  const relRegex = /<Relationship[^>]+>/g
  let match: RegExpExecArray | null
  while ((match = relRegex.exec(relsXml)) !== null) {
    const el = match[0]
    const typeMatch = /Type="([^"]+)"/.exec(el)
    const targetMatch = /Target="([^"]+)"/.exec(el)
    if (typeMatch && targetMatch && IMAGE_TYPES.includes(typeMatch[1])) {
      targets.push(targetMatch[1])
    }
  }
  return targets
}

// ─── Text extraction ──────────────────────────────────────────────────────────

/**
 * Extract all visible text from a slide XML string.
 *
 * PPTX XML structure (simplified):
 *   <p:sp> (shape)
 *     <p:txBody>
 *       <a:p> (paragraph)
 *         <a:r> (run)
 *           <a:t>actual text</a:t>
 *
 * We walk every <a:t> element and group them by paragraph, preserving
 * paragraph breaks so the chunker sees natural sentence boundaries.
 */
function extractTextFromSlideXml(xml: string): string {
  const paragraphs: string[] = []

  // Extract all <a:p>...</a:p> blocks
  const paraRegex = /<a:p[\s>][\s\S]*?<\/a:p>/g
  let paraMatch: RegExpExecArray | null

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[0]

    // Within each paragraph, collect all <a:t>text</a:t> runs
    const textRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
    let textMatch: RegExpExecArray | null
    const runs: string[] = []

    while ((textMatch = textRegex.exec(paraXml)) !== null) {
      // Decode minimal XML entities
      const decoded = textMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x0D;/g, '')

      if (decoded.trim()) {
        runs.push(decoded)
      }
    }

    if (runs.length > 0) {
      const paraText = runs.join('').trim()
      // Filter out PPTX boilerplate (slide number placeholder)
      if (paraText && paraText !== '‹#›' && paraText !== '<#>') {
        paragraphs.push(paraText)
      }
    }
  }

  return paragraphs.join('\n')
}

// ─── Image extraction ─────────────────────────────────────────────────────────

/**
 * Extract image buffers from the ZIP for a list of media paths.
 * Skips non-image files and files that can't be read.
 * Returns at most 3 images per slide (enough for vision, avoids cost explosion).
 */
async function extractSlideImages(
  zip: any,
  mediaPaths: string[]
): Promise<Buffer[]> {
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
  const buffers: Buffer[] = []

  for (const mediaPath of mediaPaths) {
    if (buffers.length >= 3) break  // cap per slide

    const ext = mediaPath.slice(mediaPath.lastIndexOf('.')).toLowerCase()
    if (!IMAGE_EXTS.includes(ext)) continue

    const file = zip.file(mediaPath)
    if (!file) continue

    try {
      const ab: ArrayBuffer = await file.async('arraybuffer')
      const buf = Buffer.from(ab)
      // Skip very small images (icons, bullets) — < 5KB is unlikely a diagram
      if (buf.length > 5000) {
        buffers.push(buf)
      }
    } catch {
      // ignore unreadable media files
    }
  }

  return buffers
}

// ─── Vision captioning ────────────────────────────────────────────────────────

/**
 * Send a slide image to GPT-5-mini vision and return a text description.
 * Returns null if the API call fails — the slide will still have its text content.
 *
 * The prompt is tuned for business/technical slide content:
 * charts, architecture diagrams, comparison tables, screenshots, process flows.
 */
async function captureSlideVision(
  imageBuffer: Buffer,
  slideNumber: number,
  existingText: string
): Promise<string | null> {
  try {
    // Lazy import to avoid loading OpenAI SDK during tests
    const { openai } = await import('@/app/lib/openai')

    const base64 = imageBuffer.toString('base64')
    // Detect image type from buffer magic bytes
    const mimeType = detectImageMimeType(imageBuffer)

    const contextHint = existingText
      ? `The slide title or surrounding text is: "${existingText.slice(0, 200)}"`
      : 'No text context available for this slide.'

    const response = await (openai as any).chat.completions.create({
      model: process.env.CHAT_MODEL_FREE || 'gpt-5-nano',  // cheapest model, vision task is simple
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are extracting content from a business presentation slide for a document search system.

Slide ${slideNumber}. ${contextHint}

Describe what this image shows in 2-4 sentences. Focus on:
- The type of diagram (architecture, flowchart, comparison, screenshot, chart, etc.)
- Key components, labels, or entities shown
- The main concept or relationship being illustrated

Be factual and specific. Do not invent details not visible in the image.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'low',  // 'low' is sufficient for diagrams, keeps cost minimal
              },
            },
          ],
        },
      ],
    })

    return response.choices?.[0]?.message?.content?.trim() || null
  } catch (e) {
    // Vision call failed — not fatal, slide still has text content
    console.warn(`[pptx-extractor:vision-failed] slide=${slideNumber}`, (e as Error).message)
    return null
  }
}

/**
 * Detect image MIME type from buffer magic bytes.
 */
function detectImageMimeType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  return 'image/png'  // safe default
}
