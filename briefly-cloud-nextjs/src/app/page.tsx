import { redirect } from 'next/navigation'
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = getSupabaseServerReadOnly()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/briefly/app/dashboard' : '/auth/signin')
}
