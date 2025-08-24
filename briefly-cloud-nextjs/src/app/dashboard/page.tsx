import { redirect } from 'next/navigation'

export default function LegacyDashboardRedirect() {
  // Preserve query parameters when redirecting
  redirect('/briefly/app/dashboard')
}