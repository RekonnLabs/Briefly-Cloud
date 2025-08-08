/**
 * GDPR Data Cleanup Cron Job
 * 
 * Scheduled job for cleaning up expired data and maintaining GDPR compliance
 * This should be called by Vercel Cron or similar scheduling service
 */

import { NextRequest, NextResponse } from 'next/server';
import { gdprService } from '@/app/lib/gdpr-compliance';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { logger } from '@/app/lib/logger';

/**
 * POST /api/cron/gdpr-cleanup
 * Run GDPR compliance cleanup tasks
 */
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
      logger.warn('Unauthorized cron job attempt', {
        ip: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent')
      });
      return createErrorResponse('Unauthorized', 401);
    }

    logger.info('Starting GDPR cleanup job');

    // Run cleanup tasks
    await gdprService.cleanupExpiredData();

    // Additional cleanup tasks can be added here
    const cleanupResults = {
      expired_data_cleaned: true,
      timestamp: new Date().toISOString()
    };

    logger.info('GDPR cleanup job completed successfully', cleanupResults);

    return createApiResponse({
      message: 'GDPR cleanup completed successfully',
      results: cleanupResults
    });

  } catch (error) {
    logger.error('GDPR cleanup job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return createErrorResponse('Cleanup job failed', 500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/cron/gdpr-cleanup
 * Get status of last cleanup job (for monitoring)
 */
export async function GET(request: NextRequest) {
  try {
    // This could return status information about the last cleanup
    // For now, just return a simple status
    return createApiResponse({
      status: 'ready',
      last_run: 'Check logs for last execution time',
      next_run: 'Scheduled via Vercel Cron'
    });

  } catch (error) {
    return createErrorResponse('Failed to get cleanup status', 500);
  }
}