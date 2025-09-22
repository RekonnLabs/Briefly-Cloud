export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";
import { clampNext } from "@/app/lib/auth/utils";
import { OAUTH_ERROR_CODES } from "@/app/lib/auth/constants";
import { generateCorrelationId, logOAuthCallback, logSessionEvent, logSecurityEvent, logOAuthAuditTrail, logOAuthExchangeFailure, extractIpAddress, SECURITY_EVENT_TYPES } from "@/app/lib/auth/security-logger";

export async function GET(req: NextRequest) {
  // Get correlation ID from URL params or generate new one
  const correlationId = req.nextUrl.searchParams.get("correlationId") || generateCorrelationId();
  const code = req.nextUrl.searchParams.get("code");
  const userAgent = req.headers.get("user-agent") || undefined;
  const ipAddress = extractIpAddress(req.headers);
  
  // Validate auth code
  if (!code) {
    logSecurityEvent({
      correlationId,
      eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
      errorCode: OAUTH_ERROR_CODES.MISSING_AUTH_CODE,
      userAgent,
      metadata: { action: 'oauth_callback_validation' }
    });
    return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.MISSING_AUTH_CODE}&correlationId=${correlationId}`, req.url));
  }

  const next = clampNext(req.nextUrl.searchParams.get("next"), correlationId);

  const res = new NextResponse(null);
  const supabase = getSupabaseServerMutable(req, res);

  try {
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    const headers = res.headers;

    if (error) {
      // Log callback failure with comprehensive audit trail
      logOAuthCallback(correlationId, 'unknown', false, OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED);
      logSessionEvent(correlationId, false, OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED);
      logOAuthExchangeFailure(correlationId, 'unknown', {
        hasCode: !!code,
        supabaseError: error.message,
        ipAddress,
        userAgent
      });
      
      logOAuthAuditTrail(correlationId, 'failure', {
        provider: 'unknown',
        ipAddress,
        userAgent,
        errorCode: OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED,
        errorMessage: error.message,
        metadata: { 
          exchangeFailure: true,
          supabaseError: error.message,
          hasCode: !!code
        }
      });

      return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED}&correlationId=${correlationId}`, req.url), { headers });
    }

    // Log successful callback and session creation with comprehensive audit trail
    const provider = data?.user?.app_metadata?.provider || 'unknown';
    logOAuthCallback(correlationId, provider, true);
    logSessionEvent(correlationId, true);

    logOAuthAuditTrail(correlationId, 'success', {
      provider,
      userId: data?.user?.id,
      userEmail: data?.user?.email,
      ipAddress,
      userAgent,
      redirectUrl: next,
      metadata: { 
        oauthSuccess: true,
        sessionCreated: true,
        userMetadata: {
          emailVerified: data?.user?.email_confirmed_at ? true : false,
          lastSignIn: data?.user?.last_sign_in_at,
          createdAt: data?.user?.created_at
        }
      }
    });

    // Redirect to the original intended path
    const dest = new URL(next, req.url);
    return NextResponse.redirect(dest, { headers });

  } catch (error) {
    // Log unexpected error
    logOAuthCallback(correlationId, 'unknown', false, OAUTH_ERROR_CODES.UNKNOWN_ERROR);
    logSessionEvent(correlationId, false, OAUTH_ERROR_CODES.UNKNOWN_ERROR);
    
    logSecurityEvent({
      correlationId,
      eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
      errorCode: OAUTH_ERROR_CODES.UNKNOWN_ERROR,
      userAgent,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      metadata: { 
        action: 'oauth_callback_exception',
        errorType: error instanceof Error ? error.constructor.name : 'unknown',
        hasCode: !!code
      }
    });

    const headers = res.headers;
    return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.UNKNOWN_ERROR}&correlationId=${correlationId}`, req.url), { headers });
  }
}
