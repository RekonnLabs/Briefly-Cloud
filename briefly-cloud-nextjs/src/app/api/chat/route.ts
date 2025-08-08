import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'
import { generateChatCompletion, streamChatCompletion, SubscriptionTier } from '@/app/lib/openai'
import { createClient } from '@supabase/supabase-js'
import { cacheManager, CACHE_KEYS } from '@/app/lib/cache'
import { withPerformanceMonitoring, withApiPerformanceMonitoring } from '@/app/lib/performance'

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true),
})

async function chatHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({}))
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { message, conversationId, stream } = parsed.data

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

  // Prepare conversation
  let convoId = conversationId
  if (!convoId) {
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select('id')
      .single()
    convoId = data?.id
  }

  // Save user message
  if (convoId) {
    await supabase
      .from('chat_messages')
      .insert({ conversation_id: convoId, role: 'user', content: message })
  }

  // Retrieve context via vector search with performance monitoring
  const contextResults = await withApiPerformanceMonitoring(() =>
    searchDocumentContext(message, user.id, {
      limit: 5,
      threshold: 0.7,
    })
  )

  const contextText = contextResults
    .map((r, i) => `Source ${i + 1} [${r.fileName} #${r.chunkIndex} | score=${r.relevanceScore.toFixed(2)}]\n${r.content}`)
    .join('\n\n')

  const systemPrompt = `You are Briefly, an AI assistant. Use the provided document context when relevant.\n\nContext:\n${contextText || 'No relevant context found.'}\n\nIf the context is insufficient, say so explicitly. Cite filenames when referencing sources.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ] as any

  const tier = (user.subscription_tier || 'free') as SubscriptionTier

  if (stream) {
    const streamResp = await withApiPerformanceMonitoring(() =>
      streamChatCompletion(messages, tier)
    )
    
    // Pipe through a basic text stream response
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of streamResp) {
          controller.enqueue(encoder.encode(typeof chunk === 'string' ? chunk : String(chunk)))
        }
        controller.close()
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  }

  const completion = await withApiPerformanceMonitoring(() =>
    generateChatCompletion(messages, tier)
  )

  if (convoId) {
    await supabase
      .from('chat_messages')
      .insert({ 
        conversation_id: convoId, 
        role: 'assistant', 
        content: completion, 
        sources: contextResults.map(r => ({ 
          file_id: r.fileId, 
          file_name: r.fileName, 
          chunk_index: r.chunkIndex, 
          relevance_score: r.relevanceScore 
        })) 
      })
  }

  return ApiResponse.success({
    conversation_id: convoId,
    response: completion,
    sources: contextResults,
  })
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(chatHandler, {
    rateLimit: rateLimitConfigs.chat,
    logging: { enabled: true, includeBody: true },
  })
)



