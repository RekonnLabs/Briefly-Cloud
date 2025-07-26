import React, { useState, useEffect } from 'react';
import { Progress } from './ui/progress';
import { Card, CardContent } from './ui/card';
import { Loader2, CheckCircle, AlertCircle, FileText, Brain } from 'lucide-react';

interface IndexingProgressProps {
  jobId: string | null;
  onComplete: () => void;
  onError: (error: string) => void;
}

interface IndexingStatus {
  status: string;
  progress: number;
  message: string;
  files_processed: number;
  total_files: number;
  skipped_files?: Array<{
    name: string;
    mime_type: string;
    reason: string;
  }>;
}

export default function IndexingProgress({ jobId, onComplete, onError }: IndexingProgressProps) {
  const [status, setStatus] = useState<IndexingStatus>({
    status: 'pending',
    progress: 0,
    message: 'Starting...',
    files_processed: 0,
    total_files: 0
  });

  useEffect(() => {
    if (!jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/embed/status/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data);

          if (data.status === 'completed') {
            clearInterval(pollInterval);
            setTimeout(() => onComplete(), 1000);
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            onError(data.message || 'Indexing failed');
          }
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    }, 2000);

    // Cleanup on unmount
    return () => clearInterval(pollInterval);
  }, [jobId, onComplete, onError]);

  const getStatusIcon = () => {
    switch (status.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      default:
        return <Brain className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'processing':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatStatusMessage = () => {
    if (status.status === 'processing' && status.total_files > 0) {
      return `Processing ${status.files_processed} of ${status.total_files} files...`;
    }
    return status.message;
  };

  if (!jobId) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div className="flex-1">
              <h3 className="font-medium">Document Indexing</h3>
              <p className={`text-sm ${getStatusColor()}`}>
                {formatStatusMessage()}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          {status.status === 'processing' && (
            <div className="space-y-2">
              <Progress value={status.progress * 100} className="h-2" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{Math.round(status.progress * 100)}% complete</span>
                {status.total_files > 0 && (
                  <span>{status.files_processed}/{status.total_files} files</span>
                )}
              </div>
            </div>
          )}

          {/* File Processing Details */}
          {status.status === 'processing' && status.total_files > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span>
                {status.files_processed > 0 
                  ? `${status.files_processed} files processed` 
                  : 'Scanning files...'
                }
              </span>
            </div>
          )}

          {/* Skipped Files */}
          {status.skipped_files && status.skipped_files.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {status.skipped_files.length} files skipped
                </span>
              </div>
              <div className="space-y-1">
                {status.skipped_files.slice(0, 3).map((file, index) => (
                  <p key={index} className="text-xs text-yellow-700">
                    • {file.name} - {file.reason}
                  </p>
                ))}
                {status.skipped_files.length > 3 && (
                  <p className="text-xs text-yellow-600">
                    ... and {status.skipped_files.length - 3} more
                  </p>
                )}
              </div>
              <p className="text-xs text-yellow-600 mt-2">
                Supported formats: PDF, DOCX, XLSX, PPTX, TXT, JSON
              </p>
            </div>
          )}

          {/* Success Message */}
          {status.status === 'completed' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Indexing Complete!
                </span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Your documents are now ready for AI-powered search and chat.
              </p>
            </div>
          )}

          {/* Error Message */}
          {status.status === 'failed' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  Indexing Failed
                </span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                {status.message}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

