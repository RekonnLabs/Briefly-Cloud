import { getSupabaseServerReadOnly } from "@/app/lib/auth/supabase-server-readonly";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerReadOnly();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin?err=session");

  // Render the real dashboard client UI; do NOT re-check auth in the client.
  return <DashboardClient user={user} />;
}
