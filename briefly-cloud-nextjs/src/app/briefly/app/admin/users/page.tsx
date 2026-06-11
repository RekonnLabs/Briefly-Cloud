// @ts-nocheck — legacy route pending consolidation
/**
 * Admin User Dashboard
 * 
 * Gated to ADMIN_EMAILS only — anyone else gets a 403.
 * Completely read-only. No writes, no mutations, no risk to production.
 * Access: /briefly/app/admin/users
 */

import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { redirect } from 'next/navigation'
import AdminDashboardClient from './AdminDashboardClient'

// Only these emails can access this page
const ADMIN_EMAILS = [
  'rekonnlabs@gmail.com',
]

export default async function AdminUsersPage() {
  // Verify authenticated user
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/signin?next=/briefly/app/admin/users')
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/briefly/app/dashboard')
  }

  // Fetch all user data server-side (never exposed to non-admins)
  const { data: users } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      subscription_tier,
      subscription_status,
      trial_end_date,
      stripe_customer_id,
      created_at
    `)
    .order('created_at', { ascending: false })

  // Fetch usage limits for all users
  const { data: limits } = await supabaseAdmin
    .from('v_user_limits')
    .select('*')

  // Fetch recent user messages for Activity tab
  const { data: recentMessages } = await supabaseAdmin
    .from('messages')
    .select('owner_id, role, content, created_at, provenance, intent_mode, tokens_in, tokens_out, cost_usd, tokens_context, latency_ms')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch assistant messages for Performance tab (these carry latency_ms, cost_usd, tokens_out)
  const { data: assistantMessages } = await supabaseAdmin
    .from('messages')
    .select('owner_id, role, content, created_at, provenance, intent_mode, tokens_in, tokens_out, cost_usd, tokens_context, latency_ms')
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(200)

  // Fetch file counts per user  
  const { data: files } = await supabaseAdmin
    .from('files')
    .select('owner_id, name, processing_status, created_at, source')
    .order('created_at', { ascending: false })

  return (
    <AdminDashboardClient
      users={users || []}
      limits={limits || []}
      recentMessages={recentMessages || []}
      assistantMessages={assistantMessages || []}
      files={files || []}
    />
  )
}
