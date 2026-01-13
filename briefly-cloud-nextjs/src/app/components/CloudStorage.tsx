/**
 * CloudStorage Component - Unified Cloud Storage Integration
 * 
 * This component handles cloud storage connections (Google Drive, OneDrive) using
 * either Apideck Vault (unified) or legacy OAuth routes based on feature flag.
 * 
 * INTEGRATION MODES:
 * - Apideck Mode (APIDECK_ENABLED=true): Uses Apideck Vault for unified OAuth
 * - Legacy Mode (APIDECK_ENABLED=false): Uses dedicated storage OAuth routes
 * 
 * APIDECK INTEGRATION:
 * - Connection: Opens Apideck Vault modal for all providers
 * - Session: `/api/integrations/apideck/session` → Vault → `/api/integrations/apideck/callback`
 * - File Operations: Uses Apideck unified API via `/api/storage/{provider}/list` etc.
 * 
 * LEGACY OAUTH (Fallback):
 * - Google Drive: `/api/storage/google/start` → `/api/storage/google/callback`
 * - OneDrive: `/api/storage/microsoft/start` → `/api/storage/microsoft/callback`
 * 
 * OAUTH FLOW SEPARATION:
 * This component is SEPARATE from main authentication flows (`/auth/start?provider=...`)
 * which are used for user login/signup via Supabase Auth.
 */

"use client";

import { useState, useEffect, useCallback } from 'react';
import { Cloud, Download, ExternalLink, RefreshCw, AlertCircle, Play, Pause, X, CheckCircle, XCircle, Clock, Folder, FolderOpen, CreditCard } from 'lucide-react';
import { Breadcrumb, type BreadcrumbItem } from './ui/Breadcrumb';
import { Button } from './ui/button';
import { useToast } from './ui/toast';
import { GooglePicker } from './GooglePicker';
import { logStorageOAuthRoute, logOAuthFlowCompletion, logAuthenticationViolation } from '@/app/lib/oauth-flow-monitoring';
import { useVault } from './integrations/useVault';
import { ConnectionStatusCard, type ConnectionStatus } from './integrations/ConnectionStatusCard';
import { ConnectionMonitoringDashboard } from './integrations/ConnectionMonitoringDashboard';
import { SyncManager } from './SyncManager';

interface CloudFile {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  webViewLink?: string;
  webUrl?: string;
}

interface CloudFolder {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface CloudProvider {
  id: 'google' | 'microsoft';
  name: string;
  icon: string;
  connected: boolean;
  files: CloudFile[];
  folders: CloudFolder[];
  loading: boolean;
  lastSync?: string;
  errorMessage?: string;
  currentFolderId: string;
  breadcrumbs: BreadcrumbItem[];
}

interface ImportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  provider: 'google' | 'microsoft';
  folderId?: string;
  progress: {
    total: number;
    processed: number;
    failed: number;
    skipped: number;
    current_file?: string | null;
    percentage: number;
  };
  fileStatuses: ImportFileStatus[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputData?: {
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
    skippedFiles: number;
    duplicateFiles: number;
  };
  errorMessage?: string;
}

interface ImportFileStatus {
  fileId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'duplicate';
  error?: string;
  reason?: string;
  timestamp: string;
}

interface SelectedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
}

interface CloudStorageProps {
  userId?: string;
}

interface PlanStatus {
  trialActive: boolean;
  paidActive: boolean;
  trialEndsAt: string | null;
  hasStorageAccess: boolean;
  subscriptionTier: string;
}

