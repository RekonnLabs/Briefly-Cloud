/**
 * Signout Monitoring Page
 * 
 * Admin page for monitoring signout performance and reliability
 */

import { Metadata } from 'next'
import { SignoutMonitoringDashboard } from '@/app/components/monitoring/SignoutMonitoringDashboard'

export const metadata: Metadata = {
  title: 'Signout Monitoring | Briefly Cloud',
  description: 'Monitor signout performance and reliability',
}

export default function SignoutMonitoringPage() {
  return (
    <div className="container mx-auto py-8">
      <SignoutMonitoringDashboard />
    </div>
  )
}