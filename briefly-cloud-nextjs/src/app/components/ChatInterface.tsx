"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, FileText, ShieldCheck, ShieldAlert, Globe, Zap, BarChart2, BookOpen, FileOutput, Scissors } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ProvenanceType = 'grounded' | 'general' | 'ungrounded'
type IntentMode = 'qa' | 'comparison' | 'summary' | 'report' | 'extraction'

interface Provenance {
  type: ProvenanceType
  contextCount: number
  citationsFound: number
  sources: string[]
  disclaimer: string | null
  intentMode?: IntentMode
  memory?: {
    enabled: boolean
    included: number
    tokensEstimated: number
    gate: string
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provenance?: Provenance;
  timestamp: Date;
  streaming?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance badge
// ─────────────────────────────────────────────────────────────────────────────
function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  if (provenance.type === 'grounded') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Grounded in documents</span>
        <span className="text-emerald-500/60">·</span>
        <span className="text-emerald-500/80">{provenance.citationsFound} citation{provenance.citationsFound !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  if (provenance.type === 'general') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
        <Globe className="w-3.5 h-3.5" />
        <span>General answer</span>
        <span className="text-blue-500/60">·</span>
        <span className="text-blue-500/80">not from documents</span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <ShieldAlert className="w-3.5 h-3.5" />
      <span>Ungrounded</span>
      <span className="text-amber-500/60">·</span>
      <span className="text-amber-500/80">docs available but not cited</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode badge — shown in input area for non-QA modes
// ─────────────────────────────────────────────────────────────────────────────
const MODE_LABELS: Record<IntentMode, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  qa: { label: 'Q&A', Icon: BookOpen },
  comparison: { label: 'Comparison mode', Icon: BarChart2 },
  summary: { label: 'Summary mode', Icon: FileText },
  report: { label: 'Report mode', Icon: FileOutput },
  extraction: { label: 'Extraction mode', Icon: Scissors },
}

function ModeBadge({ mode }: { mode: IntentMode }) {
  if (mode === 'qa') return null
  const { label, Icon } = MODE_LABELS[mode]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400 ml-2">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ungrounded warning banner
// ─────────────────────────────────────────────────────────────────────────────
function UngroundedBanner({ provenance }: { provenance: Provenance }) {
  if (provenance.type !== 'ungrounded') return null
  return (
    <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90">
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
        <div>
          <p className="font-medium text-amber-400">Provenance Warning</p>
          <p className="mt-0.5">
            {provenance.contextCount} document chunk{provenance.contextCount !== 1 ? 's' : ''} were
            available, but the response did not cite any sources. This answer may not be grounded in
            your documents.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator — shown while waiting for first token
// ─────────────────────────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-gray-800/50 text-gray-100 border border-gray-700/30">
        <div className="flex items-center gap-1 h-5">
          <span className="text-xs text-gray-400 mr-1">Briefly is thinking</span>
          <span className="typing-dot" />
          <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
          <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detect intent mode from message text (client-side, mirrors intentRouter)
// Used only for the mode badge hint — actual routing is server-side
// ─────────────────────────────────────────────────────────────────────────────
function detectModeHint(text: string): IntentMode {
  const lower = text.toLowerCase()
  if (/\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference(s)?\b/.test(lower)) return 'comparison'
  if (/\bsummar(ize|ise|y)\b|\boverview\b|\bbrief(ly)?\b/.test(lower)) return 'summary'
  if (/\bdraft\b|\bwrite\b|\breport\b|\bmemo\b|\bproposal\b/.test(lower)) return 'report'
  if (/\bextract\b|\blist all\b|\bfind all\b|\bpull out\b/.test(lower)) return 'extraction'
  return 'qa'
}

// ─────────────────────────────────────────────────────────────────────────────
// Message rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Strip all [Source: ...] citations from the body and collect unique filenames.
 * Handles both GPT-style [Source: A] [Source: B] and Llama-style [Source: A, Source: B].
 */
function extractAndStrip(text: string): { body: string; sources: string[] } {
  const sources = new Set<string>()
  const body = text.replace(/\s?\[Source:\s*([^\]]+)\]/gi, (_, inner) => {
    inner.split(/,\s*Source:\s*/i).forEach((s: string) => {
      const name = s.trim()
      if (name) sources.add(name)
    })
    return ''
  }).trim()
  return { body, sources: [...sources] }
}

/**
 * Step 2: Convert markdown to styled HTML.
 * Handles: headings, bold, bullet points (* and -), inline code, paragraph breaks.
 * NOTE: do NOT apply the Tailwind 'prose' class to the container — it overrides
 * the inline Tailwind classes injected here.
 */
function markdownToHtml(text: string): string {
  let html = text
    // Headings (must run before bold to avoid ** inside headings)
    .replace(/^### (.+)$/gm, '<p class="text-sm font-semibold text-gray-200 mt-4 mb-1">$1</p>')
    .replace(/^## (.+)$/gm,  '<p class="text-base font-semibold text-gray-100 mt-4 mb-1">$1</p>')
    .replace(/^# (.+)$/gm,   '<p class="text-lg font-semibold text-white mt-4 mb-2">$1</p>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-gray-700/50 text-gray-200 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    // Bullet points (* item or - item at line start)
    .replace(/^[*\-] (.+)$/gm, '<li class="ml-5 list-disc text-gray-100">$1</li>')

  // Wrap consecutive <li> blocks in a <ul>
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,
    (block) => `<ul class="space-y-1 my-2">${block}</ul>`
  )

  // Paragraph breaks (two or more newlines)
  html = html
    .replace(/\n\n+/g, '</p><p class="mt-2 text-gray-100">')
    .replace(/\n/g, '<br/>')

  return html
}

/**
 * Combined entry point used in both completed and streaming message bubbles.
 * Returns bodyHtml (safe to set via dangerouslySetInnerHTML) and sources array.
 */
function formatMessageWithSources(raw: string): { bodyHtml: string; sources: string[] } {
  const { body, sources } = extractAndStrip(raw)
  const bodyHtml = markdownToHtml(body)
  return { bodyHtml, sources }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForFirstToken, setIsWaitingForFirstToken] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detectedMode, setDetectedMode] = useState<IntentMode>('qa');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isWaitingForFirstToken, scrollToBottom]);

  // Hydrate most recent conversation on mount
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      try {
        const res = await fetch('/api/chat/conversations/recent')
        if (!res.ok || cancelled) return

        const { conversation, messages: dbMessages } = await res.json()
        if (!conversation || !dbMessages?.length || cancelled) return

        // Map DB rows to the Message shape used in state.
        // provenance and intent_mode columns are jsonb/text — already structured.
        const hydrated: Message[] = dbMessages.map((m: any) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          provenance: m.provenance ?? undefined,
          intentMode: m.intent_mode ?? undefined,
          timestamp: new Date(m.created_at),
        }))

        setMessages(hydrated)
        setConversationId(conversation.id)
      } catch (err) {
        console.warn('[chat:hydrate] failed — starting fresh', err)
      }
    }

    hydrate()
    return () => { cancelled = true }
  }, []) // mount only

  // Update mode hint as user types
  useEffect(() => {
    if (input.trim()) {
      setDetectedMode(detectModeHint(input))
    } else {
      setDetectedMode('qa')
    }
  }, [input])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setIsLoading(true);
    setIsWaitingForFirstToken(true);
    setStreamingContent('');

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          conversationId: conversationId || undefined,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalContent = '';
      let finalProvenance: Provenance | undefined;

      // ── SSE reader loop ──────────────────────────────────────────────
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'start') {
              // Server acknowledged — conversation ID established, typing indicator stays
              // until first actual token arrives (token handler clears isWaitingForFirstToken)
              if (event.conversationId) setConversationId(event.conversationId);
            }

            if (event.type === 'token') {
              // First token received — hide typing indicator, show streaming bubble
              setIsWaitingForFirstToken(false);
              finalContent += event.content;
              setStreamingContent(finalContent);
            }

            if (event.type === 'done') {
              // Stream complete — use final assembled content from server
              finalContent = event.content || finalContent;
              finalProvenance = event.provenance;
              if (event.conversationId) setConversationId(event.conversationId);
            }

            if (event.type === 'error') {
              throw new Error(event.message || 'Stream error');
            }
          } catch (parseErr) {
            // Ignore malformed SSE lines
          }
        }
      }

      // ── Commit final message ─────────────────────────────────────────
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: finalContent || 'No response received.',
        provenance: finalProvenance,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled — clean up silently
        setStreamingContent('');
        setMessages(prev => prev.slice(0, -1)); // remove user message
        setInput(currentInput); // restore input
        return;
      }

      console.error('Error sending message:', error);

      let errorContent = 'Sorry, I encountered an error. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorContent = 'You\'re sending messages too quickly. Please wait a moment and try again.';
        } else if (error.message.includes('timeout')) {
          errorContent = 'The request timed out. Please try again.';
        } else if (error.message.includes('CHAT_LIMIT_REACHED') || error.message.includes('usage limit')) {
          errorContent = 'You\'ve reached your chat message limit. Please upgrade your plan to continue.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorContent = 'Network error. Please check your connection and try again.';
        }
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      }]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
      setIsWaitingForFirstToken(false);
      abortControllerRef.current = null;
    }
  };

  function handleNewChat() {
    // Abort any in-flight stream
    abortControllerRef.current?.abort()

    // Clear conversation state — next sendMessage will create a new conversation row
    setMessages([])
    setConversationId(null)
    setStreamingContent('')
    setIsLoading(false)
    setIsWaitingForFirstToken(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">AI Chat</h2>
          <p className="text-sm text-gray-300">Ask questions about your documents</p>
        </div>
        <button
          onClick={handleNewChat}
          className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1 rounded border border-gray-700 hover:border-gray-500"
        >
          + New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isWaitingForFirstToken && !streamingContent && (
          <div className="text-center text-gray-400 py-8">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-lg font-medium mb-2 text-white">Get started</p>
            <p className="text-sm">Connect Google Drive to import your documents, or upload files directly. Then ask questions in the chat.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-800/50 text-gray-100 border border-gray-700/30'
              }`}
            >
              {/* Provenance badge + mode badge */}
              {message.role === 'assistant' && message.provenance && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <ProvenanceBadge provenance={message.provenance} />
                  {message.provenance.intentMode && message.provenance.intentMode !== 'qa' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20">
                      {(() => {
                        const { label, Icon } = MODE_LABELS[message.provenance.intentMode!]
                        return <><Icon className="w-3 h-3" />{label}</>
                      })()}
                    </span>
                  )}
                </div>
              )}

              {(() => {
                const { bodyHtml, sources } = formatMessageWithSources(message.content)
                return (
                  <>
                    <div
                      className="text-sm text-gray-100 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                    {sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-700/30 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                        <span className="text-xs text-gray-500 font-medium shrink-0">Sources:</span>
                        {sources.map((src, i) => (
                          <span key={i} className="text-xs font-mono text-gray-500">
                            {src}{i < sources.length - 1 ? ' ·' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Ungrounded warning */}
              {message.role === 'assistant' && message.provenance && (
                <UngroundedBanner provenance={message.provenance} />
              )}

              {/* General answer disclaimer */}
              {message.role === 'assistant' && message.provenance?.type === 'general' && message.provenance.disclaimer && (
                <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/15 text-xs text-blue-300/80">
                  {message.provenance.disclaimer}
                </div>
              )}

              <div className="text-xs opacity-50 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator — shown while waiting for first token */}
        {isWaitingForFirstToken && <TypingIndicator />}

        {/* Streaming bubble — progressive token render with cursor blink */}
        {streamingContent && !isWaitingForFirstToken && (
          <div className="flex justify-start">
            <div className="max-w-3xl rounded-2xl px-4 py-3 bg-gray-800/50 text-gray-100 border border-gray-700/30">
              {(() => {
                const { bodyHtml } = formatMessageWithSources(streamingContent)
                return (
                  <div
                    className="text-sm text-gray-100 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                )
              })()}
              <span className="streaming-cursor" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700/50">
        <div className="flex space-x-4">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your documents..."
              className="w-full px-4 py-3 border border-gray-600 bg-gray-800/50 text-white placeholder-gray-400 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              rows={3}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 flex items-center text-xs text-gray-400">
          <span>Press Enter to send, Shift+Enter for new line</span>
          {/* Mode hint badge — read-only for MVP */}
          <ModeBadge mode={detectedMode} />
        </div>
      </div>
    </div>
  );
}
