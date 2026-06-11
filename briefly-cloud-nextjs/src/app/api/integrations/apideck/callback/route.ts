// @ts-nocheck — legacy route pending consolidation
import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { Apideck, mapServiceIdToProvider, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { retryDatabaseOperation, retryApiCall, RetryError } from '@/app/lib/retry';
import { captureApiError, capturePerformanceMetric, getErrorMonitoring } from '@/app/lib/error-monitoring';
import { createError, AppError } from '@/app/lib/api-errors';
import { 
  createCallbackLogger, 
  summarizeConnections,
  type CallbackProcessingStats,
  type ApideckCallbackLogger 
} from '@/app/lib/integrations/apideck-callback-logger';

// Enhanced connection processing with retry logic and error categorization
interface ConnectionUpsertParams {
  user: string;
  provider: string;
  consumer: string;
  conn: string;
  status: string;
}

interface ConnectionProcessingResult {
  success: boolean;
  error?: AppError;
  retryable: boolean;
}

const categorizeError = (error: any): { category: string; retryable: boolean; userMessage: string } => {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorCode = error?.code || '';

  // Database permission errors
  if (errorCode === '42501' || errorMessage.includes('permission denied')) {
    return {
      category: 'permission_denied',
      retryable: false,
      userMessage: 'Database permission error. Please contact support.'
    };
  }

  // Connection timeout or network errors
  if (errorMessage.includes('timeout') || errorMessage.includes('network') || errorMessage.includes('connection')) {
    return {
      category: 'network_error',
      retryable: true,
      userMessage: 'Network connection issue. Retrying...'
    };
  }

  // Database constraint violations
  if (errorCode.startsWith('23') || errorMessage.includes('constraint')) {
    return {
      category: 'constraint_violation',
      retryable: false,
      userMessage: 'Data validation error. Please try reconnecting.'
    };
  }

  // Rate limiting
  if (errorMessage.includes('rate limit') || errorCode === '429') {
    return {
      category: 'rate_limited',
      retryable: true,
      userMessage: 'Service temporarily busy. Retrying...'
    };
  }

  // Default to retryable for unknown errors
  return {
    category: 'unknown_error',
    retryable: true,
    userMessage: 'Temporary error occurred. Retrying...'
  };
};

const upsertConnection = async (
  params: ConnectionUpsertParams, 
  logger: ApideckCallbackLogger
): Promise<ConnectionProcessingResult> => {
  const startTime = Date.now();
  
  // Log database operation start
  logger.logDatabaseOperation('start', {
    provider: params.provider,
    connectionId: params.conn,
    status: params.status,
    startTime
  });

  try {
    // Retry database operation with exponential backoff
    await retryDatabaseOperation(async () => {
      const { error } = await supabaseAdmin.from('apideck_connections').upsert({
        user_id: params.user,
        provider: params.provider,
        consumer_id: params.consumer,
        connection_id: params.conn,
        status: 'connected',  // Normalize to 'connected' for consistent health checks
        updated_at: new Date().toISOString()
      });

      if (error) {
        const errorCategory = categorizeError(error);
        
        // Log database error with detailed context
        logger.logDatabaseOperation('error', {
          provider: params.provider,
          connectionId: params.conn,
          error: error.message,
          code: error.code,
          details: error.details,
          category: errorCategory.category,
          retryable: errorCategory.retryable,
          startTime
        });

        // Capture error for monitoring
        captureApiError(
          new Error(`Database upsert failed: ${error.message}`),
          'apideck-callback-upsert',
          params.user,
          logger.getMetrics().toString()
        );

        throw error;
      }
    }, {
      maxAttempts: 3,
      baseDelay: 500,
      onRetry: (attempt, error, delay) => {
        // Log retry attempt with comprehensive details
        logger.logDatabaseOperation('retry', {
          provider: params.provider,
          connectionId: params.conn,
          attempt,
          error: error.message,
          nextRetryIn: delay,
          totalAttempts: 3,
          startTime
        });
      }
    });

    // Log successful database operation
    logger.logDatabaseOperation('success', {
      provider: params.provider,
      connectionId: params.conn,
      status: params.status,
      startTime
    });

    return { success: true, retryable: false };

  } catch (error) {
    const errorCategory = categorizeError(error);

    // Plain console.error so the failure is immediately visible in Vercel logs
    // without needing to decode structured log objects.
    console.error('[apideck:upsertConnection:FAILED]', {
      provider: params.provider,
      connectionId: params.conn,
      userId: params.user,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      details: (error as any)?.details,
      category: errorCategory.category,
      retryable: errorCategory.retryable
    });

    // Log final failure
    logger.logDatabaseOperation('error', {
      provider: params.provider,
      connectionId: params.conn,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      category: errorCategory.category,
      retryable: errorCategory.retryable,
      startTime,
      finalFailure: true
    });

    // Create appropriate error based on category
    let appError: AppError;
    if (errorCategory.category === 'permission_denied') {
      appError = createError.supabaseError('Database permission denied', error);
    } else if (errorCategory.category === 'constraint_violation') {
      appError = createError.validation('Invalid connection data', error);
    } else if (errorCategory.category === 'rate_limited') {
      appError = createError.rateLimitExceeded('Database rate limit exceeded');
    } else {
      appError = createError.databaseError('Connection storage failed', error as Error);
    }

    return {
      success: false,
      error: appError,
      retryable: errorCategory.retryable
    };
  }
};

const handler = async (_req: Request, ctx: ApiContext) => {
  // Extract provider from the state param Apideck echoes back in the callback URL.
  // Fall back to 'google' so existing Google Drive flows are unaffected.
  const callbackUrl = new URL(_req.url);
  const stateParam = callbackUrl.searchParams.get('state') ?? '';
  const providerFromState = stateParam.includes('microsoft') || stateParam.includes('onedrive')
    ? 'microsoft'
    : stateParam.includes('dropbox')
    ? 'dropbox'
    : 'google';
  const base = new URL(`/auth/oauth-complete?provider=${providerFromState}`, process.env.NEXT_PUBLIC_SITE_URL!).toString();
  
  // Initialize comprehensive logging
  const logger = createCallbackLogger({
    userId: ctx.user?.id,
    correlationId: ctx.correlationId,
    operation: 'oauth_callback'
  });

  // Log callback initiation with environment details
  logger.logCallbackStart({
    hasUser: !!ctx.user,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    apideckEnabled: isApideckEnabled(),
    userAgent: _req.headers.get('user-agent'),
    referer: _req.headers.get('referer')
  });
  
  // Validate Apideck service availability
  if (!isApideckEnabled()) {
    logger.logRedirectDecision('failure', 'Apideck integration disabled', base + '&error=service_disabled');
    return NextResponse.redirect(base + '&error=service_disabled');
  }
  
  // Validate user authentication
  logger.logAuthValidation(!!ctx.user, {
    hasUserId: !!ctx.user?.id,
    hasCorrelationId: !!ctx.correlationId
  });

  if (!ctx.user) {
    logger.logRedirectDecision('failure', 'No authenticated user', '/auth/signin?error=auth_required');
    captureApiError(
      new Error('OAuth callback accessed without authentication'),
      'apideck-callback-auth',
      undefined,
      ctx.correlationId
    );
    return NextResponse.redirect(new URL('/auth/signin?error=auth_required', process.env.NEXT_PUBLIC_SITE_URL!).toString());
  }

  // Initialize processing statistics
  const processingStats: CallbackProcessingStats = {
    totalConnections: 0,
    successfulConnections: 0,
    failedConnections: 0,
    retryableFailures: 0,
    nonRetryableFailures: 0,
    averageProcessingTime: 0,
    errors: []
  };

  const connectionProcessingTimes: number[] = [];

  try {
    // Fetch connections from Apideck with comprehensive logging
    logger.logApiCallStart('listConnections');
    
    const json = await retryApiCall(async () => {
      const response = await Apideck.listConnections(ctx.user!.id);
      logger.logApiCallComplete(response);
      return response;
    }, {
      maxAttempts: 3,
      baseDelay: 1000,
      onRetry: (attempt, error, delay) => {
        logger.logApiRetry(attempt, error, delay);
      }
    }) as any;

    const connections = json?.data ?? [];
    processingStats.totalConnections = connections.length;

    // If Apideck returns an empty list, the connection may not have propagated yet.
    // Upsert a placeholder row so the UI reflects the connection immediately.
    // A subsequent health check will update the real connection_id.
    if (connections.length === 0) {
      console.warn('[apideck:callback:get] listConnections returned empty — upserting placeholder for', providerFromState);
      const placeholderResult = await upsertConnection({
        user: ctx.user.id,
        provider: providerFromState,
        consumer: ctx.user.id,
        conn: `pending-${ctx.user.id}-${Date.now()}`,
        status: 'connected'
      }, logger.createChildLogger({ provider: providerFromState, connectionId: 'pending' }));
      if (placeholderResult.success) {
        logger.logRedirectDecision('success', 'Placeholder upserted for empty connection list', base + '&connected=1');
        return NextResponse.redirect(base + '&connected=1');
      } else {
        logger.logRedirectDecision('failure', 'Placeholder upsert failed', base + '&error=connection_failed');
        return NextResponse.redirect(base + '&error=connection_failed');
      }
    }

    // Log connection summary
    const connectionSummary = summarizeConnections(connections);
    logger.logConnectionProcessingStart(connections);
    
    console.log('[apideck:callback:connection-summary]', {
      userId: ctx.user.id,
      correlationId: ctx.correlationId,
      summary: connectionSummary
    });

    // Only process the connection matching the provider the user just authorized.
    // Apideck returns ALL connections in the vault on every callback — without this
    // filter, connecting Google Drive also upserts a phantom OneDrive row (and vice
    // versa) because previously-authorized connections are returned as 'callable'.
    const connectionsToProcess = connections.filter(
      c => c.service_id && mapServiceIdToProvider(c.service_id) === providerFromState
    );
    if (connectionsToProcess.length === 0) {
      console.warn('[apideck:callback:get] No connections matched provider', providerFromState, '— falling back to placeholder');
      await upsertConnection({
        user: ctx.user.id,
        provider: providerFromState,
        consumer: ctx.user.id,
        conn: 'pending',
        status: 'pending'
      }, logger.createChildLogger({ provider: providerFromState, connectionId: 'pending' }));
      return Response.redirect(`${base}&connected=1`);
    }

    // Process each connection with detailed logging
    for (const connection of connectionsToProcess) {
      const connectionStartTime = Date.now();
      
      // Use connection.id (UUID) not connection.connection_id (service string like
      // "google-drive") — the UUID is what the Apideck API requires for file listing.
      if (!connection?.id || !connection?.service_id) {
        logger.logConnectionProcessing(connection, 'unknown', 'error', {
          message: 'Missing required connection fields',
          category: 'invalid_connection',
          hasConnectionId: !!connection?.id,
          hasServiceId: !!connection?.service_id
        });
        
        processingStats.failedConnections++;
        processingStats.nonRetryableFailures++;
        processingStats.errors.push({
          connection,
          error: 'Missing required connection fields',
          category: 'invalid_connection',
          retryable: false
        });
        continue;
      }

      // Only upsert connections that are in a callable state — skip authorised-but-not-callable
      // rows (e.g. state === 'authorized' but health !== 'ok') to avoid writing phantom connections.
      const isCallable = connection.state === 'callable' || connection.health === 'ok';
      if (!isCallable) {
        logger.logConnectionProcessing(connection, mapServiceIdToProvider(connection.service_id), 'error', {
          message: 'Connection not callable — skipping upsert',
          category: 'not_callable',
          state: connection.state,
          health: connection.health
        });
        processingStats.failedConnections++;
        processingStats.nonRetryableFailures++;
        processingStats.errors.push({
          connection,
          error: `Connection not callable (state=${connection.state}, health=${connection.health})`,
          category: 'not_callable',
          retryable: false
        });
        continue;
      }
      
      const provider = mapServiceIdToProvider(connection.service_id);
      
      // Log connection processing start
      logger.logConnectionProcessing(connection, provider, 'start');
      
      // Process connection with enhanced error handling
      const result = await upsertConnection({
        user: ctx.user.id,
        provider,
        consumer: ctx.user.id,
        conn: connection.id,          // UUID — required by Apideck file listing API
        status: 'connected'           // only callable connections reach this point
      }, logger.createChildLogger({ provider, connectionId: connection.id }));

      const connectionDuration = Date.now() - connectionStartTime;
      connectionProcessingTimes.push(connectionDuration);

      if (result.success) {
        processingStats.successfulConnections++;
        logger.logConnectionProcessing(connection, provider, 'success');
      } else {
        processingStats.failedConnections++;
        
        if (result.retryable) {
          processingStats.retryableFailures++;
        } else {
          processingStats.nonRetryableFailures++;
        }
        
        processingStats.errors.push({
          connection,
          error: result.error?.message || 'Unknown error',
          category: result.error?.code || 'unknown',
          retryable: result.retryable
        });

        logger.logConnectionProcessing(connection, provider, 'error', result.error);
      }
    }

    // Calculate average processing time
    processingStats.averageProcessingTime = connectionProcessingTimes.length > 0 
      ? connectionProcessingTimes.reduce((sum, time) => sum + time, 0) / connectionProcessingTimes.length 
      : 0;

    // Log comprehensive processing completion
    logger.logProcessingComplete(processingStats);

    // Determine redirect based on results with detailed logging
    if (processingStats.failedConnections === 0) {
      // Complete success
      logger.logRedirectDecision('success', 'All connections processed successfully', base + '&connected=1');
      return NextResponse.redirect(base + '&connected=1');
    } else if (processingStats.successfulConnections > 0) {
      // Partial success
      const reason = `${processingStats.successfulConnections}/${processingStats.totalConnections} connections processed`;
      logger.logRedirectDecision('partial_success', reason, base + '&connected=1&partial=1');
      return NextResponse.redirect(base + '&connected=1&partial=1');
    } else {
      // Complete failure
      const reason = `All ${processingStats.totalConnections} connections failed to process`;
      const hasRetryableErrors = processingStats.retryableFailures > 0;
      const errorParam = hasRetryableErrors ? 'temporary_error' : 'connection_failed';
      const redirectUrl = base + `&error=${errorParam}`;
      
      logger.logRedirectDecision('failure', reason, redirectUrl);
      return NextResponse.redirect(redirectUrl);
    }

  } catch (error) {
    // Log unexpected error with full context
    logger.logUnexpectedError(
      error instanceof Error ? error : new Error('Unknown callback error'),
      'callback_processing'
    );

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error('Unknown callback error'),
      'apideck-callback-unexpected',
      ctx.user.id,
      ctx.correlationId
    );

    // Determine if error might be retryable
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    const isRetryable = errorMessage.includes('timeout') || 
                       errorMessage.includes('network') || 
                       errorMessage.includes('temporary');

    const errorParam = isRetryable ? 'temporary_error' : 'callback_failed';
    const redirectUrl = base + `&error=${errorParam}`;
    
    logger.logRedirectDecision('failure', `Unexpected error: ${errorMessage}`, redirectUrl);
    return NextResponse.redirect(redirectUrl);
  }
};

