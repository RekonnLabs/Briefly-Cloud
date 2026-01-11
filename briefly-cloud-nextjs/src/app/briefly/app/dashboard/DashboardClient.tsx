"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { ChatInterface } from "@/app/components/ChatInterface";
import FileUpload from "@/app/components/FileUpload";
import { FileList } from "@/app/components/files/FileList";
import { CloudStorage } from "@/app/components/CloudStorage";
import { SubscriptionStatus } from "@/app/components/SubscriptionStatus";
import { QuotaStatus } from "@/app/components/QuotaStatus";
import { Sidebar } from "@/app/components/Sidebar";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import type { CompleteUserData, UserDataError } from "@/app/lib/user-data-types";
import { getUserDataErrorMessage, isValidUserData } from "@/app/lib/user-data-types";
import { useSignout } from "@/app/lib/auth/use-signout";
import DashboardLoading from "./DashboardLoading";

interface DashboardClientProps {
  user: User;
}

type ActiveTab = "chat" | "files" | "storage";

class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

const DASHBOARD_TABS: ActiveTab[] = ["chat", "files", "storage"];

function normalizeTab(value: string | null): ActiveTab {
  if (!value) return "chat";
  return DASHBOARD_TABS.includes(value as ActiveTab) ? (value as ActiveTab) : "chat";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.max(bytes, 0);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

async function fetchApiData<T = any>(url: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError();
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (json && Object.prototype.hasOwnProperty.call(json, "ok")) {
    if (!json.ok) {
      const message = json?.error?.message ?? `Request to ${url} failed`;
      const error = new Error(message);
      (error as any).code = json?.error?.code;
      throw error;
    }
    return json as T;
  }

  if (!response.ok) {
    const message = json?.error?.message ?? `Request to ${url} failed (${response.status})`;
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }

  if (json && json.success === false) {
    const message = json?.error?.message ?? `Request to ${url} failed`;
    throw new Error(message);
  }

  if (json && json.error && json.error !== null) {
    const message = json?.error?.message ?? `Request to ${url} failed`;
    throw new Error(message);
  }

  return json as T;
}

function mapToCompleteUserData(
  user: User,
  profilePayload: any,
  usagePayload?: any
): CompleteUserData {
  const profile = profilePayload?.profile ?? profilePayload ?? {};

  if (!profile) {
    throw new Error("Missing profile data");
  }

  const usageRoot = usagePayload?.current_usage
    ? usagePayload
    : usagePayload?.data ?? usagePayload ?? {};
  const tierLimits = usageRoot?.tier_limits ?? {};
  const currentUsage = usageRoot?.current_usage ?? {};
  const warnings = usageRoot?.warnings ?? profilePayload?.warnings;

  const chatUsage = currentUsage?.chat_messages ?? {};
  const documentsUsage = currentUsage?.documents ?? {};
  const apiUsage = currentUsage?.api_calls ?? {};
  const storageUsage = currentUsage?.storage ?? {};

  const createdAt = profile.created_at ?? user.created_at ?? new Date().toISOString();
  const updatedAt = profile.updated_at ?? profile.created_at ?? user.updated_at ?? createdAt;

  const usageStats: Record<string, unknown> = {
    ...(profilePayload?.usage_stats ?? {}),
    ...(Object.keys(currentUsage).length ? { current_usage: currentUsage } : {}),
    ...(warnings ? { warnings } : {}),
    ...(tierLimits ? { tier_limits: tierLimits } : {}),
  };

  return {
    id: profile.id ?? user.id,
    email: profile.email ?? user.email ?? "",
    name:
      profile.name ??
      profile.full_name ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      undefined,
    image: profile.image ?? user.user_metadata?.avatar_url ?? undefined,
    subscription_tier: profile.subscription_tier ?? usageRoot?.subscription_tier ?? "free",
    subscription_status: profile.subscription_status ?? "active",
    usage_count:
      profile.usage_count ??
      profile.chat_messages_count ??
      chatUsage.used ??
      0,
    usage_limit:
      profile.usage_limit ??
      profile.chat_messages_limit ??
      chatUsage.limit ??
      tierLimits?.chat_messages ??
      0,
    trial_end_date: profile.trial_end_date ?? undefined,
    created_at: createdAt,
    updated_at: updatedAt,
    full_name: profile.full_name ?? user.user_metadata?.full_name ?? undefined,
    chat_messages_count: profile.chat_messages_count ?? chatUsage.used ?? 0,
    chat_messages_limit:
      profile.chat_messages_limit ??
      chatUsage.limit ??
      tierLimits?.chat_messages ??
      0,
    documents_uploaded:
      profile.documents_uploaded ??
      documentsUsage.used ??
      0,
    documents_limit:
      profile.documents_limit ??
      documentsUsage.limit ??
      tierLimits?.documents ??
      0,
    api_calls_count: profile.api_calls_count ?? apiUsage.used ?? 0,
    api_calls_limit:
      profile.api_calls_limit ??
      apiUsage.limit ??
      tierLimits?.api_calls ??
      0,
    storage_used_bytes: profile.storage_used_bytes ?? storageUsage.used ?? 0,
    storage_limit_bytes:
      profile.storage_limit_bytes ??
      storageUsage.limit ??
      tierLimits?.storage_bytes ??
      0,
    usage_stats: usageStats,
    preferences: profile.preferences ?? {},
    features_enabled: profile.features_enabled ?? {},
    permissions: profile.permissions ?? {},
    usage_reset_date: profile.usage_reset_date ?? usageRoot?.usage_reset_date ?? "",
  };
}

export default function DashboardClient({ user }: DashboardClientProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [userData, setUserData] = useState<CompleteUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserDataError | null>(null);
  const isMountedRef = useRef(true);
  const { signOut, isSigningOut, error: signoutError, clearError } = useSignout();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchUserData = useCallback(
    async (signal?: AbortSignal, retryCount = 0) => {
      if (!isMountedRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const profileData = await fetchApiData("/api/user/profile", signal);

        if (!profileData) {
          throw new Error("User profile not available");
        }

        let usageData: any | undefined;

        try {
          usageData = await fetchApiData("/api/user/usage", signal);
        } catch (usageError) {
          if ((usageError as Error).name === "AbortError") {
            throw usageError;
          }

          if (usageError instanceof AuthRequiredError) {
            throw usageError;
          }

          console.warn("Failed to load usage metrics", usageError);
        }

        const completeUser = mapToCompleteUserData(user, profileData, usageData);

        if (!isValidUserData(completeUser)) {
          throw new Error("Incomplete user data returned from API");
        }

        if (!isMountedRef.current) return;
        setUserData(completeUser);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }

        if (!isMountedRef.current) {
          return;
        }

        if (err instanceof AuthRequiredError) {
          // Retry auth failures with exponential backoff (up to 3 times)
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
            console.log(`[auth] Session not ready, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
            setTimeout(() => {
              if (isMountedRef.current && !signal?.aborted) {
                fetchUserData(signal, retryCount + 1);
              }
            }, delay);
            return;
          }
          
          // After 3 retries, show error
          console.error('[auth] Session not established after 3 retries');
          setUserData(null);
          setError({
            code: "AUTH_REQUIRED",
            message: err.message,
            details: { endpoint: "/api/user/profile" },
          });
          return;
        }

        console.error("Failed to load dashboard data", err);
        setUserData(null);
        setError({
          code: "DATABASE_ERROR",
          message: err instanceof Error ? err.message : "Failed to load dashboard data",
          details: { cause: err },
        });
      } finally {
        if (!isMountedRef.current) return;
        if (!signal || !signal.aborted) {
          setLoading(false);
        }
      }
    },
    [user]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchUserData(controller.signal);
    return () => controller.abort();
  }, [fetchUserData]);

  useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    setActiveTab((current) => (current === tab ? current : tab));
  }, [searchParams]);

  const usageSummary = useMemo(() => {
    if (!userData) return [];
    const usage = (userData.usage_stats?.current_usage as Record<string, any>) || {};

    return [
      {
        key: "chat",
        label: "AI Chats",
        used: usage.chat_messages?.used ?? userData.chat_messages_count ?? 0,
        limit: usage.chat_messages?.limit ?? userData.chat_messages_limit ?? 0,
        unit: "messages",
      },
      {
        key: "documents",
        label: "Documents",
        used: usage.documents?.used ?? userData.documents_uploaded ?? 0,
        limit: usage.documents?.limit ?? userData.documents_limit ?? 0,
        unit: "files",
      },
      {
        key: "api",
        label: "API Calls",
        used: usage.api_calls?.used ?? userData.api_calls_count ?? 0,
        limit: usage.api_calls?.limit ?? userData.api_calls_limit ?? 0,
        unit: "requests",
      },
      {
        key: "storage",
        label: "Storage",
        used: usage.storage?.used ?? userData.storage_used_bytes ?? 0,
        limit: usage.storage?.limit ?? userData.storage_limit_bytes ?? 0,
        formatted: true,
      },
    ];
  }, [userData]);

  const usageWarnings = useMemo(() => {
    const rawWarnings = (userData?.usage_stats?.warnings as Array<Record<string, any>>) || [];
    return rawWarnings.filter(Boolean);
  }, [userData]);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  const handleRetry = useCallback(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut({
        showLoading: true,
        forceRedirect: true
      });
    } catch (err) {
      // Error is already handled by the useSignout hook
      console.error('Signout failed:', err);
    }
  }, [signOut]);

  if (loading) {
    return <DashboardLoading />;
  }

  if (error) {
    const message = getUserDataErrorMessage(error);
    const isAuthError = error.code === "AUTH_REQUIRED";

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div
            className={`border rounded-lg p-6 ${
              isAuthError
                ? "bg-red-900/20 border-red-700/50"
                : "bg-yellow-900/20 border-yellow-700/50"
            }`}
          >
            <div className={`mb-4 ${isAuthError ? "text-red-400" : "text-yellow-400"}`}>
              {isAuthError ? (
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {isAuthError ? "Authentication Required" : "Dashboard Unavailable"}
            </h2>
            <p className="text-gray-300 mb-4">{message}</p>
            <div className="space-y-2">
              {isAuthError ? (
                <a
                  href="/auth/signin"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Sign In
                </a>
              ) : (
                <button
                  onClick={handleRetry}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Retry Loading Dashboard
                </button>
              )}
            </div>
            {process.env.NODE_ENV === "development" && error.details && (
              <details className="mt-4 text-left">
                <summary className="text-sm text-gray-400 cursor-pointer">Debug Info</summary>
                <pre className="text-xs text-gray-500 mt-2 overflow-auto">
                  {JSON.stringify(error.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
            <div className="text-yellow-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">User Data Unavailable</h2>
            <p className="text-gray-300 mb-4">
              We could not load your account details. Some features may be limited.
            </p>
            <button
              onClick={handleRetry}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Retry Loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = userData.name || userData.full_name || userData.email;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex">
      <ErrorBoundary>
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} user={userData} />
      </ErrorBoundary>

      <div className="flex-1 flex flex-col">
        <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img
                src="/Briefly_Logo_120px.png"
                alt="Briefly Logo"
                className="w-10 h-10"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">Briefly Cloud</h1>
                <p className="text-sm text-gray-300">AI-Powered Document Assistant</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <ErrorBoundary>
                <SubscriptionStatus user={userData} />
              </ErrorBoundary>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <img
                    src={userData.image || "/default-avatar.png"}
                    alt="Profile"
                    className="w-8 h-8 rounded-full border-2 border-gray-600"
                    onError={(event) => {
                      (event.currentTarget as HTMLImageElement).src = "/default-avatar.png";
                    }}
                  />
                  <div className="text-sm font-medium text-gray-200">
                    <div className="truncate max-w-[12rem]">{displayName}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[12rem]">{userData.email}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  {signoutError && (
                    <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 rounded-lg px-2 py-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate max-w-[12rem]">{signoutError}</span>
                      <button
                        onClick={clearError}
                        className="text-red-300 hover:text-red-200 ml-auto"
                        title="Dismiss error"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <button
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className={`text-sm transition-colors px-3 py-1 rounded border flex items-center space-x-2 ${
                      isSigningOut
                        ? 'text-gray-500 border-gray-700 cursor-not-allowed'
                        : 'text-gray-400 hover:text-white border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {isSigningOut ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Signing out...</span>
                      </>
                    ) : (
                      <span>Sign out</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {usageWarnings.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {usageWarnings.map((warning, index) => (
                <div
                  key={`${warning?.type ?? "warning"}-${index}`}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    warning?.level === "critical"
                      ? "bg-red-900/30 border-red-700/50 text-red-200"
                      : "bg-yellow-900/30 border-yellow-700/50 text-yellow-100"
                  }`}
                >
                  <div className="font-medium">
                    {warning?.message ?? "Usage warning"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Quota Status Component */}
          <div className="mt-6">
            <ErrorBoundary>
              <QuotaStatus />
            </ErrorBoundary>
          </div>
        </header>

        <main className="flex-1 p-6">
          {activeTab === "chat" && (
            <ErrorBoundary>
              <ChatInterface />
            </ErrorBoundary>
          )}

          {activeTab === "files" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Upload Documents</h2>
                <ErrorBoundary>
                  <FileUpload />
                </ErrorBoundary>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Your Documents</h2>
                <ErrorBoundary>
                  <FileList />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <ErrorBoundary>
              <CloudStorage userId={userData.id} />
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

