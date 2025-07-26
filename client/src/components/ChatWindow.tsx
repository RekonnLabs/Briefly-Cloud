import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { 
  Send, 
  Brain, 
  User, 
  FileText, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Cloud,
  Settings,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  retrieved_chunks?: any[];
  error?: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  subscription_tier: 'free' | 'pro' | 'pro_byok';
  usage_count: number;
  usage_limit: number;
}

interface StorageConnections {
  google: {
    connected: boolean;
    email?: string;
  };
  microsoft: {
    connected: boolean;
    email?: string;
  };
}

interface ChatWindowProps {
  userProfile: UserProfile | null;
  storageConnections: StorageConnections;
  onIndexingStart?: (progress: any) => void;
  onIndexingProgress?: (progress: any) => void;
}

export default function ChatWindow({ 
  userProfile, 
  storageConnections, 
  onIndexingStart,
  onIndexingProgress 
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCitations, setShowCitations] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasIndexedDocuments, setHasIndexedDocuments] = useState(false);
  const [isCheckingIndex, setIsCheckingIndex] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const hasConnectedStorage = storageConnections.google.connected || storageConnections.microsoft.connected;

  // Load conversation and check index status only when user is authenticated
  useEffect(() => {
    if (userProfile && userProfile.id) {
      loadConversationHistory();
      checkIndexStatus();
    }
  }, [userProfile]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const loadConversationHistory = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        // No token, show welcome message
        setMessages([{
          id: 'welcome',
          content: 'Welcome to Briefly Cloud! Please log in to access your conversations.',
          role: 'assistant',
          timestamp: new Date().toISOString()
        }]);
        return;
      }

      const response = await fetch('/api/chat/history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.conversations && data.conversations.length > 0) {
          // Use the most recent conversation
          const recentConversation = data.conversations[0];
          if (recentConversation.messages) {
            setMessages(recentConversation.messages);
            setConversationId(recentConversation.id);
          }
        } else {
          // Show welcome message
          setMessages([{
            id: 'welcome',
            content: hasConnectedStorage 
              ? 'Welcome to Briefly Cloud! I can help you search and analyze your documents. Start by indexing your files, then ask me anything!'
              : 'Welcome to Briefly Cloud! Please connect your cloud storage in Settings to get started.',
            role: 'assistant',
            timestamp: new Date().toISOString()
          }]);
        }
      } else if (response.status === 401) {
        // Authentication failed, don't log error
        console.log('Chat history: Authentication required');
        setMessages([{
          id: 'welcome',
          content: 'Welcome to Briefly Cloud! Please log in to access your conversations.',
          role: 'assistant',
          timestamp: new Date().toISOString()
        }]);
      } else {
        console.log('Chat history unavailable:', response.status);
        // Show welcome message on other errors
        setMessages([{
          id: 'welcome',
          content: hasConnectedStorage 
            ? 'Welcome to Briefly Cloud! I can help you search and analyze your documents. Start by indexing your files, then ask me anything!'
            : 'Welcome to Briefly Cloud! Please connect your cloud storage in Settings to get started.',
          role: 'assistant',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      // Show welcome message on error
      setMessages([{
        id: 'welcome',
        content: hasConnectedStorage 
          ? 'Welcome to Briefly Cloud! I can help you search and analyze your documents. Start by indexing your files, then ask me anything!'
          : 'Welcome to Briefly Cloud! Please connect your cloud storage in Settings to get started.',
        role: 'assistant',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const checkIndexStatus = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        // No token, assume no documents indexed
        setHasIndexedDocuments(false);
        setIsCheckingIndex(false);
        return;
      }

      const response = await fetch('/api/embed/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setHasIndexedDocuments(data.has_documents || false);
      } else if (response.status === 401) {
        // Authentication failed, don't log error
        console.log('Index status: Authentication required');
        setHasIndexedDocuments(false);
      } else {
        console.log('Index status unavailable:', response.status);
        setHasIndexedDocuments(false);
      }
    } catch (error) {
      console.log('Index status check failed:', error.message);
      setHasIndexedDocuments(false);
    } finally {
      setIsCheckingIndex(false);
    }
  };

  const handleIndexDocuments = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/embed/index', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (onIndexingStart) {
          onIndexingStart({ processed: 0, total: data.total_files, status: 'Starting indexing...' });
        }

        // Poll for progress
        const pollProgress = async () => {
          try {
            const progressResponse = await fetch('/api/embed/progress', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              
              if (onIndexingProgress) {
                onIndexingProgress(progressData);
              }

              if (progressData.status === 'completed') {
                setHasIndexedDocuments(true);
                // Add success message to chat
                const successMessage: Message = {
                  id: `msg_${Date.now()}_system`,
                  content: `✅ Successfully indexed ${progressData.processed} documents! You can now ask questions about your files.`,
                  role: 'assistant',
                  timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, successMessage]);
              } else if (progressData.status === 'running') {
                setTimeout(pollProgress, 2000);
              }
            }
          } catch (error) {
            console.error('Failed to check progress:', error);
          }
        };

        setTimeout(pollProgress, 1000);
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start indexing');
      }
    } catch (error) {
      console.error('Failed to index documents:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        content: `❌ Failed to index documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        error: true
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    // Check usage limits
    if (userProfile && userProfile.usage_count >= userProfile.usage_limit) {
      const limitMessage: Message = {
        id: `msg_${Date.now()}_limit`,
        content: `You've reached your monthly limit of ${userProfile.usage_limit} messages. Please upgrade your plan to continue chatting.`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        error: true
      };
      setMessages(prev => [...prev, limitMessage]);
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      content: input.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_id: conversationId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          content: data.response,
          role: 'assistant',
          timestamp: data.timestamp || new Date().toISOString(),
          retrieved_chunks: data.retrieved_chunks || []
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
        }

        // Update usage count
        if (userProfile) {
          userProfile.usage_count = data.usage_count || userProfile.usage_count + 1;
        }
      } else {
        const errorData = await response.json();
        let errorContent = 'Sorry, I encountered an error processing your request.';
        
        if (response.status === 400 && errorData.detail?.includes('BYOK')) {
          errorContent = `❌ OpenAI API Error: ${errorData.detail}\n\nPlease check your API key in Settings or contact support if the issue persists.`;
        } else if (response.status === 429) {
          errorContent = 'You\'re sending messages too quickly. Please wait a moment and try again.';
        } else if (errorData.detail) {
          errorContent = errorData.detail;
        }

        const errorMessage: Message = {
          id: `msg_${Date.now()}_error`,
          content: errorContent,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          error: true
        };

        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        content: 'Sorry, I encountered a network error. Please check your connection and try again.',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        error: true
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const canChat = hasConnectedStorage && hasIndexedDocuments && userProfile;
  const needsIndexing = hasConnectedStorage && !hasIndexedDocuments && !isCheckingIndex;

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header - Mobile optimized */}
      <div className="flex-shrink-0 p-3 lg:p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-sm lg:text-base">AI Assistant</span>
            {userProfile && (
              <Badge variant="outline" className="text-xs">
                {userProfile.usage_count}/{userProfile.usage_limit}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Citations toggle - hidden on mobile */}
            <label className="hidden sm:flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCitations}
                onChange={() => setShowCitations(!showCitations)}
                className="mr-2"
              />
              <span className="text-xs text-gray-500">Citations</span>
            </label>
            
            {/* Storage status indicator */}
            <div className="flex items-center gap-1">
              {storageConnections.google.connected && (
                <div className="w-2 h-2 bg-green-500 rounded-full" title="Google Drive connected" />
              )}
              {storageConnections.microsoft.connected && (
                <div className="w-2 h-2 bg-blue-500 rounded-full" title="OneDrive connected" />
              )}
              {!hasConnectedStorage && (
                <div className="w-2 h-2 bg-red-500 rounded-full" title="No storage connected" />
              )}
            </div>
          </div>
        </div>

        {/* Action buttons for mobile */}
        {needsIndexing && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Ready to index your documents
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300">
                  This will analyze your files for AI search
                </p>
              </div>
              <Button size="sm" onClick={handleIndexDocuments}>
                <FileText className="h-4 w-4 mr-1" />
                Index
              </Button>
            </div>
          </div>
        )}

        {!hasConnectedStorage && (
          <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  Connect your cloud storage
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-300">
                  Link Google Drive or OneDrive to get started
                </p>
              </div>
              <Button size="sm" variant="outline">
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages - Mobile optimized scrolling */}
      <ScrollArea className="flex-1 p-3 lg:p-4" ref={chatContainerRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2 lg:gap-3",
                msg.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === 'assistant' && (
                <Avatar className="w-7 h-7 lg:w-8 lg:h-8 bg-blue-600 flex-shrink-0 mt-1">
                  <AvatarFallback>
                    <Brain className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={cn(
                "max-w-[85%] lg:max-w-[70%]",
                msg.role === 'user' && "order-first"
              )}>
                <div className={cn(
                  "rounded-2xl px-3 py-2 lg:px-4 lg:py-3",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white ml-auto" 
                    : msg.error
                    ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                    : "bg-gray-100 dark:bg-gray-800"
                )}>
                  <p className={cn(
                    "text-sm lg:text-base whitespace-pre-wrap",
                    msg.role === 'user' 
                      ? "text-white" 
                      : msg.error
                      ? "text-red-800 dark:text-red-200"
                      : "text-gray-900 dark:text-gray-100"
                  )}>
                    {msg.content}
                  </p>
                  
                  {/* Citations - Mobile optimized */}
                  {msg.role === 'assistant' && showCitations && msg.retrieved_chunks && msg.retrieved_chunks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-xs text-gray-500 mb-1">Sources:</div>
                      <div className="space-y-1">
                        {msg.retrieved_chunks.slice(0, 3).map((chunk: any, i: number) => (
                          <div key={i} className="text-xs text-gray-600 dark:text-gray-400">
                            <div className="font-medium truncate">
                              {chunk.metadata?.filename || 'Unknown Source'}
                            </div>
                            <div className="text-gray-500 truncate">
                              {chunk.content.slice(0, 80)}...
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-gray-500 mt-1 px-1">
                  {formatRelativeTime(msg.timestamp)}
                </div>
              </div>

              {msg.role === 'user' && (
                <Avatar className="w-7 h-7 lg:w-8 lg:h-8 bg-gray-400 flex-shrink-0 mt-1">
                  <AvatarFallback>
                    <User className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start gap-3">
              <Avatar className="w-7 h-7 lg:w-8 lg:h-8 bg-blue-600 flex-shrink-0">
                <AvatarFallback>
                  <Brain className="w-3 h-3 lg:w-4 lg:h-4 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Chat Input - Mobile optimized */}
      <div className="flex-shrink-0 p-3 lg:p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder={
              !hasConnectedStorage 
                ? "Connect storage to get started..." 
                : !hasIndexedDocuments
                ? "Index your documents first..."
                : "Ask me anything about your documents..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pr-12 resize-none min-h-[44px] text-sm lg:text-base"
            rows={1}
            disabled={!canChat || isLoading}
            maxLength={4000}
          />
          <Button 
            className="absolute right-2 bottom-2 h-8 w-8 lg:h-10 lg:w-10"
            size="sm"
            onClick={handleSendMessage}
            disabled={!input.trim() || !canChat || isLoading}
          >
            <Send className="h-3 w-3 lg:h-4 lg:w-4" />
          </Button>
        </div>
        
        {/* Input footer - Mobile optimized */}
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span className="hidden sm:inline">Press Enter to send, Shift+Enter for new line</span>
          <span className="sm:hidden">Tap to send</span>
          <span>{input.length}/4000</span>
        </div>
        
        {userProfile && userProfile.usage_count >= userProfile.usage_limit * 0.9 && (
          <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs text-orange-800 dark:text-orange-200">
            You're approaching your monthly limit ({userProfile.usage_count}/{userProfile.usage_limit} messages used)
          </div>
        )}
      </div>
    </div>
  );
}

