import { Suspense } from "react";
import { getSupabaseServerReadOnly } from "@/app/lib/auth/supabase-server-readonly";
import { DefensiveDashboardWrapper } from "./DefensiveDashboardWrapper";
import DashboardLoading from "./DashboardLoading";
import SessionExpired from "./SessionExpired";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getSupabaseServerReadOnly();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <SessionExpired />;

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DefensiveDashboardWrapper user={user} />
    </Suspense>
  );
}

