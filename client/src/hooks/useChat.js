import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/api';

export function useChat(initialConversationId = null) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load conversation messages when conversationId changes
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      // Set welcome message if no conversation
      setMessages([
        {
          id: 'welcome',
          content: 'Welcome to Briefly Solo! Select a reference folder to get started, then ask me anything about your files.',
          role: 'assistant',
          timestamp: new Date().toISOString()
        }
      ]);
    }
  }, [conversationId]);

  // Load conversation messages
  const loadConversation = async (convId) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getConversation(convId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Error loading conversation:', err);
      setError('Failed to load conversation');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Send a message
  const sendMessage = async (content) => {
    if (!content.trim() || isLoading) return;

    const userMessage = {
      id: `msg_${Date.now()}_user`,
      content: content.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Send to API
      const response = await apiClient.sendMessage(content, conversationId);
      
      // Update conversation ID if this is a new conversation
      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
      }

      // Add assistant response
      const assistantMessage = {
        id: `msg_${Date.now()}_assistant`,
        content: response.message,
        role: 'assistant',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
      return response;
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.response?.data?.detail || 'Failed to get response');
      
      // Add error message
      const errorMessage = {
        id: `msg_${Date.now()}_error`,
        content: `Error: ${err.response?.data?.detail || 'Failed to get response'}`,
        role: 'assistant',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    conversationId,
    isLoading,
    error,
    sendMessage,
    loadConversation,
    setConversationId
  };
}
