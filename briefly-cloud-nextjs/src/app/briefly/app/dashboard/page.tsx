import { getUserSession } from '@/app/lib/auth/supabase-auth'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

// Force dynamic rendering for authenticated pages
export const dynamic = 'force-dynamic'

export default async function DashboardPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getUserSession()
  
  if (!user) {
    // Use the standardized 'next' parameter from the query string
    const callbackUrl = searchParams.next ? decodeURIComponent(searchParams.next) : '/briefly/app/dashboard'
    redirect(`/auth/signin?next=${encodeURIComponent(callbackUrl)}`)
  }

  return <DashboardClient user={user} />
}