export function CloudStorage({ userId }: CloudStorageProps = {}) {
  const { showSuccess, showError } = useToast();
  
  const [providers, setProviders] = useState<CloudProvider[]>([
    {
      id: 'google',
      name: 'Google Drive',
      icon: '🔵',
      connected: false,
      files: [],
      folders: [],
      loading: false,
      currentFolderId: 'root',
      breadcrumbs: []
    },
    {
      id: 'microsoft',
      name: 'OneDrive',
      icon: '🔴',
      connected: false,
      files: [],
      folders: [],
      loading: false,
      currentFolderId: 'root',
      breadcrumbs: []
    }
  ]);

  const [importingFiles, setImportingFiles] = useState<Set<string>>(new Set());
  const [batchJobs, setBatchJobs] = useState<Map<string, ImportJob>>(new Map());
  const [showJobDetails, setShowJobDetails] = useState<string | null>(null);
  const [isProcessingPickerFiles, setIsProcessingPickerFiles] = useState(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [showPlanBanner, setShowPlanBanner] = useState(true);
  const [isApideckEnabled, setIsApideckEnabled] = useState(false);
  const { openVault, isLoading: isVaultLoading, error: vaultError } = useVault();

  // Function to refresh connection status
  const refreshConnectionStatus = useCallback(async () => {
    console.log('[refresh-status] Starting connection status refresh');
    await checkConnectionStatus();
    console.log('[refresh-status] Connection status refresh complete');
  }, []);

  // Function to check plan status
  const checkPlanStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/plan/status', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const { data } = await response.json();
        setPlanStatus(data);
      } else {
        console.error('Failed to fetch plan status');
      }
    } catch (error) {
      console.error('Error checking plan status:', error);
    }
  }, []);

  // Function to check if Apideck is enabled
  const checkApideckStatus = useCallback(async () => {
    try {
      // Use POST method for better session handling
      const response = await fetch('/api/integrations/apideck/session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // If we get a 503, Apideck is disabled
      // If we get a 200, Apideck is enabled
      // If we get a 401, user not authenticated but Apideck is enabled
      setIsApideckEnabled(response.status !== 503);
      
      // Log the response for debugging
      if (response.status !== 200) {
        const errorData = await response.json().catch(() => ({}));
        console.log('[CloudStorage] Apideck status check:', {
          status: response.status,
          error: errorData.error,
          message: errorData.message
        });
      }
    } catch (error) {
      console.error('Error checking Apideck status:', error);
      setIsApideckEnabled(false);
    }
  }, []);

  useEffect(() => {
    // Check connection status, plan status, and Apideck status on mount
    checkConnectionStatus();
    checkPlanStatus();
    checkApideckStatus();
    
    // Check for OAuth success/error indicators in URL
    const urlParams = new URLSearchParams(window.location.search);
    const connectedProvider = urlParams.get('connected');
    const errorCode = urlParams.get('error');
    
    if (connectedProvider) {
      console.log('[oauth-callback] Detected successful OAuth connection:', {
        provider: connectedProvider,
        timestamp: new Date().toISOString()
      });
      
      if (connectedProvider === 'apideck') {
        showSuccess('Cloud storage connected successfully!', 'You can now import files from your connected providers.');
      } else {
        const providerName = connectedProvider === 'google' ? 'Google Drive' : 'OneDrive';
        showSuccess(`${providerName} connected successfully!`, 'You can now import files from your cloud storage.');
      }
      
      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('connected');
      window.history.replaceState({}, '', newUrl.toString());
      
      // Refresh connection status after successful OAuth
      setTimeout(async () => {
        console.log('[auto-import] Starting connection status refresh');
        await refreshConnectionStatus();
        console.log('[auto-import] Connection status refresh complete');
        
        // Auto-trigger import for newly connected provider
        // Wait a bit for React state to propagate
        setTimeout(() => {
          if (connectedProvider === '1' || connectedProvider === 'apideck') {
            // For Apideck, we need to determine which provider was connected
            const googleProvider = providers.find(p => p.id === 'google');
            const msProvider = providers.find(p => p.id === 'microsoft');
            
            console.log('[auto-import] Connection status after refresh:', {
              google: googleProvider?.connected,
              microsoft: msProvider?.connected
            });
            
            if (googleProvider?.connected) {
              console.log('[auto-import] Triggering automatic import for Google Drive');
              startBatchImport('google', 'root');
            }
            if (msProvider?.connected) {
              console.log('[auto-import] Triggering automatic import for OneDrive');
              startBatchImport('microsoft', 'root');
            }
            
            if (!googleProvider?.connected && !msProvider?.connected) {
              console.warn('[auto-import] No providers connected after OAuth - auto-import skipped');
            }
          } else if (connectedProvider === 'google') {
            const googleProvider = providers.find(p => p.id === 'google');
            console.log('[auto-import] Google Drive connection status:', googleProvider?.connected);
            if (googleProvider?.connected) {
              console.log('[auto-import] Triggering automatic import for Google Drive');
              startBatchImport('google', 'root');
            } else {
              console.warn('[auto-import] Google Drive not connected - auto-import skipped');
            }
          } else if (connectedProvider === 'microsoft') {
            const msProvider = providers.find(p => p.id === 'microsoft');
            console.log('[auto-import] OneDrive connection status:', msProvider?.connected);
            if (msProvider?.connected) {
              console.log('[auto-import] Triggering automatic import for OneDrive');
              startBatchImport('microsoft', 'root');
            } else {
              console.warn('[auto-import] OneDrive not connected - auto-import skipped');
            }
          }
        }, 1000);
      }, 1000);
    }
    
    if (errorCode) {
      const errorMessage = getErrorMessage(errorCode);
      showError('Connection failed', errorMessage);
      
      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [showSuccess, showError, refreshConnectionStatus, checkPlanStatus, checkApideckStatus]);

  // Function to map error codes to user-friendly messages
  const getErrorMessage = (errorCode: string): string => {
    const errorMessages: Record<string, string> = {
      missing_code: 'OAuth authorization was cancelled or failed. Please try connecting again.',
      state_mismatch: 'Security verification failed. Please try connecting again.',
      auth_failed: 'Authentication failed. Please sign in again and try connecting.',
      token_exchange_failed: 'Failed to complete authorization. Please try connecting again.',
      token_storage_failed: 'Failed to save connection. Please try connecting again.',
      unexpected_error: 'An unexpected error occurred. Please try connecting again.',
      access_denied: 'Access was denied. Please grant permission to connect your cloud storage.',
      invalid_request: 'Invalid request. Please try connecting again.',
      server_error: 'Server error occurred. Please try again later.'
    };
    
    return errorMessages[errorCode] || 'Connection failed. Please try again.';
  };

  const checkConnectionStatus = async () => {
    try {
      console.log('[check-status] Fetching connection status from API');
      const response = await fetch('/api/storage/status');
      
      if (response.ok) {
        const data = await response.json();
        const statusData = data.data;
        
        console.log('[check-status] Received status:', statusData);
        
        setProviders(prev => prev.map(provider => {
          const providerKey = provider.id === 'google' ? 'google' : 'microsoft';
          const status = statusData[providerKey];
          
          console.log(`[check-status] ${provider.name}:`, {
            connected: status?.connected || false,
            status: status?.status,
            lastSync: status?.lastSync
          });
          
          return {
            ...provider,
            connected: status?.connected || false,
            lastSync: status?.lastSync,
            errorMessage: status?.errorMessage
          };
        }));
      } else {
        console.error('[check-status] Failed to fetch connection status:', response.status);
        // Set all as disconnected on error
        setProviders(prev => prev.map(p => ({ 
          ...p, 
          connected: false,
          errorMessage: 'Failed to check connection status'
        })));
      }
    } catch (error) {
      console.error('[check-status] Error checking connection status:', error);
      // Set all as disconnected on error
      setProviders(prev => prev.map(p => ({ 
        ...p, 
        connected: false,
        errorMessage: 'Network error'
      })));
    }
  };

  /**
   * Connect to cloud storage provider using dedicated storage OAuth routes
   * 
   * OAUTH FLOW SEPARATION: This function uses storage-specific OAuth routes:
   * - Google Drive: /api/storage/google/start
   * - OneDrive: /api/storage/microsoft/start
   * 
   * These routes are DIFFERENT from main authentication routes (/auth/start?provider=...)
   * which are used for user login/signup via Supabase Auth.
   */
  const connectProvider = async (providerId: 'google' | 'microsoft') => {
    try {
      // Trust server-side authentication - if this component is rendered, user is authenticated
      // The server (page.tsx) already verified the session before rendering DashboardClient
      // Client-side session checks fail when using httpOnly cookies (more secure)
      
      if (!userId) {
        console.error('[connect] No userId provided - component should not be rendered without authentication');
        window.location.href = `/auth/signin?next=${encodeURIComponent('/briefly/app/dashboard?tab=storage')}`
        return
      }

      // Check if user has storage access (unless allowlisted)
      if (planStatus && !planStatus.hasStorageAccess) {
        // Navigate to billing instead of attempting OAuth
        window.location.href = '/briefly/app/billing?reason=cloud-storage'
        return
      }

      // Use Apideck Vault if enabled, otherwise use legacy OAuth
      if (isApideckEnabled) {
        console.log('[connect] Using Apideck Vault for connection');
        await openVault();
        return;
      }

      // Legacy OAuth flow
      console.log('[connect] Using legacy OAuth for', providerId);
      
      // Use storage-specific OAuth routes (NOT main auth routes)
      const startUrl = providerId === 'google' 
        ? '/api/storage/google/start'    // Storage OAuth route for Google Drive
        : '/api/storage/microsoft/start'; // Storage OAuth route for OneDrive
      
      // Log OAuth route usage for monitoring
      logStorageOAuthRoute(providerId, 'CloudStorage', userId)
      
      const response = await fetch(startUrl, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('[connect] start failed', providerId, response.status)
        throw new Error(`OAuth start failed: ${response.status}`);
      }
      
      // Consistent JSON response pattern
      const { data: { url } } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('OAuth initiation failed:', error);
      
      // Log OAuth flow failure for monitoring
      // Determine error type based on the error
      let errorType: 'oauth_flow_violation' | 'authentication_failure' | 'business_logic_restriction' | 'technical_error' = 'technical_error'
      if (error instanceof Error) {
        if (error.message.includes('Plan required') || error.message.includes('PLAN_REQUIRED')) {
          errorType = 'business_logic_restriction'
        } else if (error.message.includes('Authentication') || error.message.includes('auth')) {
          errorType = 'authentication_failure'
        }
      }
      
      logOAuthFlowCompletion(
        'storage_oauth',
        providerId,
        false,
        userId,
        undefined,
        error instanceof Error ? error.message : 'Unknown error',
        errorType
      )
      
      const providerName = providerId === 'google' ? 'Google Drive' : 'OneDrive';
      
      // Provide specific error messages based on error type
      if (error instanceof Error && (error.message.includes('Plan required') || error.message.includes('PLAN_REQUIRED'))) {
        showError(`${providerName} connection requires subscription`, 'Please upgrade your plan to connect cloud storage accounts.');
      } else {
        showError(`Failed to connect ${providerName}`, 'Please try again or check your internet connection.');
      }
    }
  };



  const disconnectProvider = async (providerId: 'google' | 'microsoft') => {
    try {
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/disconnect'
        : '/api/storage/microsoft/disconnect';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revokeAtProvider: true,
          cancelRunningJobs: true
        })
      });
      
      if (response.ok) {
        // Update UI immediately
        setProviders(prev => 
          prev.map(p => 
            p.id === providerId 
              ? { 
                  ...p, 
                  connected: false, 
                  files: [],
                  folders: [],
                  currentFolderId: 'root',
                  breadcrumbs: [],
                  lastSync: undefined,
                  errorMessage: 'Disconnected by user'
                }
              : p
          )
        );
        
        // Cancel any running batch jobs for this provider
        setBatchJobs(prev => {
          const newMap = new Map(prev);
          const providerName = providerId === 'google' ? 'google' : 'microsoft';
          
          for (const [jobId, job] of newMap.entries()) {
            if (job.provider === providerName && ['pending', 'processing'].includes(job.status)) {
              newMap.set(jobId, { ...job, status: 'cancelled' });
            }
          }
          
          return newMap;
        });
        
        const providerName = providerId === 'google' ? 'Google Drive' : 'OneDrive';
        showSuccess(`Successfully disconnected from ${providerName}`, 'Your cloud storage has been disconnected.');
      } else {
        const error = await response.json();
        showError('Failed to disconnect', error.error?.message || 'Unknown error occurred.');
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      showError('Failed to disconnect', 'Network error occurred. Please try again.');
    }
  };

  const loadFiles = async (providerId: 'google' | 'microsoft', folderId?: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const targetFolderId = folderId || provider.currentFolderId;

    setProviders(prev => 
      prev.map(p => 
        p.id === providerId 
          ? { ...p, loading: true }
          : p
      )
    );

    try {
      // First check connection status
      await checkConnectionStatus();
      
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/list'
        : '/api/storage/microsoft/list';
      
      const params = new URLSearchParams();
      if (targetFolderId !== 'root') {
        params.set('folderId', targetFolderId);
      }
      
      const response = await fetch(`${endpoint}?${params}`);
      
      if (response.ok) {
        const result = await response.json();
        const data = result.data || result;
        
        setProviders(prev => 
          prev.map(p => 
            p.id === providerId 
              ? { 
                  ...p, 
                  files: data.files || [], 
                  folders: data.folders || [],
                  loading: false,
                  currentFolderId: targetFolderId
                }
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
            ? { ...p, loading: false, errorMessage: 'Failed to load files' }
            : p
        )
      );
    }
  };

  const navigateToFolder = async (providerId: 'google' | 'microsoft', folderId: string, folderName?: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    let newBreadcrumbs: BreadcrumbItem[];

    if (folderId === 'root') {
      // Navigate to root - clear breadcrumbs
      newBreadcrumbs = [];
    } else {
      // Check if we're navigating to a folder in the breadcrumbs (going back)
      const breadcrumbIndex = provider.breadcrumbs.findIndex(item => item.id === folderId);
      
      if (breadcrumbIndex >= 0) {
        // Going back to a parent folder
        newBreadcrumbs = provider.breadcrumbs.slice(0, breadcrumbIndex + 1);
      } else {
        // Going forward to a new folder
        newBreadcrumbs = [
          ...provider.breadcrumbs,
          { id: folderId, name: folderName || 'Unknown Folder' }
        ];
      }
    }

    // Update breadcrumbs first
    setProviders(prev => 
      prev.map(p => 
        p.id === providerId 
          ? { ...p, breadcrumbs: newBreadcrumbs }
          : p
      )
    );

    // Then load the folder contents
    await loadFiles(providerId, folderId);
  };

  const handleFolderClick = (providerId: 'google' | 'microsoft', folder: CloudFolder) => {
    navigateToFolder(providerId, folder.id, folder.name);
  };

  const handleBreadcrumbNavigate = (providerId: 'google' | 'microsoft', folderId: string) => {
    navigateToFolder(providerId, folderId);
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
        showSuccess(`Successfully imported ${fileName}`, 'The file has been added to your document library.');
      } else {
        throw new Error('Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      showError(`Failed to import ${fileName}`, 'Please try again or check your connection.');
    } finally {
      setImportingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const startBatchImport = async (providerId: 'google' | 'microsoft', folderId?: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const targetFolderId = folderId || provider.currentFolderId;
    try {
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/import/batch'
        : '/api/storage/microsoft/import/batch';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          folderId: targetFolderId,
          batchSize: 5,
          maxRetries: 3
        })
      });

      if (response.ok) {
        const result = await response.json();
        const job: ImportJob = result.data;
        
        setBatchJobs(prev => new Map(prev).set(job.jobId, job));
        
        // Start polling for progress
        pollJobProgress(job.jobId, providerId);
      } else {
        const error = await response.json();
        showError('Failed to start batch import', error.error?.message || 'Unknown error occurred.');
      }
    } catch (error) {
      console.error('Batch import error:', error);
      showError('Failed to start batch import', 'Please try again or check your connection.');
    }
  };

  const pollJobProgress = useCallback(async (jobId: string, providerId: 'google' | 'microsoft') => {
    const endpoint = providerId === 'google' 
      ? '/api/storage/google/import/batch'
      : '/api/storage/microsoft/import/batch';
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${endpoint}?jobId=${jobId}`);
        
        if (response.ok) {
          const result = await response.json();
          const job: ImportJob = result.data;
          
          setBatchJobs(prev => new Map(prev).set(jobId, job));
          
          // Stop polling if job is complete
          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            clearInterval(pollInterval);
          }
        } else {
          console.error('Failed to fetch job status');
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling job progress:', error);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup interval after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
  }, []);

  const cancelBatchImport = async (jobId: string, providerId: 'google' | 'microsoft') => {
    try {
      const endpoint = providerId === 'google' 
        ? '/api/storage/google/import/batch'
        : '/api/storage/microsoft/import/batch';
      
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId })
      });

      if (response.ok) {
        setBatchJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { ...job, status: 'cancelled' });
          }
          return newMap;
        });
      } else {
        const error = await response.json();
        showError('Failed to cancel job', error.error?.message || 'Unknown error occurred.');
      }
    } catch (error) {
      console.error('Cancel job error:', error);
      showError('Failed to cancel job', 'Please try again or check your connection.');
    }
  };

  // Handle Google Picker file selection
  const handleGoogleFilesSelected = async (files: SelectedFile[]) => {
    // Check if Google Drive is still connected
    const googleProvider = providers.find(p => p.id === 'google');
    if (!googleProvider?.connected) {
      showError(
        'Google Drive not connected',
        'Please reconnect your Google Drive account to continue.'
      );
      return;
    }

    setIsProcessingPickerFiles(true);
    
    try {
      const response = await fetch('/api/storage/google/register-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ files })
      });

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error('Authentication expired. Please reconnect your Google Drive account.');
        } else if (response.status === 403) {
          throw new Error('Access denied. Please check your Google Drive permissions.');
        }
        throw new Error('Failed to register selected files');
      }

      const { data } = await response.json();
      
      // Show detailed success message with file breakdown
      const fileNames = files.length <= 3 
        ? files.map(f => f.name).join(', ')
        : `${files.slice(0, 2).map(f => f.name).join(', ')} and ${files.length - 2} more`;
      
      showSuccess(
        `Successfully added ${files.length} file${files.length > 1 ? 's' : ''} for processing`,
        `Files: ${fileNames}. They will appear in your document library shortly.`
      );
      
      // Refresh the file list to show any updates
      const googleProvider = providers.find(p => p.id === 'google');
      if (googleProvider?.connected) {
        await loadFiles('google');
      }
      
    } catch (error) {
      console.error('Failed to process selected files:', error);
      showError(
        'Failed to add selected files', 
        'Please try again or check your connection.'
      );
    } finally {
      setIsProcessingPickerFiles(false);
    }
  };

  // Handle Google Picker errors
  const handlePickerError = (error: string) => {
    console.error('Google Picker error:', error);
    
    // Check connection status first
    const googleProvider = providers.find(p => p.id === 'google');
    if (!googleProvider?.connected) {
      showError(
        'Google Drive not connected',
        'Please reconnect your Google Drive account to use the file picker.'
      );
      return;
    }
    
    // Provide user-friendly error messages based on error type
    let userMessage = 'File selection failed. Please try again.';
    let description = error;
    
    if (error.includes('token') || error.includes('auth')) {
      userMessage = 'Authentication expired';
      description = 'Your Google Drive session has expired. Please disconnect and reconnect your account.';
    } else if (error.includes('API') || error.includes('picker')) {
      userMessage = 'Failed to load file picker';
      description = 'Please check your internet connection and try again.';
    } else if (error.includes('network') || error.includes('fetch')) {
      userMessage = 'Network error';
      description = 'Please check your internet connection and try again.';
    } else if (error.includes('permission') || error.includes('access')) {
      userMessage = 'Access denied';
      description = 'Please check your Google Drive permissions or try reconnecting your account.';
    }
    
    showError(userMessage, description);
  };

  const getJobStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getFileStatusIcon = (status: ImportFileStatus['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-400" />;
      case 'processing':
        return <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-400" />;
      case 'skipped':
        return <AlertCircle className="w-3 h-3 text-orange-400" />;
      case 'duplicate':
        return <AlertCircle className="w-3 h-3 text-gray-400" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
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
        <h2 className="text-xl font-semibold text-white mb-4">Cloud Storage</h2>
        <p className="text-gray-300">Connect your cloud storage accounts to import documents</p>
      </div>



      {/* Debug Section - Development Only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white">Debug Information</h3>
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/integrations/apideck/test');
                  const result = await response.json();
                  console.log('Apideck Test Results:', result);
                  alert(`Test completed. Check console for details. Status: ${result.status}`);
                } catch (error) {
                  console.error('Test failed:', error);
                  alert('Test failed. Check console for details.');
                }
              }}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Run Apideck Test
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Apideck Enabled:</span>
              <span className={isApideckEnabled ? 'text-green-400' : 'text-red-400'}>
                {isApideckEnabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Vault Loading:</span>
              <span className={isVaultLoading ? 'text-yellow-400' : 'text-gray-400'}>
                {isVaultLoading ? 'Yes' : 'No'}
              </span>
            </div>
            {vaultError && (
              <div className="flex justify-between">
                <span className="text-gray-400">Vault Error:</span>
                <span className="text-red-400 text-xs">{vaultError}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Plan Access:</span>
              <span className={planStatus?.hasStorageAccess ? 'text-green-400' : 'text-red-400'}>
                {planStatus?.hasStorageAccess ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Plan Access Banner */}
      {planStatus && !planStatus.hasStorageAccess && showPlanBanner && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <CreditCard className="w-5 h-5 text-yellow-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-200 mb-1">Cloud Storage Requires Subscription</h4>
                <p className="text-yellow-100/80 mb-3">
                  Connect Google Drive and OneDrive to import your documents. This feature is available with our Pro plans.
                </p>
                <a 
                  href="/briefly/app/billing?reason=cloud-storage" 
                  className="inline-flex items-center px-3 py-1.5 bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 transition-colors font-medium"
                >
                  Upgrade or Start Trial →
                </a>
              </div>
            </div>
            <button
              onClick={() => setShowPlanBanner(false)}
              className="text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {providers.map((provider) => (
        <div key={provider.id} className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{provider.icon}</span>
              <div>
                <h3 className="text-lg font-medium text-white">{provider.name}</h3>
                <div className="text-sm">
                  {provider.connected ? (
                    <div>
                      <p className="text-green-400">Connected</p>
                      {provider.lastSync && (
                        <p className="text-xs text-gray-400">
                          Last sync: {new Date(provider.lastSync).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-400">Not connected</p>
                      {provider.errorMessage && (
                        <p className="text-xs text-red-400" title={provider.errorMessage}>
                          {provider.errorMessage.length > 30 
                            ? `${provider.errorMessage.substring(0, 30)}...` 
                            : provider.errorMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {provider.connected ? (
                <>
                  <button
                    onClick={() => loadFiles(provider.id)}
                    disabled={provider.loading}
                    className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 hover:text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${provider.loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={() => disconnectProvider(provider.id)}
                    className="px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connectProvider(provider.id)}
                  disabled={(planStatus && !planStatus.hasStorageAccess) || isVaultLoading}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-colors shadow-lg ${
                    (planStatus && !planStatus.hasStorageAccess) || isVaultLoading
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isVaultLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Cloud className="w-4 h-4" />
                  )}
                  <span>
                    {isVaultLoading 
                      ? 'Opening...' 
                      : planStatus && !planStatus.hasStorageAccess 
                        ? 'Requires Subscription' 
                        : 'Connect'
                    }
                  </span>
                </button>
              )}
            </div>
          </div>

          {provider.connected && (
            <div className="space-y-4">
              {/* Breadcrumb Navigation */}
              <div className="flex items-center justify-between">
                <Breadcrumb
                  items={provider.breadcrumbs}
                  onNavigate={(folderId) => handleBreadcrumbNavigate(provider.id, folderId)}
                  className="flex-1"
                />
                {(provider.files.length > 0 || provider.folders.length > 0) && !provider.loading && (
                  <button
                    onClick={() => startBatchImport(provider.id)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>Import This Folder</span>
                  </button>
                )}
              </div>

              {/* Sync Manager - Show for connected providers */}
              {isApideckEnabled && (
                <SyncManager
                  provider={provider.id === 'google' ? 'gdrive' : provider.id === 'microsoft' ? 'onedrive' : 'dropbox'}
                  providerName={provider.name}
                />
              )}

              {/* Google Picker Integration - Only show for Google Drive */}
              {provider.id === 'google' && (
                <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                  <div className="flex-1">
                    <h5 className="text-sm font-medium text-white mb-1">Quick File Selection</h5>
                    <p className="text-xs text-gray-400">
                      Use Google's file picker to quickly select specific files from anywhere in your Drive
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {isProcessingPickerFiles && (
                      <div className="flex items-center space-x-2 text-sm text-gray-300">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processing files...</span>
                      </div>
                    )}
                    <GooglePicker
                      onFilesSelected={handleGoogleFilesSelected}
                      onError={handlePickerError}
                      disabled={isProcessingPickerFiles || (planStatus && !planStatus.hasStorageAccess)}
                      userId={userId}
                    />
                  </div>
                </div>
              )}

              {provider.loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                  <p className="text-gray-300">Loading files...</p>
                </div>
              ) : (provider.files.length > 0 || provider.folders.length > 0) ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white">
                      {provider.folders.length > 0 && provider.files.length > 0 
                        ? `${provider.folders.length} folders, ${provider.files.length} files`
                        : provider.folders.length > 0 
                        ? `${provider.folders.length} folders`
                        : `${provider.files.length} files`
                      }
                    </h4>
                  </div>

                  {/* Folders */}
                  {provider.folders.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-gray-300">Folders</h5>
                      {provider.folders.map((folder) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700/30 hover:bg-gray-700/50 cursor-pointer transition-colors"
                          onClick={() => handleFolderClick(provider.id, folder)}
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <div className="w-8 h-8 bg-blue-600/20 rounded flex items-center justify-center">
                              <Folder className="w-4 h-4 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {folder.name}
                              </p>
                              <p className="text-xs text-gray-400">
                                Folder
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {folder.webViewLink && (
                              <a
                                href={folder.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-gray-200 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <FolderOpen className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Files */}
                  {provider.files.length > 0 && (
                    <div className="space-y-2">
                      {provider.folders.length > 0 && (
                        <h5 className="text-sm font-medium text-gray-300">Files</h5>
                      )}
                      {provider.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700/30"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center">
                          <Cloud className="w-4 h-4 text-gray-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-400">
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
                            className="text-gray-400 hover:text-gray-200 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => importFile(provider.id, file.id, file.name)}
                          disabled={importingFiles.has(file.id)}
                          className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  )}

                  {/* Batch Import Jobs */}
                  {Array.from(batchJobs.values())
                    .filter(job => job.provider === (provider.id === 'google' ? 'google' : 'microsoft'))
                    .map((job) => (
                    <div key={job.jobId} className="mt-6 p-4 bg-gray-800/70 rounded-xl border border-gray-600/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          {getJobStatusIcon(job.status)}
                          <div>
                            <h5 className="font-medium text-white">Batch Import Job</h5>
                            <p className="text-xs text-gray-400">
                              Started {new Date(job.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setShowJobDetails(showJobDetails === job.jobId ? null : job.jobId)}
                            className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                          >
                            {showJobDetails === job.jobId ? 'Hide Details' : 'Show Details'}
                          </button>
                          {['pending', 'processing'].includes(job.status) && (
                            <button
                              onClick={() => cancelBatchImport(job.jobId, provider.id)}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-sm text-gray-300 mb-1">
                          <span>Progress: {job.progress.percentage}%</span>
                          <span>
                            {job.progress.processed + job.progress.failed + job.progress.skipped} / {job.progress.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress.percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Current File */}
                      {job.progress.current_file && job.status === 'processing' && (
                        <div className="mb-3 text-sm text-gray-300">
                          <span className="text-gray-400">Processing:</span> {job.progress.current_file}
                        </div>
                      )}

                      {/* Summary Stats */}
                      <div className="grid grid-cols-4 gap-4 text-center text-sm">
                        <div>
                          <div className="text-green-400 font-medium">{job.progress.processed}</div>
                          <div className="text-gray-400">Processed</div>
                        </div>
                        <div>
                          <div className="text-red-400 font-medium">{job.progress.failed}</div>
                          <div className="text-gray-400">Failed</div>
                        </div>
                        <div>
                          <div className="text-orange-400 font-medium">{job.progress.skipped}</div>
                          <div className="text-gray-400">Skipped</div>
                        </div>
                        <div>
                          <div className="text-gray-400 font-medium">{job.progress.total}</div>
                          <div className="text-gray-400">Total</div>
                        </div>
                      </div>

                      {/* Final Results */}
                      {job.status === 'completed' && job.outputData && (
                        <div className="mt-3 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
                          <div className="text-green-400 font-medium mb-2">Import Completed!</div>
                          <div className="text-sm text-gray-300">
                            Successfully processed {job.outputData.processedFiles} files
                            {job.outputData.duplicateFiles > 0 && `, skipped ${job.outputData.duplicateFiles} duplicates`}
                            {job.outputData.failedFiles > 0 && `, ${job.outputData.failedFiles} failed`}
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {job.status === 'failed' && job.errorMessage && (
                        <div className="mt-3 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                          <div className="text-red-400 font-medium mb-2">Import Failed</div>
                          <div className="text-sm text-gray-300">{job.errorMessage}</div>
                        </div>
                      )}

                      {/* File Details */}
                      {showJobDetails === job.jobId && job.fileStatuses.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <h6 className="font-medium text-white">File Status Details</h6>
                          <div className="max-h-60 overflow-y-auto space-y-1">
                            {job.fileStatuses.map((fileStatus, index) => (
                              <div
                                key={`${fileStatus.fileId}-${index}`}
                                className="flex items-center justify-between p-2 bg-gray-700/50 rounded text-sm"
                              >
                                <div className="flex items-center space-x-2 flex-1 min-w-0">
                                  {getFileStatusIcon(fileStatus.status)}
                                  <span className="text-white truncate">{fileStatus.fileName}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    fileStatus.status === 'completed' ? 'bg-green-600 text-white' :
                                    fileStatus.status === 'failed' ? 'bg-red-600 text-white' :
                                    fileStatus.status === 'processing' ? 'bg-blue-600 text-white' :
                                    fileStatus.status === 'duplicate' ? 'bg-gray-600 text-white' :
                                    'bg-yellow-600 text-white'
                                  }`}>
                                    {fileStatus.status}
                                  </span>
                                  {fileStatus.error && (
                                    <span className="text-red-400 text-xs" title={fileStatus.error}>
                                      <AlertCircle className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p>No files or folders found</p>
                  <p className="text-sm">Click "Refresh" to load your content</p>
                </div>
              )}
            </div>
          )}

          {!provider.connected && (
            <div className="text-center py-8 text-gray-400">
              <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p>Connect your {provider.name} account to import files</p>
              {provider.id === 'google' && (
                <p className="text-sm text-gray-500 mt-2">
                  Once connected, you'll be able to browse folders and use the quick file picker
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
