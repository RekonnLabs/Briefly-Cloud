"use client";
import type { User } from "@supabase/supabase-js";

export default function DashboardClient({ user }: { user: User }) {
  // TODO: mount your real dashboard here (widgets, data loaders, etc.)
  // IMPORTANT: do NOT re-run auth guards here. Trust the server prop.
  return (
    <div className="p-6">
      <div className="text-sm opacity-70">Signed in as</div>
      <div className="text-xl font-semibold">{user.email}</div>
      {/* ...your actual dashboard components... */}
    </div>
  );
}
