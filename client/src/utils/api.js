import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Define the API base URL
const API_BASE_URL = 'http://127.0.0.1:3001/api';

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API functions for frontend
export const apiClient = {
  // Settings
  getSettings: async () => {
    const response = await api.get('/settings');
    return response.data;
  },
  
  updateSettings: async (settings) => {
    const response = await api.post('/settings', settings);
    return response.data;
  },
  
  // Folder operations
  getFolderStats: async (folderPath) => {
    const response = await api.get(`/folder/stats?path=${encodeURIComponent(folderPath)}`);
    return response.data;
  },
  
  indexFolder: async (folderPath) => {
    const response = await api.post('/folder/index', { path: folderPath });
    return response.data;
  },
  
  reindexFolder: async (folderPath) => {
    const response = await api.post('/folder/reindex', { path: folderPath });
    return response.data;
  },
  
  // Chat operations
  sendMessage: async (message, conversationId = null) => {
    const response = await api.post('/chat', { 
      message, 
      conversation_id: conversationId 
    });
    return response.data;
  },
  
  // Conversations
  listConversations: async () => {
    const response = await api.get('/conversations');
    return response.data;
  },
  
  getConversation: async (conversationId) => {
    const response = await api.get(`/conversations/${conversationId}`);
    return response.data;
  },
  
  deleteConversation: async (conversationId) => {
    const response = await api.delete(`/conversations/${conversationId}`);
    return response.data;
  },
  
  // Health check
  checkHealth: async () => {
    const response = await api.get('/health');
    return response.data;
  }
};

// Custom hook for API error handling
export function useApi(apiFunction, initialData = null) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const execute = async (...args) => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFunction(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  return { data, loading, error, execute };
}
