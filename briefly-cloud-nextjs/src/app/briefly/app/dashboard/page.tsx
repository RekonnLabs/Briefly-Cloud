import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerReadOnly } from "@/app/lib/auth/supabase-server-readonly";
import { DefensiveDashboardWrapper } from "./DefensiveDashboardWrapper";
import DashboardLoading from "./DashboardLoading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getSupabaseServerReadOnly();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) redirect("/auth/signin?err=session");

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DefensiveDashboardWrapper user={user} />
    </Suspense>
  );
}

