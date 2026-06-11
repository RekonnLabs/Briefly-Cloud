// @ts-nocheck — pending type cleanup
/**
 * Stripe checkout success redirect.
 * The webhook handles the actual subscription activation — this page just
 * gives the user a confirmation message and routes them back to the dashboard.
 * It may take a few seconds for the webhook to fire and update their tier.
 */
import { redirect } from 'next/navigation'

export default function BillingSuccessPage() {
  // Redirect to dashboard with a flag the UI can use to show a success toast
  redirect('/briefly/app/dashboard?upgraded=true')
}
