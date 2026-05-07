import { NextResponse } from 'next/server'
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { supabaseAdmin } from '@/app/lib/supabase-clients'

const handler = async (_req: Request, ctx: ApiContext) => {
  if (!ctx.user) {
    return NextResponse.json({ conversation: null, messages: [] }, { status: 401 })
  }

  // Get most recent conversation for this user
  const { data: convo, error: convoErr } = await supabaseAdmin
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('owner_id', ctx.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (convoErr) {
    console.error('[chat:recent] failed to fetch conversation', convoErr)
    return NextResponse.json({ conversation: null, messages: [] })
  }
  if (!convo) {
    return NextResponse.json({ conversation: null, messages: [] })
  }

  // Get messages for that conversation, ordered oldest first
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('id, role, content, provenance, intent_mode, created_at')
    .eq('conversation_id', convo.id)
    .eq('owner_id', ctx.user.id)
    .order('created_at', { ascending: true })

  if (msgErr) {
    console.error('[chat:recent] failed to fetch messages', msgErr)
    return NextResponse.json({ conversation: convo, messages: [] })
  }

  return NextResponse.json({ conversation: convo, messages: messages || [] })
}

export const GET = createProtectedApiHandler(handler, {
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 30
  }
})
