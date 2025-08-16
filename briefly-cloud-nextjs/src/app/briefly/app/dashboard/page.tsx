import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

// Force dynamic rendering for authenticated pages
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()
  
  if (!user) {
    redirect('/briefly/app/auth/signin?callbackUrl=/briefly/app/dashboard')
  }

  return <DashboardClient user={user} />
}

