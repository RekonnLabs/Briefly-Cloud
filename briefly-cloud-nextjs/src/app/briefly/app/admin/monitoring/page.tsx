/**
 * Schema Monitoring Administration Page
 * 
 * Provides administrative interface for configuring and managing
 * schema monitoring, alerts, and performance tracking
 */

import { SchemaDashboard } from '@/app/components/monitoring/SchemaDashboard'

export default function MonitoringPage() {
  return (
    <div className="container mx-auto py-6">
      <SchemaDashboard />
    </div>
  )
}

export const metadata = {
  title: 'Schema Monitoring - Briefly Cloud Admin',
  description: 'Monitor database schema health and performance'
}