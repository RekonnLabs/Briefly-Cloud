"use client";

import { useState, useEffect } from 'react';
import { Cloud, Download, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

interface CloudFile {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  webViewLink?: string;
  webUrl?: string;
}

interface CloudProvider {
  id: 'google' | 'microsoft';
  name: string;
  icon: string;
  connected: boolean;
  files: CloudFile[];
  loading: boolean;
}

export function CloudStorage() {
  const [providers, setProviders] = useState<CloudProvider[]>([
    {
      id: 'google',
      name: 'Google Drive',
      icon: '🔵',
      connected: false,
      files: [],
      loading: false
    },
    {
      id: 'microsoft',
      name: 'OneDrive',
      icon: '🔴',
      connected: false,
      files: [],
      loading: false
    }
  ]);

  const [importingFiles, setImportingFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Check connection status on mount
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    // This would check if user has OAuth tokens stored
    // For now, we'll simulate the check
    setProviders(prev => prev.map(p => ({ ...p, connected: false })));
  };

  const connectProvider = async (providerId: 'google' | 'microsoft') => {
    const startUrl = providerId === 'google' 
      ? '/api/storage/google/start'
      : '/api/storage/microsoft/start';
    
    window.location.href = startUrl;
  };

  const disconnectProvider = async (providerId: 'google' | 'microsoft') => {
    try {
      const response = await fetch(`/api/auth/disconnect?provider=${providerId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setProviders(prev => 
          prev.map(p => 
            p.id === providerId 
              ? { ...p, connected: false, files: [] }
              : p
          )
        );
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const loadFiles = async (providerId: 'google' | 'microsoft') => {
    setProviders(prev => 
      prev.map(p => 
        p.id === providerId 
          ? { ...p, loading: true }
          : p
      )
    );

    try {
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/list'
        : '/api/storage/microsoft/list';
      
      const response = await fetch(endpoint);
      
      if (response.ok) {
        const data = await response.json();
        setProviders(prev => 
          prev.map(p => 
            p.id === providerId 
              ? { ...p, files: data.files || [], loading: false }
              : p
          )
        );
      } else {
        throw new Error('Failed to load files');
      }
    } catch (error) {
      console.error('Load files error:', error);
      setProviders(prev => 
        prev.map(p => 
          p.id === providerId 
            ? { ...p, loading: false }
            : p
        )
      );
    }
  };

  const importFile = async (providerId: 'google' | 'microsoft', fileId: string, fileName: string) => {
    setImportingFiles(prev => new Set(prev).add(fileId));

    try {
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/import'
        : '/api/storage/microsoft/import';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully imported ${fileName}`);
      } else {
        throw new Error('Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert(`Failed to import ${fileName}`);
    } finally {
      setImportingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cloud Storage</h2>
        <p className="text-gray-600">Connect your cloud storage accounts to import documents</p>
      </div>

      {providers.map((provider) => (
        <div key={provider.id} className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{provider.icon}</span>
              <div>
                <h3 className="text-lg font-medium text-gray-900">{provider.name}</h3>
                <p className="text-sm text-gray-600">
                  {provider.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {provider.connected ? (
                <>
                  <button
                    onClick={() => loadFiles(provider.id)}
                    disabled={provider.loading}
                    className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${provider.loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={() => disconnectProvider(provider.id)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connectProvider(provider.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Cloud className="w-4 h-4" />
                  <span>Connect</span>
                </button>
              )}
            </div>
          </div>

          {provider.connected && (
            <div className="space-y-4">
              {provider.loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading files...</p>
                </div>
              ) : provider.files.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Available Files</h4>
                  {provider.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                          <Cloud className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => importFile(provider.id, file.id, file.name)}
                          disabled={importingFiles.has(file.id)}
                          className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {importingFiles.has(file.id) ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-white" />
                              <span>Importing...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>Import</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No files found</p>
                  <p className="text-sm">Click "Refresh" to load your files</p>
                </div>
              )}
            </div>
          )}

          {!provider.connected && (
            <div className="text-center py-8 text-gray-500">
              <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Connect your {provider.name} account to import files</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
