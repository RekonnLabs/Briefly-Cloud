/**
 * GET /api/cron/process-vision
 *
 * Cron worker — processes vision pages from app.vision_queue.
 * Runs every 60 seconds via Vercel Cron.
 *
 * Each invocation:
 *   1. Picks up the oldest 'pending' row (or stale 'processing' row > 5 min)
 *   2. Downloads the PDF from Supabase Storage
 *   3. Uploads to Gemini Files API
 *   4. Processes one batch of VISION_BATCH_SIZE pages
 *   5. Writes vision chunks to document_chunks
 *   6. Updates next_batch_start — if more pages remain, sets status back to 'pending'
 *   7. If all pages done, sets status to 'completed'
 *
 * Self-healing: stale rows (processing > 5 min) are picked up again.
 * Natural rate limiting: one file per cron tick.
 * Max attempts: 5 — after that, status = 'failed'.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'

const VISION_BATCH_SIZE = parseInt(process.env.VISION_BATCH_SIZE ?? '15', 10)
const MAX_ATTEMPTS = 5
const STALE_THRESHOLD_MINUTES = 5
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ── 1. Pick up the next job ──────────────────────────────────────────────
    // Priority: pending (FIFO), then stale processing rows (self-healing)
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString()

    const { data: job, error: fetchError } = await supabaseAdmin
      .schema('app')
      .from('vision_queue')
      .select('*')
      .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${staleThreshold})`)
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (fetchError || !job) {
      // No work to do — normal state
      return NextResponse.json({ status: 'idle', message: 'No pending vision jobs' })
    }

    logger.info('[cron:vision:start]', {
      jobId: job.id,
      fileId: job.file_id,
      fileName: job.file_name,
      totalVisionPages: job.vision_page_indices.length,
      nextBatchStart: job.next_batch_start,
      attempt: job.attempts + 1,
    })

    // ── 2. Claim the job (set to processing + increment attempts) ────────────
    const newAttempts = job.attempts + 1
    await supabaseAdmin
      .schema('app')
      .from('vision_queue')
      .update({
        status: 'processing',
        attempts: newAttempts,
      })
      .eq('id', job.id)

    // ── 2b. If this attempt exhausts the retry budget, fail permanently ─────
    // This prevents zombie jobs that are picked up, incremented, but never
    // reach the success path — they silently stop being selected by the
    // .lt('attempts', MAX_ATTEMPTS) filter without a visible failure state.
    if (newAttempts >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .schema('app')
        .from('vision_queue')
        .update({
          status: 'failed',
          error_msg: `Exhausted ${MAX_ATTEMPTS} attempts — last batch_start: ${job.next_batch_start}`,
        })
        .eq('id', job.id)

      logger.error('[cron:vision:max-attempts-reached]', {
        jobId: job.id,
        fileId: job.file_id,
        attempts: newAttempts,
        lastBatchStart: job.next_batch_start,
      })

      return NextResponse.json({
        status: 'failed',
        fileId: job.file_id,
        message: `Max attempts (${MAX_ATTEMPTS}) reached — marked as failed`,
      })
    }

    // ── 3. Determine which pages to process this tick ────────────────────────
    const allVisionPages: number[] = job.vision_page_indices
    const batchStart = job.next_batch_start
    const batchPages = allVisionPages.slice(batchStart, batchStart + VISION_BATCH_SIZE)

    if (batchPages.length === 0) {
      // All pages already processed — mark completed
      await supabaseAdmin
        .schema('app')
        .from('vision_queue')
        .update({ status: 'completed' })
        .eq('id', job.id)
      return NextResponse.json({ status: 'completed', fileId: job.file_id })
    }

    // ── 4. Download PDF from Supabase Storage ────────────────────────────────
    const { data: blobData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(job.storage_path)

    if (downloadError || !blobData) {
      logger.error('[cron:vision:download-failed]', {
        jobId: job.id,
        fileId: job.file_id,
        error: downloadError?.message,
      })
      // Set back to pending for retry on next tick
      await supabaseAdmin
        .schema('app')
        .from('vision_queue')
        .update({ status: 'pending', error_msg: `Download failed: ${downloadError?.message}` })
        .eq('id', job.id)
      return NextResponse.json({ status: 'error', message: 'Download failed' }, { status: 500 })
    }

    const fileBuffer = Buffer.from(await blobData.arrayBuffer())

    // ── 5. Run vision extraction for this batch ──────────────────────────────
    const { extractPdfVisionPages } = await import('@/app/lib/vision-extractor')
    const visionResults = await extractPdfVisionPages(fileBuffer, batchPages, job.file_name)

    logger.info('[cron:vision:batch-done]', {
      jobId: job.id,
      fileId: job.file_id,
      batchStart,
      pagesProcessed: batchPages.length,
      resultsReturned: visionResults.length,
    })

    // ── 6. Write vision chunks to document_chunks via processDocumentFromContents
    if (visionResults.length > 0) {
      const { processDocumentFromContents } = await import('@/app/lib/vector/document-processor')

      const contents = visionResults.map(r => ({
        text: r.text,
        extractionMethod: 'vision' as const,
        contentType: 'slide' as const,
        sourcePage: r.pageIndex,
        sourceSheet: null as string | null,
        visionModel: r.model,
      }))

      await processDocumentFromContents(
        job.owner_id,
        job.file_id,
        job.file_name,
        contents,
        {
          fileType: 'application/pdf',
          fileSize: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
          source: 'vision_queue',
          batchStart,
          batchSize: batchPages.length,
        },
        { appendOnly: true }
      )
    }

    // ── 7. Update queue row — advance or complete ────────────────────────────
    const newBatchStart = batchStart + VISION_BATCH_SIZE
    const isComplete = newBatchStart >= allVisionPages.length

    if (isComplete) {
      await supabaseAdmin
        .schema('app')
        .from('vision_queue')
        .update({
          status: 'completed',
          next_batch_start: allVisionPages.length,
        })
        .eq('id', job.id)

      logger.info('[cron:vision:file-complete]', {
        jobId: job.id,
        fileId: job.file_id,
        totalVisionChunks: allVisionPages.length,
      })
    } else {
      // More pages remain — set back to pending for next tick
      await supabaseAdmin
        .schema('app')
        .from('vision_queue')
        .update({
          status: 'pending',
          next_batch_start: newBatchStart,
          error_msg: null,
        })
        .eq('id', job.id)

      logger.info('[cron:vision:batch-queued-next]', {
        jobId: job.id,
        fileId: job.file_id,
        nextBatchStart: newBatchStart,
        remainingPages: allVisionPages.length - newBatchStart,
      })
    }

    return NextResponse.json({
      status: isComplete ? 'completed' : 'processing',
      fileId: job.file_id,
      pagesProcessed: batchPages.length,
      totalPages: allVisionPages.length,
      progress: `${Math.min(newBatchStart, allVisionPages.length)}/${allVisionPages.length}`,
    })

  } catch (error) {
    logger.error('[cron:vision:fatal]', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
