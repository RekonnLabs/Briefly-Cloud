import { redirect } from 'next/navigation'
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'
import { ToastProvider } from '@/app/components/ui/toast'

export const dynamic = 'force-dynamic'

export default async function BrieflyAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseServerReadOnly()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin')
  
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}