export const GET = createProtectedApiHandler(handler);

// POST handler: called inline by useVault's onConnectionChange.
// Runs the same connection-persistence logic but returns JSON instead of
// redirecting, so the user stays on the dashboard.
const postHandler = async (req: Request, ctx: ApiContext) => {
  if (!isApideckEnabled()) {
    return NextResponse.json({ error: 'Apideck integration disabled' }, { status: 503 });
  }

  if (!ctx.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logger = createCallbackLogger({
    userId: ctx.user.id,
    correlationId: ctx.correlationId,
    operation: 'oauth_callback_post'
  });

  try {
    const json = await retryApiCall(async () => {
      const response = await Apideck.listConnections(ctx.user!.id);
      logger.logApiCallComplete(response);
      return response;
    }, {
      maxAttempts: 3,
      baseDelay: 1000,
      onRetry: (attempt, error, delay) => {
        logger.logApiRetry(attempt, error, delay);
      }
    }) as any;

    const connections = json?.data ?? [];
    let successCount = 0;

    if (connections.length === 0) {
      // Apideck returned an empty list — connection may not have propagated yet.
      // Upsert a placeholder 'connected' row so the UI reflects the connection
      // immediately. A subsequent health check will update the real connection_id.
      // Extract provider from state param so Microsoft/Dropbox users get the right
      // placeholder instead of a hardcoded 'google' row.
      const postStateParam = (() => {
        try { return new URL(req.url).searchParams.get('state') ?? ''; } catch { return ''; }
      })();
      const postProvider = postStateParam.includes('microsoft') || postStateParam.includes('onedrive')
        ? 'microsoft'
        : postStateParam.includes('dropbox')
        ? 'dropbox'
        : 'google';
      console.warn('[apideck:callback:post] listConnections returned empty — upserting placeholder for', postProvider);
      const placeholderResult = await upsertConnection({
        user: ctx.user.id,
        provider: postProvider,
        consumer: ctx.user.id,
        conn: `pending-${ctx.user.id}-${Date.now()}`,
        status: 'connected'
      }, logger.createChildLogger({ provider: postProvider, connectionId: 'pending' }));
      if (placeholderResult.success) successCount++;
    } else {
      for (const connection of connections) {
        if (!connection?.id || !connection?.service_id) continue;

        const provider = mapServiceIdToProvider(connection.service_id);
        const connStatus = connection.health === 'ok' ? 'connected' : connection.health ?? 'connected';
        const result = await upsertConnection({
          user: ctx.user.id,
          provider,
          consumer: ctx.user.id,
          conn: connection.id,
          status: connStatus
        }, logger.createChildLogger({ provider, connectionId: connection.id }));

        if (result.success) successCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      connectionsProcessed: connections.length,
      successCount
    });

  } catch (error) {
    captureApiError(
      error instanceof Error ? error : new Error('Unknown callback error'),
      'apideck-callback-post',
      ctx.user.id,
      ctx.correlationId
    );
    return NextResponse.json({ error: 'Failed to process connections' }, { status: 500 });
  }
};

export const POST = createProtectedApiHandler(postHandler);