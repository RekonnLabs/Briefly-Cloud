import { redirect } from 'next/navigation'
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'
import { DEFAULT_POST_LOGIN_PATH } from '@/app/lib/auth/constants'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = getSupabaseServerReadOnly()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? DEFAULT_POST_LOGIN_PATH : '/auth/signin')
}
