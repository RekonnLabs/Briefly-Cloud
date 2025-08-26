import { redirect } from 'next/navigation'
import { createServerClientReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export const dynamic = 'force-dynamic'

export default async function BrieflyAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClientReadOnly()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin')
  return <>{children}</>
}