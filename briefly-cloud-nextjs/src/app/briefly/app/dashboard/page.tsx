import { getSupabaseServerReadOnly } from "@/app/lib/auth/supabase-server-readonly";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getSupabaseServerReadOnly();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user) {
    // If you want diagnostics during testing:
    // console.log("[dashboard]", { hasError: !!error, errorMessage: error?.message });
    return (
      <div className="mx-auto max-w-md p-6">
        <h2 className="text-xl font-semibold">Session Expired</h2>
        <p className="mt-2 text-sm opacity-80">Please sign in again.</p>
        <a className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white" href="/auth/signin">
          Sign In
        </a>
      </div>
    );
  }

  // Render your real dashboard component here again
  // return <DefensiveDashboardWrapper user={user} />;
  return <div className="p-8">Welcome, {user.email}</div>;
}

