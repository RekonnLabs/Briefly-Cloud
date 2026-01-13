"use client";

import { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from './ui/toast';

interface SyncResult {
  indexed: Array<{
    id: string;
    name: string;
    fileRecordId: string;
    reasons: string[];
  }>;
  skipped: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  failed: Array<{
    id: string;
    name: string;
    error: string;
  }>;
}

interface CheckResult {
  new: Array<{ id: string; name: string }>;
  updated: Array<{ id: string; name: string; reasons: string[] }>;
  unchanged: Array<{ id: string; name: string }>;
  deleted: Array<{ id: string }>;
}

interface SyncManagerProps {
  provider: 'gdrive' | 'onedrive' | 'dropbox';
  providerName: string;
}

export function SyncManager({ provider, providerName }: SyncManagerProps) {
  const { showSuccess, showError } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleCheck = async () => {
    setIsChecking(true);
    setCheckResult(null);
    setSyncResult(null);

    try {
      const response = await fetch(`/api/sync/${provider}/check`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to check for changes (${response.status})`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to check for changes');
      }

      setCheckResult(data.results);
      
      const totalChanges = data.summary.new + data.summary.updated + data.summary.deleted;
      
      if (totalChanges === 0) {
        showSuccess('No changes detected', 'All files are up to date');
      } else {
        showSuccess(
          `Found ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`,
          `${data.summary.new} new, ${data.summary.updated} updated, ${data.summary.deleted} deleted`
        );
      }
    } catch (error: any) {
      console.error('[SYNC_CHECK] Error:', error);
      showError('Sync check failed', error.message);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSync = async () => {
    if (!checkResult) {
      showError('No check results', 'Please check for changes first');
      return;
    }

    const filesToSync = [
      ...checkResult.new.map(f => f.id),
      ...checkResult.updated.map(f => f.id)
    ];

    const deletedIds = checkResult.deleted.map(f => f.id);

    if (filesToSync.length === 0 && deletedIds.length === 0) {
      showError('Nothing to sync', 'No changes to process');
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch(`/api/sync/${provider}/index`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileIds: filesToSync.length > 0 ? filesToSync : undefined,
          deletedIds: deletedIds.length > 0 ? deletedIds : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to sync files (${response.status})`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to sync files');
      }

      setSyncResult(data.results);
      setLastSyncTime(data.timestamp);
      
      const { indexed, failed } = data.summary;
      
      if (failed > 0) {
        showError(
          `Sync completed with errors`,
          `${indexed} indexed, ${failed} failed`
        );
      } else {
        showSuccess(
          'Sync completed successfully',
          `${indexed} file${indexed !== 1 ? 's' : ''} indexed`
        );
      }

      // Clear check results after successful sync
      setCheckResult(null);
    } catch (error: any) {
      console.error('[SYNC_INDEX] Error:', error);
      showError('Sync failed', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalChanges = checkResult
    ? checkResult.new.length + checkResult.updated.length + checkResult.deleted.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Sync Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-3">
          <RefreshCw className={`w-5 h-5 ${isChecking || isSyncing ? 'animate-spin' : ''}`} />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              {providerName} Sync
            </h3>
            {lastSyncTime && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last synced: {new Date(lastSyncTime).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleCheck}
            disabled={isChecking || isSyncing}
            variant="outline"
            size="sm"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Check for Changes
              </>
            )}
          </Button>

          {checkResult && totalChanges > 0 && (
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              size="sm"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Sync {totalChanges} Change{totalChanges !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Check Results */}
      {checkResult && (
        <div className="space-y-3">
          {checkResult.new.length > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                <h4 className="font-medium text-green-900 dark:text-green-100">
                  New Files ({checkResult.new.length})
                </h4>
              </div>
              <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
                {checkResult.new.slice(0, 5).map(file => (
                  <li key={file.id} className="truncate">• {file.name}</li>
                ))}
                {checkResult.new.length > 5 && (
                  <li className="text-green-600 dark:text-green-400">
                    ... and {checkResult.new.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {checkResult.updated.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  Updated Files ({checkResult.updated.length})
                </h4>
              </div>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                {checkResult.updated.slice(0, 5).map(file => (
                  <li key={file.id} className="truncate">
                    • {file.name}
                    {file.reasons.length > 0 && (
                      <span className="text-blue-600 dark:text-blue-400 ml-2">
                        ({file.reasons[0]})
                      </span>
                    )}
                  </li>
                ))}
                {checkResult.updated.length > 5 && (
                  <li className="text-blue-600 dark:text-blue-400">
                    ... and {checkResult.updated.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {checkResult.unchanged.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  Unchanged Files ({checkResult.unchanged.length})
                </h4>
              </div>
            </div>
          )}

          {checkResult.deleted.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h4 className="font-medium text-red-900 dark:text-red-100">
                  Deleted Files ({checkResult.deleted.length})
                </h4>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">
                These files will be marked as deleted in the database
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sync Results */}
      {syncResult && (
        <div className="space-y-3">
          {syncResult.indexed.length > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                <h4 className="font-medium text-green-900 dark:text-green-100">
                  Successfully Indexed ({syncResult.indexed.length})
                </h4>
              </div>
              <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
                {syncResult.indexed.slice(0, 5).map(file => (
                  <li key={file.id} className="truncate">
                    ✓ {file.name}
                  </li>
                ))}
                {syncResult.indexed.length > 5 && (
                  <li className="text-green-600 dark:text-green-400">
                    ... and {syncResult.indexed.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {syncResult.failed.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h4 className="font-medium text-red-900 dark:text-red-100">
                  Failed ({syncResult.failed.length})
                </h4>
              </div>
              <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
                {syncResult.failed.map(file => (
                  <li key={file.id} className="truncate">
                    ✗ {file.name}: {file.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
