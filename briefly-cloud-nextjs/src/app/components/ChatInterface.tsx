"use client";

import { useState, useRef, useEffect } from 'react';
import { Send, FileText, ExternalLink } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    file_id: string;
    file_name: string;
    chunk_index: number;
    relevance_score: number;
  }>;
  timestamp: Date;
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
      // Enhanced error handling with retry logic
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
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantMessage += chunk;
        setStreamingMessage(assistantMessage);
      }

      const assistantMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessageObj]);
      setStreamingMessage('');

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Capture error for monitoring
      const { captureApiError } = await import('@/app/lib/error-monitoring');
      captureApiError(error as Error, '/api/chat');

      // Provide user-friendly error messages
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
    // Simple markdown-like formatting with dark theme support
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
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: formatMessage(message.content)
                }}
              />
              
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
