import { headers } from 'next/headers'
import { createServerClientReadOnly } from '@/app/lib/auth/supabase-server-readonly'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic' // no static caching for authed pages

export default async function DashboardPage() {
  // Optional: cheap check if middleware authenticated this request
  const h = await headers()
  const hasSession = h.get('x-sb-session') === '1'

  // Only hit Supabase if you actually need the user object
  let user = null as any
  if (hasSession) {
    const supabase = createServerClientReadOnly()
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u ?? null
  }

  // Do NOT redirect here. Middleware already enforced access.
  return <DashboardClient user={user} />
}

