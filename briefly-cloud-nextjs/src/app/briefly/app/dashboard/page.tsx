import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'


export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    redirect('/briefly/app/auth/signin?callbackUrl=/briefly/app/dashboard')
  }

  return <DashboardClient user={session.user} />
}

