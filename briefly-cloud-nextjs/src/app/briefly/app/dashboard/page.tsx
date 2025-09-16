import { getSupabaseServerReadOnly } from "@/app/lib/auth/supabase-server-readonly";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getSupabaseServerReadOnly();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin?err=session");

  // TODO: render real dashboard here (swap your wrapper back in)
  return <div className="p-8">Welcome, {user.email}</div>;
}

