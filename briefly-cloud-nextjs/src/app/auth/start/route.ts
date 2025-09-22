export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";
import { clampNext } from "@/app/lib/auth/utils";
import { OAUTH_ERROR_CODES } from "@/app/lib/auth/constants";
import { generateCorrelationId, logOAuthStart, logSecurityEvent, logMissingProviderAttempt, logOAuthAuditTrail, extractIpAddress, SECURITY_EVENT_TYPES } from "@/app/lib/auth/security-logger";

export async function GET(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const provider = req.nextUrl.searchParams.get("provider");
  const userAgent = req.headers.get("user-agent") || undefined;
  const ipAddress = extractIpAddress(req.headers);
  
  // Validate provider
  if (!provider) {
    logMissingProviderAttempt(correlationId, ipAddress, userAgent);
    logOAuthAuditTrail(correlationId, 'failure', {
      provider: 'unknown',
      ipAddress,
      userAgent,
      errorCode: OAUTH_ERROR_CODES.MISSING_PROVIDER,
      metadata: { validationFailure: 'missing_provider' }
    });
    return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.MISSING_PROVIDER}&correlationId=${correlationId}`, req.url));
  }

  // Validate provider is supported
  const supportedProviders = ['google', 'azure'];
  if (!supportedProviders.includes(provider)) {
    logSecurityEvent({
      correlationId,
      eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
      errorCode: OAUTH_ERROR_CODES.INVALID_PROVIDER,
      provider,
      userAgent,
      metadata: { action: 'oauth_start_validation', attemptedProvider: provider }
    });
    return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.INVALID_PROVIDER}&correlationId=${correlationId}`, req.url));
  }

  const next = clampNext(req.nextUrl.searchParams.get("next"), correlationId);

  // Log OAuth start with comprehensive audit trail
  logOAuthStart(correlationId, provider, next, userAgent);
  logOAuthAuditTrail(correlationId, 'attempt', {
    provider,
    ipAddress,
    userAgent,
    redirectUrl: next,
    metadata: { oauthFlow: 'initiation' }
  });

  const res = new NextResponse(null);
  const supabase = getSupabaseServerMutable(req, res);

  // Hand the intended destination through the callback URL
  const redirectTo = new URL(`/auth/callback?next=${encodeURIComponent(next)}&correlationId=${correlationId}`, req.url).toString();

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: { redirectTo },
    });

    if (error || !data?.url) {
      logSecurityEvent({
        correlationId,
        eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
        errorCode: OAUTH_ERROR_CODES.OAUTH_START_FAILED,
        provider,
        userAgent,
        errorMessage: error?.message,
        metadata: { 
          action: 'oauth_start_supabase',
          hasData: !!data,
          hasUrl: !!data?.url,
          supabaseError: error?.message
        }
      });
      return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.OAUTH_START_FAILED}&correlationId=${correlationId}`, req.url), { headers: res.headers });
    }

    return NextResponse.redirect(data.url, { headers: res.headers });
  } catch (error) {
    logSecurityEvent({
      correlationId,
      eventType: SECURITY_EVENT_TYPES.OAUTH_ERROR,
      errorCode: OAUTH_ERROR_CODES.UNKNOWN_ERROR,
      provider,
      userAgent,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      metadata: { 
        action: 'oauth_start_exception',
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      }
    });
    return NextResponse.redirect(new URL(`/auth/signin?error=${OAUTH_ERROR_CODES.UNKNOWN_ERROR}&correlationId=${correlationId}`, req.url), { headers: res.headers });
  }
}
