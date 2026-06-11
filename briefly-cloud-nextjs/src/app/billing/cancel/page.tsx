// @ts-nocheck — pending type cleanup
/**
 * Stripe checkout cancel redirect.
 * User abandoned checkout — send them back to the dashboard.
 */
import { redirect } from 'next/navigation'

export default function BillingCancelPage() {
  redirect('/briefly/app/dashboard?upgrade_cancelled=true')
}
