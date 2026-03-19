"use client";

/**
 * TrialExpiredBanner
 *
 * Shown as a full-width banner below the dashboard header when the user's
 * free trial has expired and they haven't upgraded yet.  It reads the
 * current session directly so it can be dropped into any layout without
 * prop-drilling.
 *
 * Visibility rules:
 *   - subscription_tier === 'free'
 *   - trial_end_date is set AND in the past
 *   - subscription_status is NOT 'active' with a paid tier
 *
 * The banner is dismissible for the current page session (state only —
 * it reappears on next load until the user upgrades).
 */

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/app/lib/auth/supabase-browser";

export function TrialExpiredBanner() {
  const [show, setShow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const supabase = getSupabaseBrowserClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) return;

        const { data } = await supabase
          .from("v_user_access")
          .select("subscription_tier, trial_end_date, trial_active, paid_active")
          .eq("user_id", user.id)
          .single();

        if (!data || cancelled) return;

        // Show banner only when trial has expired and user is still on free tier
        const trialExpired =
          data.subscription_tier === "free" &&
          data.trial_end_date !== null &&
          !data.trial_active &&
          !data.paid_active;

        setShow(trialExpired);
      } catch {
        // Fail silently — banner is non-critical
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpgrade() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      }
    } catch {
      setIsLoading(false);
    }
  }

  if (!show) return null;

  return (
    <div className="w-full bg-amber-900/40 border-b border-amber-700/50 px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-amber-100 text-sm">
        <span className="text-lg">⏰</span>
        <span>
          <strong>Your free trial has ended.</strong> Upgrade to Pro to keep
          uploading documents and chatting with your files.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={handleUpgrade}
          disabled={isLoading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-900 font-semibold text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          {isLoading ? "Redirecting…" : "Upgrade to Pro"}
        </button>
        <button
          onClick={() => setShow(false)}
          className="text-amber-400 hover:text-amber-200 text-lg leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
