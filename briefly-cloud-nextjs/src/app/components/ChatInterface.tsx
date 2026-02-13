"use client";

import { useState, useRef, useEffect } from 'react';
import { Send, FileText, ExternalLink, ShieldCheck, ShieldAlert, Globe } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Provenance types — mirrors the backend ProvenanceMetadata
// ─────────────────────────────────────────────────────────────────────────────
type ProvenanceType = 'grounded' | 'general' | 'ungrounded'

interface Provenance {
  type: ProvenanceType
  contextCount: number
  citationsFound: number
  sources: string[]
  disclaimer: string | null
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provenance?: Provenance;
  sources?: Array<{
    file_id: string;
    file_name: string;
    chunk_index: number;
    relevance_score: number;
  }>;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance badge component
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

  // UNGROUNDED — warning banner
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

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  /**
   * Parse the response body. The backend now sends a JSON envelope:
   * { content: string, provenance: Provenance, conversationId: string | null }
   *
   * For backward compatibility, if the response is not valid JSON, treat
   * the entire body as plain-text content with no provenance.
   */
  function parseResponse(raw: string): { content: string; provenance?: Provenance } {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.content === 'string') {
        return {
          content: parsed.content,
          provenance: parsed.provenance || undefined
        }
      }
    } catch {
      // Not JSON — fall through
    }
    return { content: raw }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingMessage('');

    try {
      const { retryApiCall } = await import('@/app/lib/retry');
      const { captureApiError } = await import('@/app/lib/error-monitoring');

      const makeRequest = async () => {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage.content,
            stream: true
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      };

      const response = await retryApiCall(makeRequest);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let rawBody = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        rawBody += chunk;

        // Show raw content while streaming (best-effort preview)
        // We'll parse the JSON envelope once streaming is complete
        try {
          const partial = JSON.parse(rawBody);
          if (partial && typeof partial.content === 'string') {
            setStreamingMessage(partial.content);
          } else {
            setStreamingMessage(rawBody);
          }
        } catch {
          // Incomplete JSON during streaming — show raw text
          setStreamingMessage(rawBody);
        }
      }

      // Parse the complete response
      const { content, provenance } = parseResponse(rawBody);

      const assistantMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        provenance,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessageObj]);
      setStreamingMessage('');

    } catch (error) {
      console.error('Error sending message:', error);
      
      const { captureApiError } = await import('@/app/lib/error-monitoring');
      captureApiError(error as Error, '/api/chat');

      let errorContent = 'Sorry, I encountered an error. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          errorContent = 'You\'re sending messages too quickly. Please wait a moment and try again.';
        } else if (error.message.includes('timeout')) {
          errorContent = 'The request timed out. Please try again.';
        } else if (error.message.includes('BYOK')) {
          errorContent = 'There was an issue with your API key. Please check your settings.';
        } else if (error.message.includes('usage limit')) {
          errorContent = 'You\'ve reached your usage limit. Please upgrade your plan to continue.';
        } else if (error.message.includes('network')) {
          errorContent = 'Network error. Please check your connection and try again.';
        }
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-700/50 text-gray-200 px-1 rounded">$1</code>')
      .replace(/\n/g, '<br>');
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <h2 className="text-lg font-semibold text-white">AI Chat</h2>
        <p className="text-sm text-gray-300">Ask questions about your documents</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-lg font-medium mb-2 text-white">No conversation yet</p>
            <p className="text-sm">Upload some documents and start chatting!</p>
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
              {/* Provenance badge — shown above assistant messages */}
              {message.role === 'assistant' && message.provenance && (
                <div className="mb-2">
                  <ProvenanceBadge provenance={message.provenance} />
                </div>
              )}

              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: formatMessage(message.content)
                }}
              />

              {/* Ungrounded warning banner */}
              {message.role === 'assistant' && message.provenance && (
                <UngroundedBanner provenance={message.provenance} />
              )}

              {/* General answer disclaimer */}
              {message.role === 'assistant' && message.provenance?.type === 'general' && message.provenance.disclaimer && (
                <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/15 text-xs text-blue-300/80">
                  {message.provenance.disclaimer}
                </div>
              )}
              
              {message.sources && message.sources.length > 0 && (
                <div className={`mt-3 pt-3 ${message.role === 'user' ? 'border-t border-blue-400/30' : 'border-t border-gray-600/50'}`}>
                  <p className="text-xs font-medium mb-2 opacity-80">Sources:</p>
                  <div className="space-y-1">
                    {message.sources.map((source, index) => (
                      <div key={index} className="flex items-center space-x-2 text-xs opacity-70">
                        <FileText className="w-3 h-3" />
                        <span>{source.file_name}</span>
                        <span>•</span>
                        <span>
                          Chunk {source.chunk_index}
                        </span>
                        <span>•</span>
                        <span>
                          {Math.round(source.relevance_score * 100)}% relevant
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-xs opacity-70 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-3xl rounded-2xl px-4 py-3 bg-gray-800/50 text-gray-100 border border-gray-700/30">
              <div
                className="prose prose-sm max-w-none prose-invert"
                dangerouslySetInnerHTML={{
                  __html: formatMessage(streamingMessage)
                }}
              />
              <div className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
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
              onKeyPress={handleKeyPress}
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
        <div className="mt-2 text-xs text-gray-400">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
